// Private agent gateway. Browsers never reach a model provider directly: they
// call this function, which verifies the session, enforces RBAC and approval
// levels L0-L4, refuses to route data above the provider's clearance, and
// records every attempt in `agent_runs`.
//
// Provider credentials live only in Edge Function secrets:
//   supabase secrets set GEMINI_API_KEY=...
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const PREVIEW_LIMIT = 280;

type Provider = {
  id: string;
  kind: 'external' | 'local';
  endpoint: string;
  chat_model: string;
  embedding_model: string | null;
  max_classification: string;
  enabled: boolean;
  requests_per_hour: number;
  requests_per_day: number;
};

type Agent = {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  provider_id: string;
  classification: string;
  approval_level: number;
  system_prompt: string | null;
};

type Run = {
  id: string;
  agent_id: string;
  provider_id: string;
  requested_by: string;
  classification: string;
  approval_level: number;
  approval_state: string;
  run_state: string;
};

type AgentTool = {
  id: string;
  operation: 'read' | 'create' | 'update' | 'publish';
  approval_level: number;
  input_schema: { required?: string[] };
  enabled: boolean;
};

const rank: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const secureEqual = (left: string, right: string) => {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
};

// Prompts are correlated by hash so a run is auditable without storing the
// company text that produced it.
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function callGemini(provider: Provider, systemPrompt: string | null, input: string) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('provider_key_missing');
  const response = await fetch(`${provider.endpoint}/models/${provider.chat_model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input }] }],
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `provider_http_${response.status}`);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
  return { text, tokens: payload?.usageMetadata?.totalTokenCount ?? null };
}

async function callOllama(provider: Provider, systemPrompt: string | null, input: string) {
  const originToken = Deno.env.get('OLLAMA_ORIGIN_TOKEN');
  if (!originToken) throw new Error('ollama_origin_token_missing');
  const response = await fetch(`${provider.endpoint}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-reid-origin-token': originToken,
      ...(Deno.env.get('CF_ACCESS_CLIENT_ID') ? { 'CF-Access-Client-Id': Deno.env.get('CF_ACCESS_CLIENT_ID')! } : {}),
      ...(Deno.env.get('CF_ACCESS_CLIENT_SECRET') ? { 'CF-Access-Client-Secret': Deno.env.get('CF_ACCESS_CLIENT_SECRET')! } : {}),
    },
    body: JSON.stringify({
      model: provider.chat_model,
      stream: false,
      think: false,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: input },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || `provider_http_${response.status}`);
  const promptTokens = payload?.prompt_eval_count ?? 0;
  const answerTokens = payload?.eval_count ?? 0;
  return { text: payload?.message?.content || '', tokens: promptTokens + answerTokens || null };
}

async function embed(provider: Provider, input: string) {
  if (!provider.embedding_model) throw new Error('provider_has_no_embedding_model');
  if (provider.id === 'ollama') {
    const originToken = Deno.env.get('OLLAMA_ORIGIN_TOKEN');
    if (!originToken) throw new Error('ollama_origin_token_missing');
    const response = await fetch(`${provider.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-reid-origin-token': originToken,
        ...(Deno.env.get('CF_ACCESS_CLIENT_ID') ? { 'CF-Access-Client-Id': Deno.env.get('CF_ACCESS_CLIENT_ID')! } : {}),
        ...(Deno.env.get('CF_ACCESS_CLIENT_SECRET') ? { 'CF-Access-Client-Secret': Deno.env.get('CF_ACCESS_CLIENT_SECRET')! } : {}),
      },
      body: JSON.stringify({ model: provider.embedding_model, prompt: input }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || `provider_http_${response.status}`);
    return payload.embedding as number[];
  }
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('provider_key_missing');
  const response = await fetch(`${provider.endpoint}/models/${provider.embedding_model}:embedContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    // memories.embedding is vector(768); this model returns 3072 unless truncated.
    body: JSON.stringify({ content: { parts: [{ text: input }] }, outputDimensionality: 768 }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `provider_http_${response.status}`);
  return payload?.embedding?.values as number[];
}

async function rows(admin: ReturnType<typeof createClient>, table: string, columns: string, order = 'created_at') {
  const query = admin.from(table).select(columns).order(order, { ascending: false }).limit(30);
  const { data, error } = await query;
  if (error) throw new Error(`tool_${table}_failed`);
  return data || [];
}

// Real, bounded company tools. The model never receives a database credential
// and cannot choose arbitrary tables or columns: each agent has a fixed server-
// side allow-list. Write actions remain behind the existing L2/L3 approval path.
async function scopedMemories(admin: ReturnType<typeof createClient>, agentId: string, requesterId: string, args: Record<string, unknown> = {}) {
  const allowed = new Map<string, Set<string>>([
    ['agent', new Set([agentId])], ['company', new Set(['reid'])], ['user', new Set([requesterId])],
  ]);
  if (typeof args.project_id === 'string') allowed.set('project', new Set([args.project_id]));
  if (typeof args.department_id === 'string') allowed.set('department', new Set([args.department_id]));
  const { data, error } = await admin.from('memories')
    .select('scope,scope_id,title,content,classification,created_at').order('created_at', { ascending: false }).limit(120);
  if (error) throw new Error('tool_memories_failed');
  return (data || []).filter(memory => allowed.get(memory.scope)?.has(memory.scope_id)).slice(0, 24);
}

async function buildAgentContext(admin: ReturnType<typeof createClient>, agentId: string, requesterId: string, args: Record<string, unknown> = {}) {
  const context: Record<string, unknown> = {};
  if (['ceo', 'operations', 'analytics'].includes(agentId)) {
    context.projects = await rows(admin, 'projects', 'id,name,type,status,budget,currency,start_date,target_date,manager_id', 'updated_at');
    context.tasks = await rows(admin, 'tasks', 'id,title,status,priority,due_at,project_id,research_id,assignee_id');
  }
  if (['ceo', 'sales', 'support'].includes(agentId)) {
    context.leads = await rows(admin, 'crm_leads', 'id,title,stage,estimated_value,probability,next_follow_up_at,owner_id', 'updated_at');
    context.deals = await rows(admin, 'crm_deals', 'id,title,stage,value,currency,expected_close_date,owner_id', 'updated_at');
    context.followUps = await rows(admin, 'crm_activities', 'id,activity_type,subject,due_at,completed_at,owner_id');
  }
  if (agentId === 'hr') {
    context.people = await rows(admin, 'profiles', 'id,full_name,email,department,position,employment_status,hire_date', 'updated_at');
    context.applications = await rows(admin, 'applications', 'id,full_name,email,organization,title,account_type,join_reason,cover_letter,status,cv_path');
    context.documents = await rows(admin, 'employee_documents', 'id,owner_id,title,category,storage_path');
  }
  if (agentId === 'finance') {
    context.budgets = await rows(admin, 'projects', 'id,name,type,status,budget,currency,client_name,start_date,target_date', 'updated_at');
    context.pipeline = await rows(admin, 'crm_deals', 'id,title,stage,value,currency,expected_close_date', 'updated_at');
  }
  if (['marketing', 'content', 'competitor'].includes(agentId)) {
    context.announcements = await rows(admin, 'announcements', 'id,title_ar,title_en,body_ar,body_en,published_at,expires_at');
    context.publicProjects = (await rows(admin, 'projects', 'id,name,type,status,visibility,start_date,target_date', 'updated_at')).filter((project: Record<string, unknown>) => project.visibility === 'public');
  }
  if (agentId === 'knowledge') {
    context.projectDocuments = await rows(admin, 'project_files', 'id,project_id,title,category,restricted,created_at');
    context.researchDocuments = await rows(admin, 'research_documents', 'id,research_id,title,category,restricted,created_at');
  }
  context.memory = await scopedMemories(admin, agentId, requesterId, args);
  return JSON.stringify(context).slice(0, 50000);
}

function requireArguments(tool: AgentTool, args: Record<string, unknown>) {
  for (const field of tool.input_schema?.required || []) {
    if (args[field] === undefined || args[field] === null || args[field] === '') throw new Error(`tool_argument_missing:${field}`);
  }
}

async function executeTool(admin: ReturnType<typeof createClient>, tool: AgentTool, args: Record<string, unknown>, requesterId: string) {
  requireArguments(tool, args);
  const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : null;
  const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  switch (tool.id) {
    case 'projects.list': return rows(admin, 'projects', 'id,name,type,status,budget,currency,start_date,target_date,manager_id', 'updated_at');
    case 'tasks.list': return rows(admin, 'tasks', 'id,title,status,priority,due_at,project_id,research_id,assignee_id');
    case 'crm.pipeline': return {
      leads: await rows(admin, 'crm_leads', 'id,title,stage,estimated_value,probability,next_follow_up_at,owner_id', 'updated_at'),
      deals: await rows(admin, 'crm_deals', 'id,title,stage,value,currency,expected_close_date,owner_id', 'updated_at'),
      followUps: await rows(admin, 'crm_activities', 'id,activity_type,subject,due_at,completed_at,owner_id'),
    };
    case 'people.list': return rows(admin, 'profiles', 'id,full_name,email,department,position,employment_status,hire_date', 'updated_at');
    case 'applications.list': return rows(admin, 'applications', 'id,full_name,email,organization,title,account_type,join_reason,cover_letter,status,cv_path');
    case 'finance.budgets': return {
      projects: await rows(admin, 'projects', 'id,name,status,budget,currency,client_name,target_date', 'updated_at'),
      deals: await rows(admin, 'crm_deals', 'id,title,stage,value,currency,expected_close_date', 'updated_at'),
    };
    case 'content.context': return {
      announcements: await rows(admin, 'announcements', 'id,title_ar,title_en,body_ar,body_en,published_at,expires_at'),
      publicProjects: (await rows(admin, 'projects', 'id,name,type,status,visibility,start_date,target_date', 'updated_at'))
        .filter((project: Record<string, unknown>) => project.visibility === 'public'),
    };
    case 'knowledge.search': {
      const query = text(args.query, 120)?.toLowerCase() || '';
      const [projectDocuments, researchDocuments, memory] = await Promise.all([
        rows(admin, 'project_files', 'id,project_id,title,category,restricted,created_at'),
        rows(admin, 'research_documents', 'id,research_id,title,category,restricted,created_at'),
        scopedMemories(admin, 'knowledge', requesterId, args),
      ]);
      const match = (row: Record<string, unknown>) => JSON.stringify(row).toLowerCase().includes(query);
      return { projectDocuments: projectDocuments.filter(match).slice(0, 12), researchDocuments: researchDocuments.filter(match).slice(0, 12), memory: memory.filter(match).slice(0, 12) };
    }
    case 'tasks.create': {
      const payload = { title: text(args.title, 200), description: text(args.description, 2000), project_id: uuid(args.project_id), research_id: uuid(args.research_id), assignee_id: uuid(args.assignee_id), priority: Math.max(0, Math.min(4, Number(args.priority ?? 2))), due_at: text(args.due_at, 40), created_by: requesterId };
      if (!payload.project_id && !payload.research_id) throw new Error('tool_argument_missing:project_id_or_research_id');
      const result = await admin.from('tasks').insert(payload).select('id,title,status,priority,due_at,project_id,research_id,assignee_id').single();
      if (result.error) throw new Error('tool_tasks_create_failed'); return result.data;
    }
    case 'crm.follow_up.create': {
      const payload = { activity_type: 'task', subject: text(args.subject, 200), company_id: uuid(args.company_id), contact_id: uuid(args.contact_id), lead_id: uuid(args.lead_id), deal_id: uuid(args.deal_id), owner_id: uuid(args.owner_id), due_at: text(args.due_at, 40), notes: text(args.notes, 2000), created_by: requesterId };
      if (![payload.company_id,payload.contact_id,payload.lead_id,payload.deal_id].some(Boolean)) throw new Error('tool_argument_missing:crm_record_id');
      const result = await admin.from('crm_activities').insert(payload).select('id,subject,due_at,owner_id').single();
      if (result.error) throw new Error('tool_crm_follow_up_create_failed'); return result.data;
    }
    case 'onboarding.create': {
      const result = await admin.from('onboarding_items').insert({ user_id: uuid(args.user_id), title_ar: text(args.title_ar, 200), title_en: text(args.title_en, 200), due_date: text(args.due_date, 20), assigned_by: requesterId }).select('id,user_id,title_ar,title_en,due_date,completed').single();
      if (result.error) throw new Error('tool_onboarding_create_failed'); return result.data;
    }
    case 'projects.budget.update': {
      const result = await admin.from('projects').update({ budget: Number(args.budget), ...(text(args.currency, 6) ? { currency: text(args.currency, 6) } : {}) }).eq('id', uuid(args.project_id)).select('id,name,budget,currency').single();
      if (result.error) throw new Error('tool_project_budget_update_failed'); return result.data;
    }
    case 'content.draft.create': {
      const result = await admin.from('content_drafts').insert({ title_ar: text(args.title_ar, 200), title_en: text(args.title_en, 200), body_ar: text(args.body_ar, 5000), body_en: text(args.body_en, 5000), created_by: requesterId }).select('id,status,title_ar,title_en').single();
      if (result.error) throw new Error('tool_content_draft_create_failed'); return result.data;
    }
    case 'content.publish': {
      const draft = await admin.from('content_drafts').select('*').eq('id', uuid(args.draft_id)).eq('status','draft').single();
      if (draft.error) throw new Error('tool_content_draft_not_found');
      const published = await admin.from('announcements').insert({ title_ar:draft.data.title_ar,title_en:draft.data.title_en,body_ar:draft.data.body_ar,body_en:draft.data.body_en,created_by:requesterId }).select('id,published_at').single();
      if (published.error) throw new Error('tool_content_publish_failed');
      await admin.from('content_drafts').update({status:'published',published_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',draft.data.id);
      return published.data;
    }
    default: throw new Error('tool_not_implemented');
  }
}

async function executeRun(admin: ReturnType<typeof createClient>, run: Run, agent: Agent, provider: Provider, action: string, input: string) {
  const startedAt = Date.now();
  await admin.from('agent_runs').update({
    run_state: 'running', status: 'running', started_at: new Date().toISOString(), error: null,
  }).eq('id', run.id);

  if (action === 'embed') {
    const vector = await embed(provider, input);
    await admin.from('agent_runs').update({
      run_state: 'succeeded', status: 'succeeded', latency_ms: Date.now() - startedAt,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { runId: run.id, embedding: vector, dimensions: vector?.length ?? 0 };
  }

  if (action === 'tool') {
    const request = JSON.parse(input) as { toolName: string; arguments?: Record<string, unknown> };
    const assigned = await admin.from('agent_tool_assignments').select('tool:agent_tools(id,operation,approval_level,input_schema,enabled)').eq('agent_id', agent.id).eq('tool_id', request.toolName).single();
    const tool = assigned.data?.tool as unknown as AgentTool | undefined;
    if (assigned.error || !tool?.enabled) throw new Error('tool_not_assigned_or_disabled');
    const result = await executeTool(admin, tool, request.arguments || {}, run.requested_by);
    const resultText = JSON.stringify(result);
    await admin.from('agent_tool_executions').insert({ run_id:run.id,agent_id:agent.id,tool_id:tool.id,requested_by:run.requested_by,arguments_hash:await hash(input),status:'succeeded',result_preview:resultText.slice(0,PREVIEW_LIMIT) });
    await admin.from('agent_runs').update({run_state:'succeeded',status:'succeeded',latency_ms:Date.now()-startedAt,output_preview:resultText.slice(0,PREVIEW_LIMIT),finished_at:new Date().toISOString()}).eq('id',run.id);
    return { runId: run.id, tool: tool.id, result };
  }

  const companyContext = await buildAgentContext(admin, agent.id, run.requested_by);
  const governedInput = `USER REQUEST:\n${input}\n\nAUTHORIZED COMPANY CONTEXT (read-only, bounded for this agent):\n${companyContext}\n\nUse only this context. Never claim an external action was completed. Clearly label recommendations and any action that still needs approval.`;
  const result = provider.kind === 'local'
    ? await callOllama(provider, agent.system_prompt, governedInput)
    : await callGemini(provider, agent.system_prompt, governedInput);
  const latency = Date.now() - startedAt;
  await admin.from('agent_runs').update({
    run_state: 'succeeded', status: 'succeeded', latency_ms: latency,
    token_usage: result.tokens, output_preview: result.text.slice(0, PREVIEW_LIMIT),
    finished_at: new Date().toISOString(),
  }).eq('id', run.id);
  // Agent memory is durable and scoped. A memory failure must not turn a
  // completed model run into a false failure, so it is recorded best-effort.
  try {
    const vector = await embed(provider, result.text.slice(0, 4000));
    await admin.from('memories').insert({
      scope: 'agent', scope_id: agent.id, content: result.text.slice(0, 4000), title: `Run ${run.id}`,
      embedding: vector, classification: run.classification, created_by: run.requested_by, source_run_id: run.id,
    });
  } catch (_) { /* run output remains authoritative */ }
  return { runId: run.id, output: result.text, latencyMs: latency, tokenUsage: result.tokens, provider: provider.id };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let runId: string | null = null;
  try {
    const body = await request.json();
    const internalExpected = Deno.env.get('REID_INTERNAL_GATEWAY_TOKEN') || '';
    const internalSupplied = request.headers.get('x-reid-internal-token') || '';
    const internal = body.source === 'whatsapp' && internalExpected && internalSupplied
      ? secureEqual(internalExpected, internalSupplied) : false;
    const authorization = request.headers.get('Authorization');
    let requesterId = '';
    let caller: ReturnType<typeof createClient> | null = null;
    if (internal) {
      requesterId = typeof body.requesterId === 'string' ? body.requesterId : (Deno.env.get('WHATSAPP_OWNER_USER_ID') || '');
      if (!requesterId) throw new Error('whatsapp_owner_not_configured');
      const ownerRole = await admin.from('user_roles').select('role').eq('user_id', requesterId).eq('role', 'owner').maybeSingle();
      if (!ownerRole.data) throw new Error('whatsapp_owner_invalid');
    } else {
      if (!authorization) throw new Error('missing_authorization');
      caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: auth, error: authError } = await caller.auth.getUser();
      if (authError || !auth.user) throw new Error('invalid_session');
      requesterId = auth.user.id;
    }

    // A suspended account keeps its JWT until expiry, so re-check the control row.
    const control = await admin.from('account_controls').select('status').eq('user_id', requesterId).maybeSingle();
    if (control.data?.status && control.data.status !== 'active') throw new Error('account_not_active');

    const action: string = body.action || 'run';
    const input: string = action === 'tool'
      ? JSON.stringify({ toolName: body.toolName || '', arguments: body.arguments || {} })
      : (body.input || '').toString();

    if (action === 'approve' || action === 'reject') {
      const decision = action === 'approve' ? 'approved' : 'rejected';
      let approved: Run;
      if (internal) {
        const pending = await admin.from('agent_runs').select('*').eq('id',body.runId).eq('approval_state','pending').single();
        if (pending.error) throw new Error('run_not_pending');
        const update = await admin.from('agent_runs').update({
          approval_state:decision, approved_by:requesterId, approved_at:new Date().toISOString(),
          run_state:decision === 'approved' ? 'queued' : 'cancelled',
          status:decision === 'approved' ? 'queued' : 'cancelled',
        }).eq('id',body.runId).eq('approval_state','pending').select().single();
        if (update.error) throw update.error;
        approved = update.data as Run;
      } else {
        const decided = await caller!.rpc('approve_agent_run', { run_id: body.runId, decision, note: body.note || null });
        if (decided.error) throw decided.error;
        approved = decided.data as Run;
      }
      runId = approved.id;
      if (decision === 'rejected') {
        await admin.from('agent_run_payloads').delete().eq('run_id', approved.id);
        return Response.json({ runId: approved.id, status: 'cancelled' }, { headers: cors });
      }

      const [{ data: resumedAgent, error: resumedAgentError }, { data: resumedProvider, error: resumedProviderError }, { data: payload, error: payloadError }] = await Promise.all([
        admin.from('agents').select('id,name,status,enabled,provider_id,classification,approval_level,system_prompt').eq('id', approved.agent_id).single(),
        admin.from('llm_providers').select('id,kind,endpoint,chat_model,embedding_model,max_classification,enabled,requests_per_hour,requests_per_day').eq('id', approved.provider_id).single(),
        admin.from('agent_run_payloads').select('action,input').eq('run_id', approved.id).single(),
      ]);
      if (resumedAgentError) throw resumedAgentError;
      if (resumedProviderError) throw resumedProviderError;
      if (payloadError) throw payloadError;
      if ((resumedProvider as Provider).kind === 'local' && payload.action !== 'tool') {
        await admin.from('agent_runs').update({run_state:'queued',status:'queued',started_at:null}).eq('id',approved.id);
        return Response.json({runId:approved.id,status:'queued',provider:resumedProvider.id},{headers:cors});
      }
      const result = await executeRun(admin, approved, resumedAgent as Agent, resumedProvider as Provider, payload.action, payload.input);
      await admin.from('agent_run_payloads').delete().eq('run_id', approved.id);
      return Response.json(result, { headers: cors });
    }

    if (!input.trim()) throw new Error('empty_input');

    // Reading the agent through the caller applies `agents_admin_read`, so a
    // non-admin session cannot execute an agent at all.
    const { data: agentRow, error: agentError } = await (internal ? admin : caller!)
      .from('agents')
      .select('id,name,status,enabled,provider_id,classification,approval_level,system_prompt')
      .eq('id', body.agentId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agentRow) throw new Error('agent_not_found_or_forbidden');
    const agent = agentRow as Agent;
    if (!agent.enabled) throw new Error('agent_disabled');
    if (agent.status === 'paused') throw new Error('agent_paused');

    const { data: providerRow, error: providerError } = await admin
      .from('llm_providers')
      .select('id,kind,endpoint,chat_model,embedding_model,max_classification,enabled,requests_per_hour,requests_per_day')
      .eq('id', agent.provider_id)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!providerRow) throw new Error('provider_not_found');
    let provider = providerRow as Provider;
    if (!provider.enabled) throw new Error('provider_disabled');

    // Ollama is primary, but ai-lap may be powered off or lose Internet. A
    // fresh heartbeat selects local execution; otherwise use the explicitly
    // Owner-authorized Gemini provider whose clearance is still enforced below.
    // This never silently crosses a classification boundary.
    if (provider.kind === 'local' && action !== 'tool') {
      const heartbeat = await admin.from('agent_runner_status').select('last_seen_at,status').eq('id','ai-lap').maybeSingle();
      const fresh = !heartbeat.error && heartbeat.data?.status === 'online'
        && Date.now() - new Date(heartbeat.data.last_seen_at).getTime() < 90_000;
      if (!fresh) {
        const fallback = await admin.from('llm_providers')
          .select('id,kind,endpoint,chat_model,embedding_model,max_classification,enabled,requests_per_hour,requests_per_day')
          .eq('id','gemini').eq('enabled',true).maybeSingle();
        if (fallback.error || !fallback.data) throw new Error('local_provider_offline');
        provider = fallback.data as Provider;
      }
    }

    // The run inherits the stricter of the agent's ceiling and the caller's
    // declared classification, so a caller can raise sensitivity but never lower it.
    const requested = typeof body.classification === 'string' && body.classification in rank ? body.classification : 'public';
    const classification = rank[requested] > rank[agent.classification] ? requested : agent.classification;
    if (rank[classification] > rank[provider.max_classification]) {
      throw new Error(`provider_not_cleared: ${provider.id} may not handle ${classification}`);
    }

    // Database tools do not call the model provider and must not consume or be
    // blocked by Gemini's tiny free-tier quota. They keep their own RBAC,
    // assignment, approval and audit gates below.
    if (action !== 'tool') {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('requested_by', requesterId)
        .gte('created_at', since);
      if ((count ?? 0) >= provider.requests_per_hour) throw new Error('rate_limit_exceeded');

      const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: dailyCount } = await admin
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .gte('created_at', sinceDay);
      if ((dailyCount ?? 0) >= provider.requests_per_day) throw new Error('daily_quota_exceeded');
    }

    let effectiveApproval = agent.approval_level;
    if (action === 'tool') {
      const requestedTool = body.toolName?.toString() || '';
      const assignment = await admin.from('agent_tool_assignments').select('tool:agent_tools(id,approval_level,enabled)').eq('agent_id',agent.id).eq('tool_id',requestedTool).single();
      const tool = assignment.data?.tool as unknown as Pick<AgentTool,'id'|'approval_level'|'enabled'> | undefined;
      if (assignment.error || !tool?.enabled) throw new Error('tool_not_assigned_or_disabled');
      effectiveApproval = Math.max(effectiveApproval, tool.approval_level);
    }
    const promptHash = await hash(`${agent.id}:${input}`);
    const needsApproval = effectiveApproval >= 2;
    const { data: created, error: createError } = await admin
      .from('agent_runs')
      .insert({
        agent_id: agent.id,
        task_id: body.taskId || null,
        provider_id: provider.id,
        requested_by: requesterId,
        classification,
        approval_level: effectiveApproval,
        approval_state: needsApproval ? 'pending' : 'not_required',
        run_state: needsApproval ? 'pending_approval' : 'running',
        status: needsApproval ? 'pending_approval' : 'running',
        prompt_hash: promptHash,
        replay_of: body.replayOf || null,
        started_at: needsApproval ? null : new Date().toISOString(),
        logs: [{ at: new Date().toISOString(), event: 'accepted', provider: provider.id, kind: provider.kind, classification }],
      })
      .select()
      .single();
    if (createError) throw createError;
    runId = created.id;

    // L2+ work stops here until a human approves it through approve_agent_run.
    if (needsApproval) {
      const payload = await admin.from('agent_run_payloads').insert({ run_id: created.id, action, input });
      if (payload.error) throw payload.error;
      return Response.json({ run: created, status: 'pending_approval', approvalLevel: effectiveApproval }, { headers: cors });
    }

    if (provider.kind === 'local' && action !== 'tool') {
      await admin.from('agent_runs').update({run_state:'queued',status:'queued',started_at:null}).eq('id',created.id);
      const payload = await admin.from('agent_run_payloads').insert({run_id:created.id,action,input});
      if (payload.error) throw payload.error;
      return Response.json({runId:created.id,status:'queued',provider:provider.id},{headers:cors});
    }

    const result = await executeRun(admin, created as Run, agent, provider, action, input);
    return Response.json(result, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    // A failed run stays visible in the stream instead of disappearing.
    if (runId) {
      await admin.from('agent_runs').update({
        run_state: 'failed', status: 'failed', error: message, finished_at: new Date().toISOString(),
      }).eq('id', runId);
      await admin.from('agent_run_payloads').delete().eq('run_id', runId);
    }
    return Response.json({ error: message, runId }, { status: 400, headers: cors });
  }
});

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

const rank: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

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
  const response = await fetch(`${provider.endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: provider.chat_model,
      stream: false,
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
    const response = await fetch(`${provider.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
async function buildAgentContext(admin: ReturnType<typeof createClient>, agentId: string) {
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
  context.memory = await rows(admin, 'memories', 'scope,scope_id,content,classification,created_at');
  return JSON.stringify(context).slice(0, 50000);
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

  const companyContext = await buildAgentContext(admin, agent.id);
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
      scope: 'agent', scope_id: agent.id, content: result.text.slice(0, 4000),
      embedding: vector, classification: run.classification,
    });
  } catch (_) { /* run output remains authoritative */ }
  return { runId: run.id, output: result.text, latencyMs: latency, tokenUsage: result.tokens, provider: provider.id };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let runId: string | null = null;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('missing_authorization');
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await caller.auth.getUser();
    if (authError || !auth.user) throw new Error('invalid_session');

    // A suspended account keeps its JWT until expiry, so re-check the control row.
    const control = await admin.from('account_controls').select('status').eq('user_id', auth.user.id).maybeSingle();
    if (control.data?.status && control.data.status !== 'active') throw new Error('account_not_active');

    const body = await request.json();
    const action: string = body.action || 'run';
    const input: string = (body.input || '').toString();

    if (action === 'approve' || action === 'reject') {
      const decision = action === 'approve' ? 'approved' : 'rejected';
      const decided = await caller.rpc('approve_agent_run', { run_id: body.runId, decision, note: body.note || null });
      if (decided.error) throw decided.error;
      const approved = decided.data as Run;
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
      const result = await executeRun(admin, approved, resumedAgent as Agent, resumedProvider as Provider, payload.action, payload.input);
      await admin.from('agent_run_payloads').delete().eq('run_id', approved.id);
      return Response.json(result, { headers: cors });
    }

    if (!input.trim()) throw new Error('empty_input');

    // Reading the agent through the caller applies `agents_admin_read`, so a
    // non-admin session cannot execute an agent at all.
    const { data: agentRow, error: agentError } = await caller
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
    const provider = providerRow as Provider;
    if (!provider.enabled) throw new Error('provider_disabled');

    // The run inherits the stricter of the agent's ceiling and the caller's
    // declared classification, so a caller can raise sensitivity but never lower it.
    const requested = typeof body.classification === 'string' && body.classification in rank ? body.classification : 'public';
    const classification = rank[requested] > rank[agent.classification] ? requested : agent.classification;
    if (rank[classification] > rank[provider.max_classification]) {
      throw new Error(`provider_not_cleared: ${provider.id} may not handle ${classification}`);
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('requested_by', auth.user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= provider.requests_per_hour) throw new Error('rate_limit_exceeded');

    const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount } = await admin
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .gte('created_at', sinceDay);
    if ((dailyCount ?? 0) >= provider.requests_per_day) throw new Error('daily_quota_exceeded');

    const promptHash = await hash(`${agent.id}:${input}`);
    const needsApproval = agent.approval_level >= 2;
    const { data: created, error: createError } = await admin
      .from('agent_runs')
      .insert({
        agent_id: agent.id,
        task_id: body.taskId || null,
        provider_id: provider.id,
        requested_by: auth.user.id,
        classification,
        approval_level: agent.approval_level,
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
      return Response.json({ run: created, status: 'pending_approval', approvalLevel: agent.approval_level }, { headers: cors });
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

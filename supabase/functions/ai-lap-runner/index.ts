import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const allowedActions = new Set(['run', 'embed']);
const safeEqual = (left:string,right:string) => {
  const a=new TextEncoder().encode(left), b=new TextEncoder().encode(right); if(a.length!==b.length)return false;
  let different=0; for(let i=0;i<a.length;i++) different|=a[i]^b[i]; return different===0;
};

const phoneDigits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const ownerMap=()=>Object.fromEntries((Deno.env.get('WHATSAPP_OWNER_EMAIL_MAP')||'96896709444=alialajmi524@gmail.com,96892797586=sheikhaalmamari4@gmail.com')
  .split(',').map(value=>value.trim().split('=').map(part=>part.trim())).filter(parts=>parts.length===2));

async function bridgeOwner(admin:ReturnType<typeof createClient>,sender:unknown){
  const email=ownerMap()[phoneDigits(sender)];
  if(!email) throw new Error('bridge_sender_not_allowed');
  const profile=await admin.from('profiles').select('id,email,full_name').eq('email',email).single();
  if(profile.error) throw new Error('bridge_owner_not_found');
  const role=await admin.from('user_roles').select('role').eq('user_id',profile.data.id).in('role',['owner','super_admin']).limit(1).maybeSingle();
  if(role.error||!role.data) throw new Error('bridge_owner_role_required');
  return profile.data;
}

async function bridgeOperation(admin:ReturnType<typeof createClient>,body:Record<string,unknown>){
  const owner=await bridgeOwner(admin,body.sender);
  const operation=String(body.operation||''), args=(body.args&&typeof body.args==='object'?body.args:{}) as Record<string,unknown>;
  if(operation==='projects.summary'){
    const projects=await admin.from('projects').select('id,name,type,status,description,start_date,target_date,budget,currency,manager_id,updated_at').is('archived_at',null).order('updated_at',{ascending:false}).limit(40);
    if(projects.error) throw projects.error;
    const ids=(projects.data||[]).map(project=>project.id);
    const [tasks,milestones,kpis]=ids.length?await Promise.all([
      admin.from('tasks').select('id,title,status,priority,due_at,project_id,assignee_id').in('project_id',ids).order('due_at'),
      admin.from('project_milestones').select('id,title,status,due_date,project_id').in('project_id',ids).order('due_date'),
      admin.from('project_kpis').select('title,target_value,current_value,unit,status,project_id').in('project_id',ids),
    ]):[{data:[]},{data:[]},{data:[]}];
    const query=String(args.query||args.project||'').toLowerCase();
    const selected=query?(projects.data||[]).filter(project=>query.includes(project.name.toLowerCase())||project.name.toLowerCase().includes(query)):(projects.data||[]);
    const now=Date.now();
    return selected.slice(0,12).map(project=>({ ...project, url:`https://reidpro.com/projects/${project.id}`,
      tasks:(tasks.data||[]).filter(task=>task.project_id===project.id),
      overdue:(tasks.data||[]).filter(task=>task.project_id===project.id&&task.status!=='done'&&task.due_at&&new Date(task.due_at).getTime()<now),
      milestones:(milestones.data||[]).filter(row=>row.project_id===project.id),kpis:(kpis.data||[]).filter(row=>row.project_id===project.id)}));
  }
  if(operation==='tasks.create_batch'){
    const projectName=String(args.project||'').trim();
    const project=await admin.from('projects').select('id,name').ilike('name',`%${projectName.replace(/[%_]/g,'')}%`).is('archived_at',null).limit(1).maybeSingle();
    if(project.error||!project.data) throw new Error('project_not_found');
    const rows=Array.isArray(args.tasks)?args.tasks.slice(0,30):[];
    if(!rows.length) throw new Error('tasks_required');
    const profiles=await admin.from('profiles').select('id,full_name');
    const created=await admin.from('tasks').insert(rows.map((raw:Record<string,unknown>)=>{
      const assignee=String(raw.assignee||'').toLowerCase();
      return {title:String(raw.title||'').slice(0,180),description:String(raw.description||'').slice(0,2000)||null,project_id:project.data.id,
        assignee_id:(profiles.data||[]).find(row=>row.full_name.toLowerCase().includes(assignee))?.id||null,due_at:raw.due_at||null,created_by:owner.id};
    })).select('id,title,due_at,assignee_id');
    if(created.error) throw created.error;
    return {project:project.data,created:created.data,url:`https://reidpro.com/projects/${project.data.id}`};
  }
  if(operation==='memory.list'){
    const scope=String(args.scope||'user')==='group'?'company':'user';
    const scopeId=scope==='user'?owner.id:`whatsapp:${String(body.chatId||'company')}`;
    const rows=await admin.from('memories').select('id,title,content,updated_at').eq('scope',scope).eq('scope_id',scopeId).order('updated_at',{ascending:false}).limit(30);
    if(rows.error) throw rows.error; return rows.data;
  }
  if(operation==='memory.save'){
    const scope=String(args.scope||'user')==='group'?'company':'user', scopeId=scope==='user'?owner.id:`whatsapp:${String(body.chatId||'company')}`;
    const content=String(args.content||'').trim(); if(!content) throw new Error('memory_content_required');
    const row=await admin.from('memories').insert({scope,scope_id:scopeId,title:String(args.title||'تفضيل واتساب').slice(0,120),content:content.slice(0,4000),classification:'internal',created_by:owner.id}).select('id,title,content').single();
    if(row.error) throw row.error; return row.data;
  }
  if(operation==='memory.delete'){
    const id=String(args.id||''), scopeId=owner.id;
    const removed=await admin.from('memories').delete().eq('id',id).eq('scope','user').eq('scope_id',scopeId).select('id');
    if(removed.error) throw removed.error; return {removed:removed.data?.length||0};
  }
  if(operation==='knowledge.search'){
    const query=String(args.query||'').trim().replace(/[^\p{L}\p{N}\s.-]/gu,'').slice(0,120); if(!query) throw new Error('query_required');
    const pattern=`%${query}%`;
    const [projectFiles,researchFiles,employeeFiles,memories]=await Promise.all([
      admin.from('project_files').select('id,title,storage_path,project_id,category,created_at').ilike('title',pattern).limit(10),
      admin.from('research_documents').select('id,title,storage_path,research_id,category,created_at').ilike('title',pattern).limit(10),
      admin.from('employee_documents').select('id,title,storage_path,owner_id,category,created_at').ilike('title',pattern).limit(10),
      admin.from('memories').select('id,title,content,scope,scope_id,created_at').or(`title.ilike.${pattern},content.ilike.${pattern}`).limit(10),
    ]);
    return {projectFiles:projectFiles.data||[],researchFiles:researchFiles.data||[],employeeFiles:employeeFiles.data||[],memories:memories.data||[],sourceNote:'المسارات معرفات داخل Reid؛ فتح الملف يتم من الوحدة المالكة مع تطبيق صلاحياتها.'};
  }
  if(operation==='content.draft.create'){
    const row=await admin.from('content_drafts').insert({title_ar:String(args.title_ar||args.title||'مسودة ريّد').slice(0,180),title_en:String(args.title_en||args.title||'Reid draft').slice(0,180),body_ar:String(args.body_ar||args.body||'').slice(0,12000),body_en:String(args.body_en||'').slice(0,12000),created_by:owner.id}).select('id,title_ar,status').single();
    if(row.error) throw row.error; return {...row.data,url:`https://reidpro.com/dashboard#content-${row.data.id}`,publishing:'requires_connected_platform_and_L2_approval'};
  }
  throw new Error('bridge_operation_not_allowed');
}

async function notifyWhatsApp(admin: ReturnType<typeof createClient>, runId: string, message: string, status: 'completed'|'failed') {
  const token=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN'), phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const command=await admin.from('whatsapp_commands').select('id,sender_phone').eq('agent_run_id',runId).maybeSingle();
  if(!command.data) return;
  await admin.from('whatsapp_commands').update({status,error:status==='failed'?message:null,updated_at:new Date().toISOString()}).eq('id',command.data.id);
  if(!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:command.data.sender_phone,type:'text',text:{preview_url:false,body:message.slice(0,4000)}}),
  });
}

async function completeWithGeminiFallback(admin: ReturnType<typeof createClient>, runId: string, localError: string) {
  const key=Deno.env.get('GEMINI_API_KEY');
  if(!key) throw new Error('gemini_fallback_not_configured');
  const run=await admin.from('agent_runs').select('id,agent_id,requested_by,classification').eq('id',runId).eq('provider_id','ollama').eq('run_state','running').single();
  if(run.error) throw new Error('run_not_claimed');
  const [payload,agent,provider]=await Promise.all([
    admin.from('agent_run_payloads').select('action,input').eq('run_id',runId).single(),
    admin.from('agents').select('system_prompt').eq('id',run.data.agent_id).single(),
    admin.from('llm_providers').select('id,endpoint,chat_model,max_classification,enabled,requests_per_day').eq('id','gemini').single(),
  ]);
  if(payload.error || agent.error || provider.error || !provider.data.enabled || payload.data.action!=='run') throw new Error('gemini_fallback_unavailable');
  const classificationRank:Record<string,number>={public:0,internal:1,confidential:2,restricted:3};
  if(classificationRank[run.data.classification] > classificationRank[provider.data.max_classification]) throw new Error('gemini_fallback_not_cleared');
  const sinceDay=new Date(Date.now()-24*60*60*1000).toISOString();
  const usage=await admin.from('agent_runs').select('id',{count:'exact',head:true}).eq('provider_id','gemini').gte('created_at',sinceDay);
  if((usage.count ?? 0)>=provider.data.requests_per_day) throw new Error('gemini_fallback_quota_exceeded');
  const grounded=['marketing','content','competitor','knowledge'].includes(run.data.agent_id);
  const response=await fetch(`${provider.data.endpoint}/models/${provider.data.chat_model}:generateContent`,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({
      contents:[{role:'user',parts:[{text:payload.data.input}]}],
      ...(agent.data.system_prompt?{systemInstruction:{parts:[{text:agent.data.system_prompt}]}}:{}),
      ...(grounded?{tools:[{google_search:{}}]}:{}),
    }),
  });
  const result=await response.json();
  if(!response.ok) throw new Error(`gemini_fallback_http_${response.status}`);
  const output=result?.candidates?.[0]?.content?.parts?.map((part:{text?:string})=>part.text||'').join('').trim()||'';
  if(!output) throw new Error('gemini_fallback_empty');
  const updated=await admin.from('agent_runs').update({
    provider_id:'gemini',run_state:'succeeded',status:'succeeded',token_usage:result?.usageMetadata?.totalTokenCount??null,
    output_preview:output.slice(0,280),error:null,finished_at:new Date().toISOString(),
    logs:[{at:new Date().toISOString(),event:'local_failed_gemini_fallback',local_error:localError.slice(0,180)}],
  }).eq('id',runId).eq('run_state','running');
  if(updated.error) throw updated.error;
  await admin.from('memories').insert({scope:'agent',scope_id:run.data.agent_id,title:`Run ${runId}`,content:output.slice(0,4000),classification:run.data.classification,created_by:run.data.requested_by,source_run_id:runId});
  await admin.from('agent_run_payloads').delete().eq('run_id',runId);
  await notifyWhatsApp(admin,runId,output,'completed');
}

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const expected = Deno.env.get('AI_LAP_RUNNER_TOKEN');
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || !safeEqual(supplied,expected)) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await request.json();

    if(body.action==='bridge') return json({ok:true,result:await bridgeOperation(admin,body)});

    if (body.action === 'heartbeat') {
      const numberOrNull=(value:unknown)=>Number.isFinite(Number(value))?Number(value):null;
      const heartbeat = await admin.from('agent_runner_status').upsert({
        id: 'ai-lap',
        status: 'online',
        version: String(body.version || 'unknown').slice(0, 40),
        model: String(body.model || 'gemma4:12b').slice(0, 80),
        gpu: String(body.gpu || '').slice(0, 120) || null,
        ping_ms:numberOrNull(body.pingMs),cpu_percent:numberOrNull(body.cpuPercent),
        memory_used_gb:numberOrNull(body.memoryUsedGb),memory_total_gb:numberOrNull(body.memoryTotalGb),
        gpu_utilization:numberOrNull(body.gpuUtilization),vram_used_mb:numberOrNull(body.vramUsedMb),
        vram_total_mb:numberOrNull(body.vramTotalMb),
        last_seen_at: new Date().toISOString(),
      });
      if (heartbeat.error) throw heartbeat.error;
      return json({ ok: true });
    }

    if (body.action === 'claim') {
      // A crashed runner must not strand a job forever. Normal local inference
      // is expected to finish well inside this conservative recovery window.
      await admin.from('agent_runs').update({
        run_state: 'queued', status: 'queued', started_at: null,
        logs: [{ at: new Date().toISOString(), event: 'requeued_after_runner_timeout' }],
      }).eq('provider_id', 'ollama').eq('run_state', 'running')
        .lt('started_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
      const pending = await admin.from('agent_runs').select('id,agent_id,classification,approval_level')
        .eq('provider_id','ollama').eq('run_state','queued').order('created_at').limit(1).maybeSingle();
      if (pending.error) throw pending.error;
      if (!pending.data) return json({ job: null });
      const claimed = await admin.from('agent_runs').update({ run_state:'running',status:'running',started_at:new Date().toISOString() })
        .eq('id',pending.data.id).eq('run_state','queued').select('id,agent_id,classification,approval_level').maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) return json({ job: null });
      const [payload, agent, provider] = await Promise.all([
        admin.from('agent_run_payloads').select('action,input').eq('run_id',claimed.data.id).single(),
        admin.from('agents').select('system_prompt').eq('id',claimed.data.agent_id).single(),
        admin.from('llm_providers').select('chat_model,embedding_model').eq('id','ollama').single(),
      ]);
      if (payload.error || agent.error || provider.error || !allowedActions.has(payload.data.action)) throw new Error('invalid_local_job');
      return json({ job:{...claimed.data,...payload.data,system_prompt:agent.data.system_prompt,...provider.data} });
    }

    if (body.action === 'complete') {
      const output = typeof body.output === 'string' ? body.output.slice(0,12000) : '';
      const embedding = Array.isArray(body.embedding) && body.embedding.length === 768 ? body.embedding : null;
      const run = await admin.from('agent_runs').select('id,agent_id,requested_by,classification').eq('id',body.runId).eq('provider_id','ollama').eq('run_state','running').single();
      if (run.error) throw new Error('run_not_claimed');
      const updated = await admin.from('agent_runs').update({run_state:'succeeded',status:'succeeded',latency_ms:Number(body.latencyMs)||null,token_usage:Number(body.tokenUsage)||null,output_preview:output.slice(0,280),finished_at:new Date().toISOString()}).eq('id',run.data.id);
      if (updated.error) throw updated.error;
      if (output) await admin.from('memories').insert({scope:'agent',scope_id:run.data.agent_id,title:`Run ${run.data.id}`,content:output.slice(0,4000),embedding,classification:run.data.classification,created_by:run.data.requested_by,source_run_id:run.data.id});
      await admin.from('agent_run_payloads').delete().eq('run_id',run.data.id);
      await notifyWhatsApp(admin,run.data.id,output?`رد الوكيل:\n${output}`:'اكتمل تنفيذ الأمر.', 'completed');
      return json({ ok:true });
    }

    if (body.action === 'fail') {
      const localError=String(body.error||'local_runner_failed').slice(0,500);
      try {
        await completeWithGeminiFallback(admin,String(body.runId),localError);
        return json({ok:true,fallback:'gemini'});
      } catch(fallbackError) {
        const error=`${localError}; ${fallbackError instanceof Error?fallbackError.message:'fallback_failed'}`.slice(0,500);
        const run = await admin.from('agent_runs').update({run_state:'failed',status:'failed',error,finished_at:new Date().toISOString()}).eq('id',body.runId).eq('provider_id','ollama').eq('run_state','running').select('id').single();
        if (run.error) throw new Error('run_not_claimed');
        await admin.from('agent_run_payloads').delete().eq('run_id',run.data.id);
        await notifyWhatsApp(admin,run.data.id,'تعذر التنفيذ محليًا وتعذر البديل الاحتياطي. تم تسجيل الخطأ في لوحة الوكلاء.', 'failed');
        return json({ok:false,fallback:'failed'});
      }
    }
    return json({error:'invalid_action'},400);
  } catch (error) { return json({error:error instanceof Error?error.message:'unknown_error'},400); }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { queueQrText } from '../_shared/qr-transport.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const allowedActions = new Set(['run', 'embed']);
const safeEqual = (left:string,right:string) => {
  const a=new TextEncoder().encode(left), b=new TextEncoder().encode(right); if(a.length!==b.length)return false;
  let different=0; for(let i=0;i<a.length;i++) different|=a[i]^b[i]; return different===0;
};

async function notifyWhatsApp(admin: ReturnType<typeof createClient>, runId: string, message: string, status: 'completed'|'failed') {
  const token=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN'), phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const command=await admin.from('whatsapp_commands').select('id,sender_phone,message_id').eq('agent_run_id',runId).maybeSingle();
  if(!command.data) return;
  await admin.from('whatsapp_commands').update({status,error:status==='failed'?message:null,updated_at:new Date().toISOString()}).eq('id',command.data.id);
  if(Deno.env.get('REID_WHATSAPP_TRANSPORT')==='qr') {
    if(command.data.message_id?.startsWith('qr:')) await queueQrText(admin,command.data.sender_phone,message,`result:${runId}:${status}`);
    return;
  }
  if(!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:command.data.sender_phone,type:'text',text:{preview_url:false,body:message.slice(0,4000)}}),
  });
}

async function completeWithGeminiFallback(admin: ReturnType<typeof createClient>, runId: string, localError: string) {
  if(Deno.env.get('REID_LOCAL_AI_ONLY')==='1') throw new Error('local_only_policy');
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const allowedActions = new Set(['run', 'embed']);
const safeEqual = (left:string,right:string) => {
  const a=new TextEncoder().encode(left), b=new TextEncoder().encode(right); if(a.length!==b.length)return false;
  let different=0; for(let i=0;i<a.length;i++) different|=a[i]^b[i]; return different===0;
};

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const expected = Deno.env.get('AI_LAP_RUNNER_TOKEN');
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || !safeEqual(supplied,expected)) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await request.json();

    if (body.action === 'heartbeat') {
      const heartbeat = await admin.from('agent_runner_status').upsert({
        id: 'ai-lap',
        status: 'online',
        version: String(body.version || 'unknown').slice(0, 40),
        model: String(body.model || 'gemma4:12b').slice(0, 80),
        gpu: String(body.gpu || '').slice(0, 120) || null,
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
      return json({ ok:true });
    }

    if (body.action === 'fail') {
      const run = await admin.from('agent_runs').update({run_state:'failed',status:'failed',error:String(body.error||'local_runner_failed').slice(0,500),finished_at:new Date().toISOString()}).eq('id',body.runId).eq('provider_id','ollama').eq('run_state','running').select('id').single();
      if (run.error) throw new Error('run_not_claimed');
      await admin.from('agent_run_payloads').delete().eq('run_id',run.data.id);
      return json({ok:true});
    }
    return json({error:'invalid_action'},400);
  } catch (error) { return json({error:error instanceof Error?error.message:'unknown_error'},400); }
});

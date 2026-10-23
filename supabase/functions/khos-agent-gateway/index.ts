import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedAgents = new Set(['khos_field_monitor','khos_trap_health','khos_reports','khos_alerts']);
const encoder = new TextEncoder();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''); }
function equal(a: string, b: string) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function verify(request: Request, raw: string) {
  const secret = Deno.env.get('KHOS_AGENT_BRIDGE_SECRET');
  const timestamp = request.headers.get('x-khos-timestamp') || '';
  const signature = request.headers.get('x-khos-signature') || '';
  if (!secret || !/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000) throw new Error('invalid_bridge_timestamp');
  if (!equal(signature, await sign(secret, `${timestamp}.${raw}`))) throw new Error('invalid_bridge_signature');
}
function bounded(value: unknown, max: number) { return typeof value === 'string' ? value.slice(0, max) : ''; }

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await request.text();
  try {
    await verify(request, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const action = bounded(body.action, 20);

    if (action === 'health') {
      const [runner, provider] = await Promise.all([
        admin.from('agent_runner_status').select('status,model,last_seen_at,version').eq('id','ai-lap').maybeSingle(),
        admin.from('llm_providers').select('enabled,chat_model,kind,max_classification').eq('id','ollama').maybeSingle(),
      ]);
      if (runner.error || provider.error) throw new Error('health_unavailable');
      const fresh = !!runner.data?.last_seen_at && Date.now() - new Date(runner.data.last_seen_at).getTime() < 90000;
      return json({ ok: true, ready: fresh && provider.data?.enabled === true && provider.data?.chat_model === 'gemma4:12b', runner: runner.data || null, provider: provider.data || null });
    }

    if (action === 'run') {
      const agentId = bounded(body.agentId, 50);
      if (!allowedAgents.has(agentId)) throw new Error('agent_not_allowed');
      if (body.classification !== 'internal') throw new Error('khos_classification_required');
      const externalRequestId = bounded(body.externalRequestId, 120);
      if (!externalRequestId) throw new Error('external_request_id_required');
      const existing = await admin.from('agent_runs').select('id,run_state,external_output,output_preview').eq('source_system','khos').eq('external_request_id',externalRequestId).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return json({ runId: existing.data.id, status: existing.data.run_state, output: existing.data.external_output || existing.data.output_preview || null, idempotent: true });
      const agent = await admin.from('agents').select('id,provider_id,classification,enabled,status').eq('id',agentId).single();
      if (agent.error || !agent.data || !agent.data.enabled || agent.data.status === 'paused' || agent.data.provider_id !== 'ollama' || agent.data.classification !== 'internal') throw new Error('agent_unavailable');
      const input = JSON.stringify({ source_system:'khos', farmId:bounded(body.farmId,80), trapId:bounded(body.trapId,80), readings:body.readings || [], detections:body.detections || [], battery:body.battery ?? null, connectivity:bounded(body.connectivity,30), timestamp:bounded(body.timestamp,60) });
      if (input.length > 20000) throw new Error('khos_payload_too_large');
      const hashBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`${agentId}:${input}`));
      const promptHash = hex(hashBytes);
      const run = await admin.from('agent_runs').insert({ agent_id:agentId, provider_id:'ollama', requested_by:null, classification:'internal', approval_level:0, approval_state:'not_required', run_state:'queued', status:'queued', prompt_hash:promptHash, source_system:'khos', external_request_id:externalRequestId, external_requester_id:bounded(body.externalRequesterId,120), external_role:bounded(body.role,30), source_metadata:{ farmId:bounded(body.farmId,80), trapId:bounded(body.trapId,80) }, logs:[{at:new Date().toISOString(),event:'khos_bridge_accepted'}] }).select('id,run_state').single();
      if (run.error) throw run.error;
      const payload = await admin.from('agent_run_payloads').insert({ run_id:run.data.id, action:'run', input }).select('run_id').single();
      if (payload.error) throw payload.error;
      return json({ runId:run.data.id, status:'queued', provider:'ollama', model:'gemma4:12b' });
    }

    if (action === 'result') {
      const runId = bounded(body.runId, 80);
      const result = await admin.from('agent_runs').select('id,run_state,external_output,output_preview,quality_score,quality_flags,error').eq('id',runId).eq('source_system','khos').single();
      if (result.error) throw new Error('run_not_found');
      return json({ runId:result.data.id, status:result.data.run_state, output:result.data.external_output || result.data.output_preview || null, qualityScore:result.data.quality_score, qualityFlags:result.data.quality_flags, error:result.data.error });
    }

    if (action === 'cancel') {
      const runId = bounded(body.runId, 80);
      const update = await admin.from('agent_runs').update({run_state:'cancelled',status:'cancelled',finished_at:new Date().toISOString(),error:'cancelled_by_khos'}).eq('id',runId).eq('source_system','khos').in('run_state',['queued','pending_approval']).select('id').single();
      if (update.error) throw new Error('run_not_cancellable');
      await admin.from('agent_run_payloads').delete().eq('run_id',runId);
      return json({ok:true,runId});
    }
    throw new Error('invalid_action');
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'bridge_error' }, 400); }
});

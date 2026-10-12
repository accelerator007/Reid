// Every read the agent management page makes, through db.ts. The gateway
// calls (run, tool, approve) stay in agents.ts, shared with the agent team.
// Row-level security decides what each person sees: HR reads only the runs it
// may approve, and nothing here widens that.
import { firstError, list, run, toAppError, type AppError, type Result } from '../db';
import type { AgentRow, AgentToolRow, ProviderRow, RunRow, RunnerStatusRow } from '../agents';
import { supabase } from '../supabase';
import { localApi } from '../local-api';

const client = () => {
  if (!supabase) throw new Error('supabase_unavailable');
  return supabase;
};

export type RunWithRequester = RunRow & { requested_by: string | null };
export type AgentAdminData = {
  agents: AgentRow[];
  providers: ProviderRow[];
  runs: RunWithRequester[];
  pending: RunWithRequester[];
  tools: AgentToolRow[];
  runner: RunnerStatusRow | null;
  names: Map<string, string>;
};
export type ProviderInput = {
  id:string;name:string;kind:'external'|'local';api_style:'google_gemini'|'openai_compatible'|'ollama';model_mode:'fixed'|'auto';endpoint:string;
  chat_model:string;embedding_model:string|null;max_classification:'public'|'internal'|'confidential'|'restricted';
  retains_data:boolean;requests_per_hour:number;requests_per_day:number;notes:string|null;api_key?:string;
};

const providerList=async():Promise<Result<ProviderRow[]>>=>{
  try{return {ok:true,data:await localApi<ProviderRow[]>('llm/providers')};}
  catch(error){return {ok:false,error:toAppError(error)};}
};
const providerReadColumns='id,name,kind,api_style,model_mode,last_model_resolved_at,endpoint,chat_model,embedding_model,max_classification,retains_data,enabled,requests_per_hour,requests_per_day,notes,last_tested_at,last_test_status,last_test_latency_ms,last_test_error,created_at,updated_at';

const runColumns = 'id,agent_id,provider_id,classification,run_state,approval_level,approval_state,latency_ms,token_usage,quality_score,quality_flags,revision_count,output_preview,error,requested_tool,request_summary,created_at,requested_by';

export async function loadAgentAdmin(manage: boolean, owner = false): Promise<{ data: AgentAdminData | null; error: AppError | null }> {
  const db = client();
  const [agents, providers, runs, pending, tools, runner, people] = await Promise.all([
    manage ? list<AgentRow>(db.from('agents').select('id,name,status,model,host,approval_level,provider_id,classification,enabled,disabled_reason,permissions').order('name')) : Promise.resolve({ ok: true as const, data: [] }),
    manage ? (owner ? providerList() : list<ProviderRow>(db.from('llm_providers').select(providerReadColumns).is('archived_at',null).order('name'))) : Promise.resolve({ ok: true as const, data: [] }),
    list<RunWithRequester>(db.from('agent_runs').select(runColumns).order('created_at', { ascending: false }).limit(60)),
    list<RunWithRequester>(db.from('agent_runs').select(runColumns).eq('approval_state', 'pending').order('created_at')),
    manage ? list<AgentToolRow>(db.from('agent_tools').select('id,name_ar,name_en,description,operation,approval_level,input_schema').eq('enabled', true).order('id')) : Promise.resolve({ ok: true as const, data: [] }),
    manage ? run<RunnerStatusRow>(db.from('agent_runner_status').select('id,status,version,model,gpu,ping_ms,adapter_latency_ms,cpu_percent,memory_used_gb,memory_total_gb,gpu_utilization,vram_used_mb,vram_total_mb,last_seen_at').eq('id', 'ai-lap').maybeSingle()) : Promise.resolve({ ok: true as const, data: null }),
    list<{ id: string; full_name: string | null; email: string | null }>(db.from('profiles').select('id,full_name,email')),
  ]);
  const error = firstError([agents, providers, runs, pending, tools, runner, people]);
  if (!runs.ok && !pending.ok) return { data: null, error };
  return {
    data: {
      agents: agents.ok ? agents.data : [],
      providers: providers.ok ? providers.data : [],
      runs: runs.ok ? runs.data : [],
      pending: pending.ok ? pending.data : [],
      tools: tools.ok ? tools.data : [],
      runner: runner.ok ? runner.data : null,
      names: new Map((people.ok ? people.data : []).map(person => [person.id, person.full_name || person.email || person.id.slice(0, 8)])),
    },
    error,
  };
}

export const createProvider=(input:ProviderInput)=>localApi<ProviderRow[]>('llm/providers',input);
export const updateProvider=(id:string,input:Omit<ProviderInput,'id'>)=>localApi<ProviderRow[]>(`llm/providers/${id}`,input,'PATCH');
export const testProvider=(id:string)=>localApi<{ok:boolean;latency_ms:number;model:string;tested_at:string}>(`llm/providers/${id}/test`,{});
export const setProviderEnabled=(id:string,enabled:boolean)=>localApi<ProviderRow[]>(`llm/providers/${id}/enabled`,{enabled});
export const deleteProvider=(id:string)=>localApi<ProviderRow[]>(`llm/providers/${id}`,{},'DELETE');
export const assignAgentProvider=(agentId:string,providerId:string)=>localApi<{ok:boolean}>(`llm/agents/${agentId}/provider`,{provider_id:providerId},'PATCH');

/** Live updates from the three tables this page shows, nothing wider. */
export function subscribeToAgents(manage: boolean, onChange: () => void) {
  const db = client();
  let channel = db.channel(`agent-admin:${manage ? 'manage' : 'approve'}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, onChange);
  if (manage) {
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llm_providers' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runner_status' }, onChange);
  }
  channel.subscribe();
  return () => { void db.removeChannel(channel); };
}

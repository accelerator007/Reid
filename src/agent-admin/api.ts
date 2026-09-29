// Every read the agent management page makes, through db.ts. The gateway
// calls (run, tool, approve) stay in agents.ts, shared with the agent team.
// Row-level security decides what each person sees: HR reads only the runs it
// may approve, and nothing here widens that.
import { firstError, list, run, type AppError } from '../db';
import type { AgentRow, AgentToolRow, ProviderRow, RunRow, RunnerStatusRow } from '../agents';
import { supabase } from '../supabase';

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

const runColumns = 'id,agent_id,provider_id,classification,run_state,approval_level,approval_state,latency_ms,token_usage,quality_score,quality_flags,revision_count,output_preview,error,created_at,requested_by';

export async function loadAgentAdmin(manage: boolean): Promise<{ data: AgentAdminData | null; error: AppError | null }> {
  const db = client();
  const [agents, providers, runs, pending, tools, runner, people] = await Promise.all([
    manage ? list<AgentRow>(db.from('agents').select('id,name,status,model,host,approval_level,provider_id,classification,enabled,disabled_reason,permissions').order('name')) : Promise.resolve({ ok: true as const, data: [] }),
    manage ? list<ProviderRow>(db.from('llm_providers').select('id,name,kind,chat_model,max_classification,retains_data,enabled').order('name')) : Promise.resolve({ ok: true as const, data: [] }),
    list<RunWithRequester>(db.from('agent_runs').select(runColumns).order('created_at', { ascending: false }).limit(60)),
    list<RunWithRequester>(db.from('agent_runs').select(runColumns).eq('approval_state', 'pending').order('created_at')),
    manage ? list<AgentToolRow>(db.from('agent_tools').select('id,name_ar,name_en,description,operation,approval_level,input_schema').eq('enabled', true).order('id')) : Promise.resolve({ ok: true as const, data: [] }),
    manage ? run<RunnerStatusRow>(db.from('agent_runner_status').select('id,status,version,model,gpu,ping_ms,cpu_percent,memory_used_gb,memory_total_gb,gpu_utilization,vram_used_mb,vram_total_mb,last_seen_at').eq('id', 'ai-lap').maybeSingle()) : Promise.resolve({ ok: true as const, data: null }),
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

/** Live updates from the three tables this page shows, nothing wider. */
export function subscribeToAgents(manage: boolean, onChange: () => void) {
  const db = client();
  let channel = db.channel(`agent-admin:${manage ? 'manage' : 'approve'}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, onChange);
  if (manage) {
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runner_status' }, onChange);
  }
  channel.subscribe();
  return () => { void db.removeChannel(channel); };
}

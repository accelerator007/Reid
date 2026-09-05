import { supabase } from './supabase';

export const classifications = ['public', 'internal', 'confidential', 'restricted'] as const;
export type Classification = typeof classifications[number];
export type RunState = 'pending_approval' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AgentRow = {
  id: string;
  name: string;
  status: string;
  model: string;
  host: string;
  approval_level: number;
  provider_id: string;
  classification: Classification;
  enabled: boolean;
  disabled_reason: string | null;
};

export type ProviderRow = {
  id: string;
  name: string;
  kind: 'external' | 'local';
  chat_model: string;
  max_classification: Classification;
  retains_data: boolean;
  enabled: boolean;
};

export type RunRow = {
  id: string;
  agent_id: string;
  provider_id: string | null;
  classification: Classification;
  run_state: RunState;
  approval_level: number;
  approval_state: 'not_required' | 'pending' | 'approved' | 'rejected';
  latency_ms: number | null;
  token_usage: number | null;
  output_preview: string | null;
  error: string | null;
  created_at: string;
};

export const rank = (value: Classification) => classifications.indexOf(value);

// A provider may only receive data at or below its own ceiling. Mirrors
// public.provider_accepts() so the UI can grey out a run the database would reject.
export const providerAccepts = (provider: Pick<ProviderRow, 'enabled' | 'max_classification'>, wanted: Classification) =>
  provider.enabled && rank(provider.max_classification) >= rank(wanted);

// A caller may raise the sensitivity of a request but never lower the agent's own ceiling.
export const effectiveClassification = (agent: Classification, requested: Classification) =>
  rank(requested) > rank(agent) ? requested : agent;

// L0 and L1 run immediately; L2 and above wait for a human decision.
export const needsApproval = (approvalLevel: number) => approvalLevel >= 2;

export const canRun = (agent: AgentRow, provider: ProviderRow | undefined) =>
  agent.enabled && agent.status !== 'paused' && !!provider && providerAccepts(provider, agent.classification);

export async function runAgent(agentId: string, input: string, classification: Classification = 'public') {
  if (!supabase) throw new Error('supabase_unavailable');
  const { data, error } = await supabase.functions.invoke('llm-gateway', {
    body: { action: 'run', agentId, input, classification },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { runId: string; output: string; latencyMs: number; tokenUsage: number | null; status?: string };
}

export async function setAgentState(agentId: string, patch: { status?: string; enabled?: boolean; disabled_reason?: string | null }) {
  if (!supabase) throw new Error('supabase_unavailable');
  const { error } = await supabase.from('agents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', agentId);
  if (error) throw error;
}

export async function decideRun(runId: string, decision: 'approved' | 'rejected', note?: string) {
  if (!supabase) throw new Error('supabase_unavailable');
  const { data, error } = await supabase.functions.invoke('llm-gateway', {
    body: { action: decision === 'approved' ? 'approve' : 'reject', runId, note: note || null },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function loadAgentControl() {
  if (!supabase) return { agents: [] as AgentRow[], providers: [] as ProviderRow[], runs: [] as RunRow[] };
  const [agents, providers, runs] = await Promise.all([
    supabase.from('agents').select('id,name,status,model,host,approval_level,provider_id,classification,enabled,disabled_reason').order('name'),
    supabase.from('llm_providers').select('id,name,kind,chat_model,max_classification,retains_data,enabled'),
    supabase.from('agent_runs').select('id,agent_id,provider_id,classification,run_state,approval_level,approval_state,latency_ms,token_usage,output_preview,error,created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    agents: (agents.data || []) as AgentRow[],
    providers: (providers.data || []) as ProviderRow[],
    runs: (runs.data || []) as RunRow[],
  };
}

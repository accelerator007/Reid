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

export type AgentTopology = {
  id: string;
  parent: string | null;
  x: number;
  y: number;
  domain: 'executive' | 'delivery' | 'growth' | 'revenue' | 'governance' | 'knowledge';
  tools: readonly string[];
  memories: readonly string[];
  purpose: { ar: string; en: string };
};

// The eleven database agents stay separate for audit and least-privilege. The
// map groups them into six operating domains instead of pretending every agent
// is an equal peer. Specialist nodes keep their own tools and approval ceiling.
export const agentTopology: readonly AgentTopology[] = [
  { id: 'ceo', parent: null, x: 50, y: 12, domain: 'executive', tools: ['توجيه الأهداف', 'إنشاء المهام', 'ترتيب الأولويات'], memories: ['الشركة', 'الاستراتيجية'], purpose: { ar: 'ينسّق العمل ويحوّل أهداف المالك إلى مهام قابلة للتنفيذ.', en: 'Turns Owner strategy into governed, executable work.' } },
  { id: 'operations', parent: 'ceo', x: 27, y: 33, domain: 'delivery', tools: ['المهام', 'المشاريع', 'المواعيد'], memories: ['الشركة', 'الأقسام', 'المشاريع'], purpose: { ar: 'يتابع التنفيذ والمشاريع والاختناقات التشغيلية.', en: 'Monitors delivery, projects, and operational blockers.' } },
  { id: 'marketing', parent: 'ceo', x: 73, y: 33, domain: 'growth', tools: ['خطة التسويق', 'الحملات', 'المسودات'], memories: ['الشركة', 'العلامة'], purpose: { ar: 'يقود النمو والحملات ويوجّه مختصي المحتوى والمنافسين.', en: 'Leads growth and delegates to content and intelligence specialists.' } },
  { id: 'sales', parent: 'ceo', x: 18, y: 61, domain: 'revenue', tools: ['CRM', 'الفرص', 'المتابعة'], memories: ['الشركة', 'CRM'], purpose: { ar: 'يدير العملاء المحتملين والصفقات والمتابعات.', en: 'Runs leads, deals, and commercial follow-up.' } },
  { id: 'knowledge', parent: 'ceo', x: 82, y: 61, domain: 'knowledge', tools: ['البحث', 'RAG', 'المستندات'], memories: ['الشركة', 'المشاريع', 'المعرفة'], purpose: { ar: 'خدمة معرفة مشتركة؛ RAG وDrive يبقيان غير مفعّلين حتى اكتمال الربط.', en: 'Shared knowledge service; RAG and Drive remain gated until connected.' } },
  { id: 'hr', parent: 'ceo', x: 38, y: 82, domain: 'governance', tools: ['CV', 'الموظفون', 'التوظيف L3'], memories: ['الموارد البشرية فقط'], purpose: { ar: 'يعالج بيانات الموظفين المقيدة داخل حد أمني مستقل.', en: 'Handles restricted people data inside an isolated security boundary.' } },
  { id: 'finance', parent: 'ceo', x: 62, y: 82, domain: 'governance', tools: ['الميزانية', 'التحليل المالي', 'المدفوعات L4'], memories: ['المالية فقط'], purpose: { ar: 'تحليل مالي مع موافقة بشرية إلزامية للالتزامات والمدفوعات.', en: 'Financial analysis with mandatory human approval for commitments.' } },
  { id: 'analytics', parent: 'operations', x: 36, y: 51, domain: 'delivery', tools: ['KPIs', 'التقارير', 'التنبيهات'], memories: ['الشركة', 'المشاريع'], purpose: { ar: 'خدمة قياس مشتركة للتشغيل والتقارير.', en: 'Shared measurement service for operations and reporting.' } },
  { id: 'content', parent: 'marketing', x: 64, y: 51, domain: 'growth', tools: ['المحتوى', 'Instagram', 'LinkedIn'], memories: ['العلامة', 'الحملات'], purpose: { ar: 'ينشئ محتوى موحدًا لـInstagram وLinkedIn؛ النشر L2.', en: 'Creates unified Instagram and LinkedIn content; publishing is L2.' } },
  { id: 'competitor', parent: 'marketing', x: 88, y: 40, domain: 'growth', tools: ['رصد المنافسين', 'المقارنة', 'التنبيهات'], memories: ['السوق', 'المنافسون'], purpose: { ar: 'مختص رصد تحت فريق النمو، وليس مركز قرار مستقل.', en: 'A growth specialist for market monitoring, not a decision authority.' } },
  { id: 'support', parent: 'sales', x: 8, y: 78, domain: 'revenue', tools: ['التذاكر', 'قاعدة المعرفة', 'التصعيد'], memories: ['الدعم', 'العملاء'], purpose: { ar: 'يخدم العملاء ويصعّد الفرص والمشكلات إلى المبيعات.', en: 'Supports customers and escalates opportunities or issues to Sales.' } },
] as const;

export const topologyFor = (id: string) => agentTopology.find(node => node.id === id);

export function operationalState(agent: AgentRow, provider: ProviderRow | undefined, runs: readonly RunRow[]) {
  if (!agent.enabled || !provider || !providerAccepts(provider, agent.classification)) return 'blocked';
  if (agent.status === 'paused') return 'paused';
  const latest = runs.find(run => run.agent_id === agent.id);
  if (latest?.approval_state === 'pending') return 'approval';
  if (latest?.run_state === 'running' || latest?.run_state === 'queued') return 'working';
  if (latest?.run_state === 'failed') return 'error';
  return 'ready';
}

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

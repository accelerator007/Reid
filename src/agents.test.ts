import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { providerAccepts, effectiveClassification, needsApproval, canRun, rank, agentTopology, operationalState } from './agents';
import type { AgentRow, ProviderRow } from './agents';

const gemini: ProviderRow = { id: 'gemini', name: 'Google Gemini API', kind: 'external', chat_model: 'gemini-2.5-flash', max_classification: 'public', retains_data: true, enabled: true };
const ollama: ProviderRow = { id: 'ollama', name: 'Ollama on ai-lap', kind: 'local', chat_model: 'gemma3:12b', max_classification: 'restricted', retains_data: false, enabled: false };
const agent = (over: Partial<AgentRow>): AgentRow => ({ id: 'hr', name: 'HR', status: 'idle', model: 'gemini-2.5-flash', host: 'gemini', approval_level: 3, provider_id: 'gemini', classification: 'restricted', enabled: true, disabled_reason: null, ...over });

const localPrimaryMigration=readFileSync(new URL('../supabase/migrations/202609060005_ollama_primary_gemini_fallback.sql',import.meta.url),'utf8');
const localRunner=readFileSync(new URL('../supabase/functions/ai-lap-runner/index.ts',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../supabase/functions/llm-gateway/index.ts',import.meta.url),'utf8');
const agentPage=readFileSync(new URL('./agent-admin/agent-admin-page.tsx',import.meta.url),'utf8');
const agentApi=readFileSync(new URL('./agent-admin/api.ts',import.meta.url),'utf8');
const agentDetail=readFileSync(new URL('./agent-admin/agent-detail.tsx',import.meta.url),'utf8');
const telemetryMigration=readFileSync(new URL('../supabase/migrations/202609070002_owner_command_center_metrics.sql',import.meta.url),'utf8');
const hostRunner=readFileSync(new URL('../infra/ai-lap/reid_agent_runner.py',import.meta.url),'utf8');
const cleanupAndWeb=readFileSync(new URL('../supabase/migrations/202609300001_cleanup_synthetic_data_and_enable_agent_web.sql',import.meta.url),'utf8');

describe('agent gateway policy', () => {
  it('orders classifications from public to restricted', () => {
    expect(rank('public')).toBeLessThan(rank('internal'));
    expect(rank('confidential')).toBeLessThan(rank('restricted'));
  });

  it('keeps company data away from a free-tier external provider', () => {
    expect(providerAccepts(gemini, 'restricted')).toBe(false);
    expect(providerAccepts(gemini, 'confidential')).toBe(false);
    // The free tier may reuse submitted content, so even internal data is refused.
    expect(providerAccepts(gemini, 'internal')).toBe(false);
    expect(providerAccepts(gemini, 'public')).toBe(true);
  });

  it('refuses a disabled provider even within its ceiling', () => {
    expect(providerAccepts(ollama, 'restricted')).toBe(false);
  });

  it('lets a caller raise but never lower the agent ceiling', () => {
    expect(effectiveClassification('internal', 'restricted')).toBe('restricted');
    expect(effectiveClassification('internal', 'public')).toBe('internal');
  });

  it('holds L2 and above for human approval', () => {
    expect(needsApproval(1)).toBe(false);
    expect(needsApproval(2)).toBe(true);
    expect(needsApproval(4)).toBe(true);
  });

  it('blocks the restricted HR agent while only Gemini is enabled', () => {
    expect(canRun(agent({}), gemini)).toBe(false);
  });

  it('blocks an internal agent on the free tier but clears it on the local provider', () => {
    const operations = agent({ id: 'operations', classification: 'internal', approval_level: 1 });
    expect(canRun(operations, gemini)).toBe(false);
    expect(canRun({ ...operations, provider_id: 'ollama' }, { ...ollama, enabled: true })).toBe(true);
  });

  it('allows a public marketing agent on Gemini but not while paused', () => {
    const marketing = agent({ id: 'marketing', classification: 'public', approval_level: 2 });
    expect(canRun(marketing, gemini)).toBe(true);
    expect(canRun({ ...marketing, status: 'paused' }, gemini)).toBe(false);
  });

  it('models one governed tree with CEO as its only root', () => {
    expect(agentTopology).toHaveLength(10);
    expect(agentTopology.filter(node => node.parent === null).map(node => node.id)).toEqual(['ceo']);
    expect(agentTopology.filter(node => node.parent && !agentTopology.some(parent => parent.id === node.parent))).toEqual([]);
  });

  it('shows security blocks separately from pause and approval states', () => {
    expect(operationalState(agent({ enabled: false }), gemini, [])).toBe('blocked');
    expect(operationalState(agent({ id: 'marketing', classification: 'public', status: 'paused' }), gemini, [])).toBe('paused');
    expect(operationalState(agent({ id: 'marketing', classification: 'public' }), gemini, [{ id: 'r', agent_id: 'marketing', provider_id: 'gemini', classification: 'public', run_state: 'pending_approval', approval_level: 2, approval_state: 'pending', latency_ms: null, token_usage: null, quality_score: null, quality_flags: [], revision_count: 0, output_preview: null, error: null, created_at: '' }])).toBe('approval');
  });
});

describe('ai-lap primary runtime contract', () => {
  it('assigns every governed agent to the verified local model',()=>{
    expect(localPrimaryMigration).toContain("provider_id='ollama'");
    expect(localPrimaryMigration).toContain("model='gemma4:12b'");
    expect(localPrimaryMigration).toContain("'fallback_provider','gemini'");
  });

  it('uses Gemini only after a claimed local generation fails',()=>{
    expect(localRunner).toContain('completeWithGeminiFallback');
    expect(localRunner).toContain('local_failed_gemini_fallback');
    expect(localRunner).toContain("fallback:'gemini'");
  });

  it('feeds live host telemetry into the Owner-only command center',()=>{
    expect(hostRunner).toContain('nvidia-smi');
    expect(hostRunner).toContain('memoryUsedGb');
    expect(localRunner).toContain('gpu_utilization');
    expect(telemetryMigration).toContain("agent_runner_status");
    expect(telemetryMigration).toContain("supabase_realtime");
    // ai-lap telemetry is shown to those who manage agents (is_admin), never to HR.
    expect(agentPage).toContain("{manage && (");
    expect(agentPage).toContain("<RunnerCard");
    expect(agentApi).toContain("postgres_changes");
    expect(agentApi).toContain("table: 'agent_runner_status'");
  });

  it('uses the compact operating roster without the experimental 3D world',()=>{
    expect(agentPage).toContain('className="agents-grid"');
    expect(agentDetail).toContain('className="agent-page"');
    for (const source of [agentPage, agentDetail]) {
      expect(source).not.toContain('AgentWorld');
      expect(source).not.toContain('agent-world');
    }
  });
});

describe('agent team room runtime contract',()=>{
  it('binds every generated room reply to an authorized room and a real run',()=>{
    expect(gateway).toContain("from('agent_rooms')");
    expect(gateway).toContain(".eq('created_by',requesterId)");
    expect(gateway).toContain("from('agent_room_messages').insert");
    expect(gateway).toContain('run_id:created.id');
  });

  it('persists the complete asynchronous output back into the room',()=>{
    expect(localRunner).toContain("from('agent_room_messages').update");
    expect(localRunner).toContain('patch.body=body.slice(0,12000)');
    expect(localRunner).toContain("updateAgentRoomMessage(admin,run.data.id,'completed',output,null)");
  });
});

describe('governed web tools',()=>{
  it('implements both registered web tools with bounded Tavily output',()=>{
    expect(gateway).toContain("case 'web.search'");
    expect(gateway).toContain("case 'web.read'");
    expect(gateway).toContain("Math.min(8");
    expect(gateway).toContain("text(row?.raw_content, 8000)");
    expect(gateway).toContain("consume_web_search_quota");
  });

  it('blocks local or credentialed URLs before extraction',()=>{
    expect(gateway).toContain("url.protocol !== 'https:'");
    expect(gateway).toContain("host === 'localhost'");
    expect(gateway).toContain("url.username || url.password");
  });

  it('restores search and read assignments for every active specialist',()=>{
    expect(cleanupAndWeb).toContain("('web.search'),('web.read')");
    expect(cleanupAndWeb).toContain("where a.enabled and a.id <> 'finance'");
  });
});

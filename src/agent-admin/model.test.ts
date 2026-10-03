import { describe, expect, it } from 'vitest';
import type { AgentRow, ProviderRow, RunRow, RunnerStatusRow } from '../agents';
import {
  ageLabel, agentName, blockReason, failedRunsLine, lastRunsLine, canManageAgents, canToggleAgents, describeToolResult, levelLabel, providerRisk, rosterOrder,
  runnerHealth, stateCounts, toolArguments, toolFields,
} from './model';

const agent = (over: Partial<AgentRow>): AgentRow => ({
  id: 'operations', name: 'Operations', status: 'idle', model: 'gemma4:12b', host: 'ollama', approval_level: 1, provider_id: 'ollama',
  classification: 'internal', enabled: true, disabled_reason: null, ...over,
});
const ollama: ProviderRow = { id: 'ollama', name: 'Ollama on ai-lap', kind: 'local', chat_model: 'gemma4:12b', max_classification: 'restricted', retains_data: false, enabled: true };
const gemini: ProviderRow = { id: 'gemini', name: 'Google Gemini API', kind: 'external', chat_model: 'gemini-2.5-flash', max_classification: 'public', retains_data: true, enabled: true };
const run = (over: Partial<RunRow>): RunRow => ({
  id: 'r', agent_id: 'operations', provider_id: 'ollama', classification: 'internal', run_state: 'succeeded', approval_level: 0,
  approval_state: 'not_required', latency_ms: null, token_usage: null, quality_score: null, quality_flags: [], revision_count: 0,
  output_preview: null, error: null, requested_tool: null, request_summary: {}, created_at: '2026-09-29T08:00:00Z', ...over,
});

describe('who manages agents', () => {
  it('mirrors is_admin for reading and pausing, and keeps enabling with the owner', () => {
    expect(canManageAgents(['admin'])).toBe(true);
    expect(canManageAgents(['hr'])).toBe(false);
    expect(canToggleAgents(['super_admin'])).toBe(false);
    expect(canToggleAgents(['owner'])).toBe(true);
  });
});

describe('the roster', () => {
  it('follows the operating map and leaves a retired agent out', () => {
    const order = rosterOrder([
      agent({ id: 'support' }), agent({ id: 'finance', enabled: false }), agent({ id: 'ceo' }), agent({ id: 'lab', name: 'Lab' }),
    ]).map(item => item.id);
    expect(order).toEqual(['ceo', 'support', 'lab']);
  });

  it('names known agents in Arabic and falls back to the stored name', () => {
    expect(agentName(agent({ id: 'ceo' }), 'ar')).toBe('المدير المنسّق');
    expect(agentName(agent({ id: 'lab', name: 'Lab' }), 'ar')).toBe('Lab');
  });

  it('counts each agent once by its operational state', () => {
    const counts = stateCounts(
      [agent({}), agent({ id: 'hr', classification: 'restricted', provider_id: 'gemini' }), agent({ id: 'sales', status: 'paused' })],
      [ollama, gemini], [run({ agent_id: 'operations', run_state: 'running' })],
    );
    expect(counts).toMatchObject({ working: 1, blocked: 1, paused: 1, ready: 0 });
  });
});

describe('why an agent cannot run', () => {
  it('names the first thing to fix', () => {
    expect(blockReason(agent({ enabled: false }), ollama)).toBe('disabled');
    expect(blockReason(agent({}), undefined)).toBe('no_provider');
    expect(blockReason(agent({}), { ...ollama, enabled: false })).toBe('provider_disabled');
    expect(blockReason(agent({ classification: 'confidential' }), gemini)).toBe('clearance');
    expect(blockReason(agent({}), ollama)).toBeNull();
  });
});

describe('provider risk', () => {
  it('flags an external service cleared above public data, even while it is off', () => {
    expect(providerRisk(gemini)).toBeNull();
    expect(providerRisk({ ...gemini, max_classification: 'restricted', enabled: false })).toBe('dormant_sensitive');
    expect(providerRisk({ ...gemini, max_classification: 'internal' })).toBe('retains_sensitive');
    expect(providerRisk(ollama)).toBeNull();
  });
});

describe('ai-lap health', () => {
  const runner: RunnerStatusRow = {
    id: 'ai-lap', status: 'online', version: '1.3.0', model: 'gemma4:12b', gpu: 'RTX', ping_ms: 40, adapter_latency_ms: 85, cpu_percent: 20,
    memory_used_gb: 8, memory_total_gb: 32, gpu_utilization: 50, vram_used_mb: 9000, vram_total_mb: 12000, last_seen_at: '2026-09-29T08:00:00Z',
  };
  const at = (seconds: number) => new Date('2026-09-29T08:00:00Z').getTime() + seconds * 1000;

  it('is online only with a recent heartbeat', () => {
    expect(runnerHealth(runner, at(30)).online).toBe(true);
    expect(runnerHealth(runner, at(120)).online).toBe(false);
    expect(runnerHealth({ ...runner, status: 'degraded' }, at(5)).online).toBe(false);
    expect(runnerHealth(null).online).toBe(false);
  });

  it('reports memory and VRAM as shares', () => {
    expect(runnerHealth(runner, at(1))).toMatchObject({ memory: 25, vram: 75, ageSeconds: 1 });
  });

  it('writes the heartbeat age in plain words', () => {
    expect(ageLabel(12, 'ar')).toBe('قبل 12 ث');
    expect(ageLabel(300, 'en')).toBe('5 min ago');
    expect(ageLabel(null, 'ar')).toBe('—');
  });
});

describe('approval levels', () => {
  it('mirrors can_approve_level and clamps out-of-range values', () => {
    expect(levelLabel(3, 'ar')).toBe('يحتاج موافقة الإدارة أو الموارد البشرية');
    expect(levelLabel(9, 'en')).toBe('Needs the owner');
  });
});

describe('tool forms', () => {
  const schema = { required: ['title'], properties: { title: { type: 'string' }, due_at: { type: 'string' }, priority: { type: 'integer' }, description: { type: 'string' }, project_id: { type: 'string' } } };

  it('asks for required fields first and types them from the schema', () => {
    expect(toolFields(schema)).toEqual([
      { key: 'title', required: true, kind: 'text' },
      { key: 'due_at', required: false, kind: 'datetime' },
      { key: 'priority', required: false, kind: 'number' },
      { key: 'description', required: false, kind: 'textarea' },
      { key: 'project_id', required: false, kind: 'text' },
    ]);
    expect(toolFields({ required: ['url'] })).toEqual([{ key: 'url', required: true, kind: 'url' }]);
    expect(toolFields({})).toEqual([]);
  });

  it('drops empty optional fields and converts numbers and times', () => {
    const args = toolArguments(toolFields(schema), { title: ' Call the client ', priority: '2', due_at: '2026-10-01T09:30', description: '' });
    expect(args).toEqual({ title: 'Call the client', priority: 2, due_at: new Date('2026-10-01T09:30').toISOString() });
  });

  it('describes a result without dumping JSON', () => {
    expect(describeToolResult([1, 2, 3], 'ar')).toBe('3 نتائج.');
    expect(describeToolResult([1, 2], 'ar')).toBe('نتيجتان.');
    expect(describeToolResult([], 'ar')).toBe('لا نتائج.');
    expect(describeToolResult({ title: 'Kickoff' }, 'en')).toBe('Done: Kickoff');
    expect(describeToolResult(null, 'en')).toBe('Completed.');
  });
});

describe('Arabic counts', () => {
  it('agree with their numbers', () => {
    expect(failedRunsLine(0, 'ar')).toBe('لا تشغيلات فاشلة خلال 24 ساعة');
    expect(failedRunsLine(1, 'ar')).toBe('تشغيل واحد فشل خلال 24 ساعة');
    expect(failedRunsLine(2, 'ar')).toBe('تشغيلان فشلا خلال 24 ساعة');
    expect(failedRunsLine(4, 'ar')).toBe('4 تشغيلات فشلت خلال 24 ساعة');
    expect(lastRunsLine(1, 'ar')).toBe('من آخر تشغيل');
    expect(lastRunsLine(20, 'ar')).toBe('من آخر 20 تشغيلًا');
  });
});

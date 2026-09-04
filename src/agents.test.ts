import { describe, it, expect } from 'vitest';
import { providerAccepts, effectiveClassification, needsApproval, canRun, rank } from './agents';
import type { AgentRow, ProviderRow } from './agents';

const gemini: ProviderRow = { id: 'gemini', name: 'Google Gemini API', kind: 'external', chat_model: 'gemini-2.5-flash', max_classification: 'public', retains_data: true, enabled: true };
const ollama: ProviderRow = { id: 'ollama', name: 'Ollama on ai-lap', kind: 'local', chat_model: 'gemma3:12b', max_classification: 'restricted', retains_data: false, enabled: false };
const agent = (over: Partial<AgentRow>): AgentRow => ({ id: 'hr', name: 'HR', status: 'idle', model: 'gemini-2.5-flash', host: 'gemini', approval_level: 3, provider_id: 'gemini', classification: 'restricted', enabled: true, disabled_reason: null, ...over });

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
});

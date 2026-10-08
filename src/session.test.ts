import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, isSessionIdle, requiresMfa } from './session';

describe('session inactivity policy', () => {
  it('keeps an active session before twenty minutes', () => {
    expect(isSessionIdle(1_000, 1_000 + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });
  it('expires at twenty minutes', () => {
    expect(isSessionIdle(1_000, 1_000 + IDLE_TIMEOUT_MS)).toBe(true);
  });
});

describe('MFA assurance policy', () => {
  it('challenges an AAL1 session that has a verified second factor', () => {
    expect(requiresMfa('aal1', 'aal2')).toBe(true);
  });
  it('does not challenge an AAL2 session again', () => {
    expect(requiresMfa('aal2', 'aal2')).toBe(false);
  });
  it('fails closed when Supabase cannot resolve assurance', () => {
    expect(requiresMfa('aal1', 'aal2', true)).toBe(true);
  });
});

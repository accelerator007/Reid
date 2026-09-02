import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, isSessionIdle } from './session';

describe('session inactivity policy', () => {
  it('keeps an active session before twenty minutes', () => {
    expect(isSessionIdle(1_000, 1_000 + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });
  it('expires at twenty minutes', () => {
    expect(isSessionIdle(1_000, 1_000 + IDLE_TIMEOUT_MS)).toBe(true);
  });
});

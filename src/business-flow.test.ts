import { describe, expect, it } from 'vitest';
import { flowStages, nextBusinessStage } from './business-flow';

describe('business flow contract', () => {
  it('keeps the operating board in lifecycle order', () => {
    expect(flowStages).toEqual(['opportunity','quoted','contracted','delivery','invoiced','collected']);
  });

  it('allows only the next accountable stage', () => {
    expect(nextBusinessStage('opportunity')).toBe('quoted');
    expect(nextBusinessStage('quoted')).toBe('contracted');
    expect(nextBusinessStage('contracted')).toBe('delivery');
    expect(nextBusinessStage('delivery')).toBe('invoiced');
    expect(nextBusinessStage('invoiced')).toBeNull();
    expect(nextBusinessStage('collected')).toBe('closed');
  });

  it('does not advance terminal cases', () => {
    expect(nextBusinessStage('closed')).toBeNull();
    expect(nextBusinessStage('cancelled')).toBeNull();
  });
});

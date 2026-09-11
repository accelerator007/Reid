import { describe, expect, it } from 'vitest';
import { flowStages, nextBusinessStage } from './business-flow';
import { documentTotals, linePayload } from './finance-documents';

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

  it('calculates commercial totals from line items, discount, and tax', () => {
    expect(documentTotals([
      { quantity: 2, unit_price: 100 },
      { quantity: 1, unit_price: 50 },
    ], 10, 5)).toEqual({ subtotal: 250, net: 240, tax: 12, total: 252 });
  });

  it('strips local editor keys before sending document items', () => {
    expect(linePayload([{ key: 'local-only', description: ' Service ', quantity: 1, unit_price: 25 }]))
      .toEqual([{ description: 'Service', quantity: 1, unit_price: 25 }]);
  });
});

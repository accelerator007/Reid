import { describe, expect, it } from 'vitest';
import { closingSoon, followUpTarget, followUpsDue, optionOf, leadStages, reportFigures, type Deal, type FollowUp, type Lead, type Report } from './model';

const now = new Date('2026-09-29T08:00:00Z');
const lead = (id: string, stage: string, next: string | null): Lead => ({ id, title: id, stage, probability: 20, next_follow_up_at: next, company_id: null, contact_id: null, owner_id: null });
const deal = (id: string, stage: string, close: string | null): Deal => ({ id, title: id, stage, expected_close_date: close, company_id: null, contact_id: null, owner_id: null });

describe('clients pipeline', () => {
  it('lists open leads whose follow-up is due, oldest first', () => {
    const due = followUpsDue([
      lead('later', 'new', '2026-10-02T08:00:00Z'), lead('old', 'qualified', '2026-09-25T08:00:00Z'),
      lead('now', 'proposal', '2026-09-29T07:00:00Z'), lead('done', 'converted', '2026-09-20T08:00:00Z'), lead('none', 'new', null),
    ], now);
    expect(due.map(item => item.id)).toEqual(['old', 'now']);
  });

  it('finds open deals closing within two weeks', () => {
    const soon = closingSoon([
      deal('a', 'proposal', '2026-10-05'), deal('b', 'negotiation', '2026-09-29'), deal('far', 'discovery', '2026-11-30'),
      deal('won', 'won', '2026-10-01'), deal('past', 'proposal', '2026-09-20'),
    ], now);
    expect(soon.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('translates stages and keeps unknown ones readable', () => {
    expect(optionOf(leadStages, 'negotiation').label.ar).toBe('تفاوض');
    expect(optionOf(leadStages, 'custom').label.en).toBe('custom');
  });

  it('knows what a follow-up is about', () => {
    const item: FollowUp = { id: 'f', activity_type: 'call', subject: 's', due_at: null, completed_at: null, created_at: '', company_id: 'c', contact_id: null, lead_id: 'l', deal_id: null };
    expect(followUpTarget(item)).toEqual({ kind: 'lead', id: 'l' });
    expect(followUpTarget({ ...item, lead_id: null })).toEqual({ kind: 'company', id: 'c' });
  });

  it('shows only numeric report metrics with readable labels', () => {
    const report: Report = { id: 'r', period: 'weekly', period_start: '', period_end: '', generated_at: '', email_status: 'sent', metrics: { new_leads: 4, open_deals: 2, alerts: [{ kind: 'x' }] as unknown as number, custom_count: 7 } };
    expect(reportFigures(report, 'ar')).toEqual([
      { key: 'new_leads', label: 'فرص جديدة', value: 4 }, { key: 'open_deals', label: 'صفقات مفتوحة', value: 2 }, { key: 'custom_count', label: 'custom count', value: 7 },
    ]);
  });
});

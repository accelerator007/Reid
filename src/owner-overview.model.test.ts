import { describe, expect, it } from 'vitest';
import { agentHealth, arabicCount, arabicForms, decisions, greeting, projectsNeedingAttention, summaryLine, type Snapshot } from './owner-overview.model';

const snapshot = (alerts: Partial<Snapshot['alerts']> = {}): Snapshot => ({
  as_of: '2026-09-29T08:00:00Z',
  metrics: { active_people: 14, active_projects: 3 },
  alerts: { overdue_tasks: 0, pending_approvals: 0, pending_applications: 0, failed_agent_runs_7d: 0, ...alerts },
  projects: [
    { id: 'a', name: 'On track', status: 'active', target_date: null, overdue_tasks: 0, risk_count: 0 },
    { id: 'b', name: 'Late', status: 'active', target_date: null, overdue_tasks: 3, risk_count: 0 },
    { id: 'c', name: 'At risk', status: 'active', target_date: null, overdue_tasks: 1, risk_count: 2 },
  ],
});

describe('owner decisions', () => {
  it('lists only what has a count, approvals first, each opening its own page', () => {
    const items = decisions(snapshot({ overdue_tasks: 3, pending_approvals: 2, pending_applications: 1 }));
    expect(items.map(item => [item.key, item.count, item.page])).toEqual([
      ['approvals', 2, 'admin'], ['tasks', 3, 'projects'], ['applications', 1, 'dashboard'],
    ]);
  });

  it('is empty when nothing is pending', () => {
    expect(decisions(snapshot())).toEqual([]);
  });

  it('orders projects by risk, then overdue work', () => {
    expect(projectsNeedingAttention(snapshot()).map(project => project.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('greeting and summary', () => {
  it('greets by Muscat time with the first name', () => {
    expect(greeting(new Date('2026-09-29T04:00:00Z'), 'ar', 'شيخة المعمري')).toBe('صباح الخير، شيخة');
    expect(greeting(new Date('2026-09-29T11:00:00Z'), 'en', 'Ali Reid')).toBe('Good afternoon, Ali');
    expect(greeting(new Date('2026-09-29T16:00:00Z'), 'ar', 'owner@reid.test')).toBe('مساء النور');
  });

  it('counts Arabic nouns correctly', () => {
    const one = decisions(snapshot({ pending_approvals: 1 }));
    const two = decisions(snapshot({ pending_approvals: 2 }));
    const six = decisions(snapshot({ pending_approvals: 2, overdue_tasks: 4 }));
    const many = decisions(snapshot({ overdue_tasks: 12 }));
    expect(summaryLine(one, 'ar')).toBe('أمر واحد يحتاج قرارك اليوم.');
    expect(summaryLine(two, 'ar')).toBe('أمران يحتاجان قرارك اليوم.');
    expect(summaryLine(six, 'ar')).toBe('6 أمور تحتاج قرارك اليوم.');
    expect(summaryLine(many, 'ar')).toBe('12 أمرًا تحتاج قرارك اليوم.');
    expect(summaryLine([], 'en')).toBe('Nothing is waiting on you right now.');
  });
});

describe('agent health', () => {
  const now = new Date('2026-09-29T08:00:00Z');
  it('reads the runner heartbeat', () => {
    expect(agentHealth({ status: 'online', last_seen_at: '2026-09-29T07:59:30Z' }, now)).toBe('online');
    expect(agentHealth({ status: 'degraded', last_seen_at: '2026-09-29T07:59:30Z' }, now)).toBe('degraded');
    expect(agentHealth({ status: 'online', last_seen_at: '2026-09-29T07:40:00Z' }, now)).toBe('offline');
    expect(agentHealth(null, now)).toBe('unknown');
  });
});

describe('arabic counting', () => {
  it('uses the right form for 1, 2, 3–10 and 11+', () => {
    expect(arabicCount(1, arabicForms.overdueTasks)).toBe('مهمة متأخرة');
    expect(arabicCount(2, arabicForms.overdueTasks)).toBe('مهمتان متأخرتان');
    expect(arabicCount(4, arabicForms.overdueTasks)).toBe('4 مهام متأخرة');
    expect(arabicCount(15, arabicForms.overdueTasks)).toBe('15 مهمة متأخرة');
  });
});

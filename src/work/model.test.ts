import { describe, expect, it } from 'vitest';
import { allowedKinds, filterRecords, groupTasks, isPastDue, statusOptions, type MyTask, type WorkRecord } from './model';

describe('record access mirrors the database', () => {
  it('gives each role the record types work_record_access allows', () => {
    expect(allowedKinds(['owner'])).toEqual(['ticket', 'leave', 'goal', 'decision', 'content', 'asset', 'contract']);
    expect(allowedKinds(['admin'])).toEqual(['ticket', 'leave', 'goal', 'decision', 'content', 'asset']);
    expect(allowedKinds(['employee'])).toEqual(['ticket', 'leave']);
    expect(allowedKinds(['hr'])).toEqual(['ticket', 'leave']);
  });

  it('only lets HR and the owners move a leave request past open/cancelled', () => {
    expect(statusOptions('leave', ['employee'], 'open')).toEqual(['open', 'cancelled']);
    expect(statusOptions('leave', ['employee'], 'done')).toEqual(['done']);
    expect(statusOptions('leave', ['hr'], 'open')).toHaveLength(5);
    expect(statusOptions('ticket', ['employee'], 'open')).toHaveLength(5);
  });

  it('filters by kind, status and text', () => {
    const record = (id: string, kind: WorkRecord['kind'], status: WorkRecord['status'], title: string): WorkRecord =>
      ({ id, kind, status, title, description: '', owner_id: 'u', assigned_to: null, due_date: null, created_at: '' });
    const rows = [record('a', 'ticket', 'open', 'الطابعة لا تعمل'), record('b', 'ticket', 'done', 'VPN access'), record('c', 'leave', 'open', 'إجازة')];
    expect(filterRecords(rows, 'ticket', 'all', '').map(r => r.id)).toEqual(['a', 'b']);
    expect(filterRecords(rows, 'ticket', 'done', '').map(r => r.id)).toEqual(['b']);
    expect(filterRecords(rows, 'ticket', 'all', 'vpn').map(r => r.id)).toEqual(['b']);
  });
});

describe('my day', () => {
  const now = new Date('2026-09-29T08:00:00Z'); // 12:00 in Muscat
  const task = (id: string, due_at: string | null, priority = 2): MyTask => ({ id, title: id, status: 'todo', priority, due_at, project_id: null });

  it('groups open tasks by Muscat day', () => {
    const groups = groupTasks([
      task('late', '2026-09-27T10:00:00Z'), task('this-morning', '2026-09-29T04:00:00Z'), task('tonight', '2026-09-29T17:00:00Z'),
      task('next-week', '2026-10-05T10:00:00Z'), task('someday', null),
    ], now);
    expect(groups.overdue.map(t => t.id)).toEqual(['late']);
    expect(groups.today.map(t => t.id)).toEqual(['this-morning', 'tonight']);
    expect(groups.upcoming.map(t => t.id)).toEqual(['next-week']);
    expect(groups.undated.map(t => t.id)).toEqual(['someday']);
  });

  it('treats a date-only due date as the whole Muscat day', () => {
    expect(isPastDue('2026-09-28', now)).toBe(true);
    expect(isPastDue('2026-09-29', now)).toBe(false);
    expect(isPastDue(null, now)).toBe(false);
  });
});

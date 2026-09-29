import { describe, expect, it } from 'vitest';
import {
  daysUntil, describeActivity, filterProjects, isOverdue, labelOf, memberRoles, progress, projectHealth, projectStatuses, statusOf,
  type Project, type Task,
} from './model';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p', name: 'منصة الحجز', type: 'client', description: 'نظام حجز', manager_id: 'u1', client_name: 'شركة الأمل',
  status: 'active', github_repo: null, start_date: null, target_date: '2026-10-15', archived_at: null, ...overrides,
});
const task = (status: string, due_at: string | null = null): Task => ({ id: status, title: status, description: null, status, priority: 2, assignee_id: null, due_at });
const now = new Date('2026-09-29T08:00:00Z');

describe('project labels', () => {
  it('translates stored values and falls back to the raw value', () => {
    expect(statusOf(projectStatuses, 'on_hold').label.ar).toBe('متوقف مؤقتًا');
    expect(statusOf(projectStatuses, 'archived-ish').label.en).toBe('archived-ish');
    expect(labelOf(memberRoles, 'lead', 'ar')).toBe('قائد');
  });

  it('turns activity rows into sentences', () => {
    expect(describeActivity({ id: 1, actor_id: 'u', action: 'INSERT', entity_type: 'tasks', entity_id: 't', details: {}, created_at: '' }, 'ar')).toBe('إضافة مهمة');
    expect(describeActivity({ id: 2, actor_id: 'u', action: 'UPDATE', entity_type: 'projects', entity_id: 'p', details: {}, created_at: '' }, 'en')).toBe('Updated the project');
  });
});

describe('project health and progress', () => {
  it('derives health from the target date, status and overdue work', () => {
    expect(projectHealth(project(), now)).toBe('on_track');
    expect(projectHealth(project(), now, 2)).toBe('at_risk');
    expect(projectHealth(project({ status: 'on_hold' }), now)).toBe('at_risk');
    expect(projectHealth(project({ target_date: '2026-09-01' }), now)).toBe('late');
    expect(projectHealth(project({ status: 'completed', target_date: '2026-09-01' }), now)).toBe('done');
    expect(projectHealth(project({ target_date: null }), now)).toBe('unscheduled');
  });

  it('measures progress and overdue tasks', () => {
    expect(progress([task('done'), task('todo'), task('done'), task('review')])).toBe(50);
    expect(progress([])).toBe(0);
    expect(isOverdue(task('todo', '2026-09-20T00:00:00Z'), now)).toBe(true);
    expect(isOverdue(task('done', '2026-09-20T00:00:00Z'), now)).toBe(false);
  });

  it('counts days to a target in Muscat time', () => {
    expect(daysUntil('2026-10-01', now)).toBe(2);
    expect(daysUntil('2026-09-25', now)).toBe(-4);
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe('directory filter', () => {
  const people = [{ id: 'u1', full_name: 'علي', email: '' }];
  const all = [project({ id: 'a' }), project({ id: 'b', name: 'Research hub', status: 'planning', client_name: null }), project({ id: 'c', archived_at: '2026-09-01' })];

  it('filters by archive state, status and a query across name, client and manager', () => {
    expect(filterProjects(all, { query: '', status: 'all', archived: false }, people).map(p => p.id)).toEqual(['a', 'b']);
    expect(filterProjects(all, { query: '', status: 'all', archived: true }, people).map(p => p.id)).toEqual(['c']);
    expect(filterProjects(all, { query: '', status: 'planning', archived: false }, people).map(p => p.id)).toEqual(['b']);
    expect(filterProjects(all, { query: 'الأمل', status: 'all', archived: false }, people).map(p => p.id)).toEqual(['a']);
    expect(filterProjects(all, { query: 'علي', status: 'all', archived: false }, people).map(p => p.id)).toEqual(['a', 'b']);
  });
});

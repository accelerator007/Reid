import { describe, expect, it } from 'vitest';
import {
  averageRating, canManage, filterPeople, formatMinutes, initials, minutesThisWeek, onboardingProgress,
  type Department, type Person, type Timesheet,
} from './model';

const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id, full_name: 'مريم البلوشية', email: `${id}@reid.test`, phone: null, position: 'مطورة واجهات', department: null,
  department_id: 'dev', hire_date: null, employment_status: 'active', ...overrides,
});
const departments: Department[] = [
  { id: 'dev', name_ar: 'التطوير', name_en: 'Engineering', description: null, manager_id: 'lead' },
  { id: 'ops', name_ar: 'العمليات', name_en: 'Operations', description: null, manager_id: 'other' },
];

describe('people permissions', () => {
  it('lets staff and the department manager manage a person', () => {
    expect(canManage(['hr'], 'x', person('p'), departments)).toBe(true);
    expect(canManage(['employee'], 'lead', person('p'), departments)).toBe(true);
    expect(canManage(['employee'], 'lead', person('p', { department_id: 'ops' }), departments)).toBe(false);
    expect(canManage(['employee'], 'lead', person('p', { department_id: null }), departments)).toBe(false);
  });
});

describe('directory', () => {
  const people = [person('a'), person('b', { full_name: 'Said Al Kindi', position: 'DevOps', department_id: 'ops' })];
  it('filters by department and searches name, email, position and department', () => {
    expect(filterPeople(people, departments, '', 'ops', 'ar').map(p => p.id)).toEqual(['b']);
    expect(filterPeople(people, departments, 'التطوير', 'all', 'ar').map(p => p.id)).toEqual(['a']);
    expect(filterPeople(people, departments, 'devops', 'all', 'en').map(p => p.id)).toEqual(['b']);
  });
  it('makes initials from the first two names', () => {
    expect(initials('مريم البلوشية')).toBe('ما');
    expect(initials('Said Al Kindi')).toBe('SA');
    expect(initials('')).toBe('؟');
  });
});

describe('records arithmetic', () => {
  it('measures onboarding', () => {
    const item = (completed: boolean) => ({ id: String(Math.random()), user_id: 'a', title_ar: '', title_en: '', due_date: null, completed, completed_at: null });
    expect(onboardingProgress([item(true), item(false), item(true), item(true)])).toEqual({ done: 3, total: 4, percent: 75 });
    expect(onboardingProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('formats minutes in both languages', () => {
    expect(formatMinutes(200, 'ar')).toBe('3 س 20 د');
    expect(formatMinutes(120, 'en')).toBe('2h');
    expect(formatMinutes(0, 'ar')).toBe('0 د');
  });

  it('sums the Omani work week from Saturday', () => {
    const entry = (work_date: string, minutes: number): Timesheet => ({ id: work_date, user_id: 'a', task_id: null, minutes, work_date, notes: null });
    // Tuesday 29 September 2026: the week began on Saturday 26 September.
    const now = new Date('2026-09-29T08:00:00Z');
    expect(minutesThisWeek([entry('2026-09-25', 60), entry('2026-09-26', 90), entry('2026-09-29', 30)], now)).toBe(120);
  });

  it('averages review ratings to one decimal', () => {
    const review = (rating: number) => ({ id: String(rating), user_id: 'a', reviewer_id: 'b', period_start: '', period_end: '', rating, summary: '', strengths: null, improvements: null });
    expect(averageRating([review(4), review(5), review(4)])).toBe(4.3);
    expect(averageRating([])).toBeNull();
  });
});

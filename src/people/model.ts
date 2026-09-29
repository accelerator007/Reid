// People (/workspace): the directory and each person's onboarding, tasks,
// performance, documents and hours. Labels, permissions and arithmetic here;
// the database remains the authority on who may read or write what.
import type { Role } from '../policy';
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };

export type Person = {
  id: string; full_name: string; email: string; phone: string | null; position: string | null; department: string | null;
  department_id: string | null; hire_date: string | null; employment_status: string;
};
export type Department = { id: string; name_ar: string; name_en: string; description: string | null; manager_id: string | null };
export type Onboarding = { id: string; user_id: string; title_ar: string; title_en: string; due_date: string | null; completed: boolean; completed_at: string | null };
export type PersonTask = { id: string; title: string; description: string | null; status: string; priority: number; assignee_id: string | null; due_at: string | null };
export type CalendarEvent = { id: string; user_id: string | null; title: string; description: string | null; starts_at: string; ends_at: string; visibility: string };
export type Announcement = { id: string; title_ar: string; title_en: string; body_ar: string; body_en: string; published_at: string };
export type EmployeeDocument = { id: string; owner_id: string; title: string; category: string; storage_path: string; created_at: string };
export type EmployeeKpi = { id: string; user_id: string; title: string; target_value: number; current_value: number; unit: string; period_start: string; period_end: string; status: string };
export type Review = { id: string; user_id: string; reviewer_id: string; period_start: string; period_end: string; rating: number; summary: string; strengths: string | null; improvements: string | null };
export type Timesheet = { id: string; user_id: string; task_id: string | null; minutes: number; work_date: string; notes: string | null };

export const employmentStatuses: Record<string, { label: Label; tone: Tone }> = {
  active: { label: { ar: 'على رأس العمل', en: 'Active' }, tone: 'success' },
  onboarding: { label: { ar: 'قيد التهيئة', en: 'Onboarding' }, tone: 'info' },
  leave: { label: { ar: 'في إجازة', en: 'On leave' }, tone: 'warning' },
  inactive: { label: { ar: 'غير نشط', en: 'Inactive' }, tone: 'neutral' },
};
export const documentCategories: Record<string, Label> = {
  general: { ar: 'عام', en: 'General' },
  contract: { ar: 'عقد', en: 'Contract' },
  certificate: { ar: 'شهادة', en: 'Certificate' },
  policy: { ar: 'سياسة', en: 'Policy' },
  onboarding: { ar: 'تهيئة', en: 'Onboarding' },
};
export const taskStatuses: Record<string, { label: Label; tone: Tone }> = {
  todo: { label: { ar: 'للتنفيذ', en: 'To do' }, tone: 'neutral' },
  in_progress: { label: { ar: 'قيد العمل', en: 'In progress' }, tone: 'info' },
  review: { label: { ar: 'مراجعة', en: 'Review' }, tone: 'warning' },
  done: { label: { ar: 'منجز', en: 'Done' }, tone: 'success' },
};
export const kpiStatuses: Record<string, { label: Label; tone: Tone }> = {
  on_track: { label: { ar: 'على المسار', en: 'On track' }, tone: 'success' },
  at_risk: { label: { ar: 'في خطر', en: 'At risk' }, tone: 'danger' },
  achieved: { label: { ar: 'تحقق', en: 'Achieved' }, tone: 'brand' },
};

const has = (roles: readonly Role[], ...wanted: Role[]) => wanted.some(role => roles.includes(role));
export const isPeopleStaff = (roles: readonly Role[]) => has(roles, 'owner', 'super_admin', 'admin', 'hr');

/** Staff, or the manager of the person's department, may manage their records. */
export function canManage(roles: readonly Role[], viewerId: string, person: Person | undefined, departments: Department[]): boolean {
  if (isPeopleStaff(roles)) return true;
  if (!person?.department_id) return false;
  return departments.some(department => department.id === person.department_id && department.manager_id === viewerId);
}

export function departmentName(departments: Department[], person: Person, lang: Lang): string | null {
  const department = departments.find(item => item.id === person.department_id);
  return department ? (lang === 'ar' ? department.name_ar : department.name_en) : person.department;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('') || '؟';
}

export function filterPeople(people: Person[], departments: Department[], query: string, departmentId: 'all' | string, lang: Lang): Person[] {
  const wanted = query.trim().toLocaleLowerCase();
  return people
    .filter(person => departmentId === 'all' || person.department_id === departmentId)
    .filter(person => !wanted || [person.full_name, person.email, person.position, departmentName(departments, person, lang)]
      .some(value => value?.toLocaleLowerCase().includes(wanted)));
}

export function onboardingProgress(items: Onboarding[]): { done: number; total: number; percent: number } {
  const done = items.filter(item => item.completed).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/** "3 س 20 د" / "3h 20m" */
export function formatMinutes(minutes: number, lang: Lang): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === 'ar') return [hours && `${hours} س`, rest && `${rest} د`].filter(Boolean).join(' ') || '0 د';
  return [hours && `${hours}h`, rest && `${rest}m`].filter(Boolean).join(' ') || '0m';
}

/** Minutes logged in the current week (Saturday–Friday, the Omani work week), in Muscat time. */
export function minutesThisWeek(entries: Timesheet[], now: Date): number {
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now));
  const sinceSaturday = (today.getUTCDay() + 1) % 7;
  const start = new Date(today.getTime() - sinceSaturday * 86_400_000);
  return entries.filter(entry => new Date(entry.work_date) >= start && new Date(entry.work_date) <= today).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function averageRating(reviews: Review[]): number | null {
  if (!reviews.length) return null;
  return Math.round((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length) * 10) / 10;
}

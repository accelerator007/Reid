// Projects: types, labels in both languages and the pure rules the pages use.
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
export type Label = { ar: string; en: string };

export type Project = {
  id: string; name: string; type: string; description: string | null; manager_id: string | null;
  client_name: string | null; status: string; github_repo: string | null;
  start_date: string | null; target_date: string | null; archived_at: string | null; updated_at?: string | null;
};
export type Person = { id: string; full_name: string; email: string };
export type Member = { project_id: string; user_id: string; member_role: string };
export type Task = { id: string; title: string; description: string | null; status: string; priority: number; assignee_id: string | null; due_at: string | null };
export type Milestone = { id: string; title: string; description: string | null; due_date: string | null; status: string };
export type Meeting = { id: string; title: string; agenda: string | null; starts_at: string; ends_at: string; location: string | null; notes: string | null };
export type FileRow = { id: string; title: string; storage_path: string; category: string; restricted: boolean; uploaded_by: string; created_at: string };
export type FilePermission = { id: string; file_id: string; user_id: string | null; role: string | null; can_read: boolean; can_write: boolean };
export type Kpi = { id: string; title: string; target_value: number; current_value: number; unit: string; status: string };
export type Activity = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, string>; created_at: string };

export type ProjectDetail = {
  members: Member[]; tasks: Task[]; milestones: Milestone[]; meetings: Meeting[];
  files: FileRow[]; permissions: FilePermission[]; kpis: Kpi[]; activity: Activity[];
};

type Option = { label: Label; tone: Tone };
const option = (ar: string, en: string, tone: Tone): Option => ({ label: { ar, en }, tone });

export const projectStatuses: Record<string, Option> = {
  planning: option('تخطيط', 'Planning', 'info'),
  active: option('نشط', 'Active', 'success'),
  on_hold: option('متوقف مؤقتًا', 'On hold', 'warning'),
  completed: option('مكتمل', 'Completed', 'neutral'),
};
export const projectTypes: Record<string, Label> = {
  internal: { ar: 'داخلي', en: 'Internal' },
  client: { ar: 'لعميل', en: 'Client' },
  research: { ar: 'بحثي', en: 'Research' },
  product: { ar: 'منتج', en: 'Product' },
  competition: { ar: 'مسابقة', en: 'Competition' },
};
export const taskColumns: Record<string, Option> = {
  todo: option('للتنفيذ', 'To do', 'neutral'),
  in_progress: option('قيد العمل', 'In progress', 'info'),
  review: option('مراجعة', 'Review', 'warning'),
  done: option('منجز', 'Done', 'success'),
};
export const milestoneStatuses: Record<string, Option> = {
  planned: option('مخطط', 'Planned', 'neutral'),
  in_progress: option('قيد التنفيذ', 'In progress', 'info'),
  completed: option('مكتمل', 'Completed', 'success'),
  blocked: option('متعثر', 'Blocked', 'danger'),
};
export const kpiStatuses: Record<string, Option> = {
  on_track: option('على المسار', 'On track', 'success'),
  at_risk: option('في خطر', 'At risk', 'danger'),
  achieved: option('تحقق', 'Achieved', 'brand'),
};
export const memberRoles: Record<string, Label> = {
  manager: { ar: 'مدير المشروع', en: 'Manager' },
  lead: { ar: 'قائد', en: 'Lead' },
  member: { ar: 'عضو', en: 'Member' },
  client: { ar: 'عميل', en: 'Client' },
};
export const priorities: Record<number, Option> = {
  1: option('عاجلة', 'Urgent', 'danger'),
  2: option('عالية', 'High', 'warning'),
  3: option('متوسطة', 'Medium', 'info'),
  4: option('منخفضة', 'Low', 'neutral'),
};

export const priorityOf = (value: number): Option => priorities[value] ?? priorities[3];

const fallback = (value: string): Option => ({ label: { ar: value, en: value }, tone: 'neutral' });
export const statusOf = (table: Record<string, Option>, value: string) => table[value] ?? fallback(value);
export const labelOf = (table: Record<string, Label>, value: string, lang: Lang) => table[value]?.[lang] ?? value;

// Verbal nouns ("إضافة مهمة") read naturally for anyone, without assuming the
// actor's gender from their name; the actor is shown separately.
const entityNames: Record<string, Label> = {
  projects: { ar: 'المشروع', en: 'the project' },
  project_members: { ar: 'عضو', en: 'a member' },
  project_milestones: { ar: 'مرحلة', en: 'a milestone' },
  project_meetings: { ar: 'اجتماع', en: 'a meeting' },
  project_kpis: { ar: 'مؤشر', en: 'a KPI' },
  project_files: { ar: 'ملف', en: 'a file' },
  project_file_permissions: { ar: 'صلاحية ملف', en: 'a file permission' },
  tasks: { ar: 'مهمة', en: 'a task' },
};
const actionNouns: Record<string, Label> = {
  INSERT: { ar: 'إضافة', en: 'Added' },
  UPDATE: { ar: 'تحديث', en: 'Updated' },
  DELETE: { ar: 'حذف', en: 'Removed' },
};

/** "إضافة مهمة" / "Added a task" instead of "INSERT · tasks". */
export function describeActivity(entry: Activity, lang: Lang): string {
  const action = actionNouns[entry.action]?.[lang] ?? entry.action;
  const what = entityNames[entry.entity_type]?.[lang] ?? entry.entity_type;
  return `${action} ${what}`;
}

export type Health = 'on_track' | 'at_risk' | 'late' | 'done' | 'unscheduled';

/** A project's health from its target date, its status and its overdue work. */
export function projectHealth(project: Project, now: Date, overdueTasks = 0): Health {
  if (project.status === 'completed') return 'done';
  if (project.target_date && new Date(`${project.target_date}T23:59:59`) < now) return 'late';
  if (overdueTasks > 0 || project.status === 'on_hold') return 'at_risk';
  return project.target_date ? 'on_track' : 'unscheduled';
}
export const healthLabels: Record<Health, Option> = {
  on_track: option('على المسار', 'On track', 'success'),
  at_risk: option('يحتاج متابعة', 'Needs attention', 'warning'),
  late: option('تجاوز الموعد', 'Past target', 'danger'),
  done: option('مكتمل', 'Done', 'neutral'),
  unscheduled: option('بدون موعد', 'No target date', 'neutral'),
};

export function progress(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(task => task.status === 'done').length / tasks.length) * 100);
}

export const isOverdue = (task: Task, now: Date) => task.status !== 'done' && !!task.due_at && new Date(task.due_at) < now;

export type DirectoryFilter = { query: string; status: 'all' | string; archived: boolean };

export function filterProjects(projects: Project[], filter: DirectoryFilter, people: Person[]): Project[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return projects
    .filter(project => (filter.archived ? !!project.archived_at : !project.archived_at))
    .filter(project => filter.status === 'all' || project.status === filter.status)
    .filter(project => !query || [project.name, project.client_name, project.description, people.find(person => person.id === project.manager_id)?.full_name]
      .some(value => value?.toLocaleLowerCase().includes(query)));
}

export function formatDate(value: string | null, lang: Lang, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Muscat',
  }).format(date);
}

/** Days left (negative when late) until a date-only target, in Muscat time. */
export function daysUntil(target: string | null, now: Date): number | null {
  if (!target) return null;
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now));
  return Math.round((new Date(target).getTime() - today.getTime()) / 86_400_000);
}

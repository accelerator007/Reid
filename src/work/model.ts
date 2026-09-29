// Work records (/operations) and personal tasks (/today): labels, access
// rules mirrored from the database, and grouping. Pure, so it is tested.
import type { Role } from '../policy';
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };

export type WorkKind = 'goal' | 'ticket' | 'leave' | 'asset' | 'content' | 'decision' | 'contract';
export type WorkStatus = 'open' | 'in_progress' | 'review' | 'done' | 'cancelled';

export type WorkRecord = {
  id: string; kind: WorkKind; title: string; description: string; status: WorkStatus;
  owner_id: string; assigned_to: string | null; due_date: string | null; created_at: string;
};
export type MyTask = { id: string; title: string; status: string; priority: number; due_at: string | null; project_id: string | null };
export type Notice = { id: string; title_ar: string; title_en: string; body_ar?: string | null; body_en?: string | null; read_at: string | null; created_at: string };

export const workKinds: Record<WorkKind, { label: Label; one: Label; hint: Label }> = {
  ticket: { label: { ar: 'طلبات الدعم', en: 'Support' }, one: { ar: 'طلب دعم', en: 'Support request' }, hint: { ar: 'مشكلة تقنية أو طلب مساعدة', en: 'A problem or a request for help' } },
  leave: { label: { ar: 'الإجازات', en: 'Leave' }, one: { ar: 'طلب إجازة', en: 'Leave request' }, hint: { ar: 'تعتمدها الموارد البشرية أو الإدارة', en: 'Approved by HR or the owners' } },
  goal: { label: { ar: 'الأهداف', en: 'Goals' }, one: { ar: 'هدف', en: 'Goal' }, hint: { ar: 'نتيجة نريد الوصول لها بموعد', en: 'An outcome with a date' } },
  decision: { label: { ar: 'القرارات', en: 'Decisions' }, one: { ar: 'قرار', en: 'Decision' }, hint: { ar: 'قرار يحتاج توثيقًا ومتابعة', en: 'A decision to record and follow' } },
  content: { label: { ar: 'المحتوى', en: 'Content' }, one: { ar: 'عمل محتوى', en: 'Content item' }, hint: { ar: 'منشور أو مادة تسويقية', en: 'A post or marketing piece' } },
  asset: { label: { ar: 'العهد والأصول', en: 'Assets' }, one: { ar: 'عهدة', en: 'Asset' }, hint: { ar: 'جهاز أو أداة مسلّمة لشخص', en: 'Equipment handed to someone' } },
  contract: { label: { ar: 'العقود', en: 'Contracts' }, one: { ar: 'عقد', en: 'Contract' }, hint: { ar: 'متابعة توقيع وتجديد العقود', en: 'Signing and renewals' } },
};

export const workStatuses: Record<WorkStatus, { label: Label; tone: Tone }> = {
  open: { label: { ar: 'مفتوح', en: 'Open' }, tone: 'info' },
  in_progress: { label: { ar: 'قيد العمل', en: 'In progress' }, tone: 'brand' },
  review: { label: { ar: 'للمراجعة', en: 'In review' }, tone: 'warning' },
  done: { label: { ar: 'مكتمل', en: 'Done' }, tone: 'success' },
  cancelled: { label: { ar: 'ملغي', en: 'Cancelled' }, tone: 'neutral' },
};

const has = (roles: readonly Role[], ...wanted: Role[]) => wanted.some(role => roles.includes(role));

/** Mirrors public.work_record_access: which record types a person works with. */
export function allowedKinds(roles: readonly Role[]): WorkKind[] {
  const order: WorkKind[] = ['ticket', 'leave', 'goal', 'decision', 'content', 'asset', 'contract'];
  if (has(roles, 'owner', 'super_admin')) return order;
  return order.filter(kind => ['ticket', 'leave'].includes(kind) || (has(roles, 'admin') && ['goal', 'decision', 'content', 'asset'].includes(kind)));
}

/**
 * Mirrors public.guard_work_record: outside HR and the owners, a leave request
 * may only be opened or cancelled by its requester, never approved.
 */
export function statusOptions(kind: WorkKind, roles: readonly Role[], current: WorkStatus): WorkStatus[] {
  const all = Object.keys(workStatuses) as WorkStatus[];
  if (kind !== 'leave' || has(roles, 'owner', 'super_admin', 'hr')) return all;
  if (!['open', 'cancelled'].includes(current)) return [current];
  return ['open', 'cancelled'];
}

export function filterRecords(records: WorkRecord[], kind: WorkKind, status: 'all' | WorkStatus, query: string): WorkRecord[] {
  const wanted = query.trim().toLocaleLowerCase();
  return records
    .filter(record => record.kind === kind)
    .filter(record => status === 'all' || record.status === status)
    .filter(record => !wanted || `${record.title} ${record.description}`.toLocaleLowerCase().includes(wanted));
}

const muscatDay = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(value);

export type TaskGroup = 'overdue' | 'today' | 'upcoming' | 'undated';
export const taskGroupLabels: Record<TaskGroup, Label> = {
  overdue: { ar: 'متأخرة', en: 'Overdue' },
  today: { ar: 'اليوم', en: 'Today' },
  upcoming: { ar: 'قادمة', en: 'Coming up' },
  undated: { ar: 'بدون موعد', en: 'No date' },
};

/** My open tasks by when they are due, in Muscat days; urgent first inside a group. */
export function groupTasks(tasks: MyTask[], now: Date): Record<TaskGroup, MyTask[]> {
  const today = muscatDay(now);
  const groups: Record<TaskGroup, MyTask[]> = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const task of tasks) {
    if (!task.due_at) groups.undated.push(task);
    else if (new Date(task.due_at) < now && muscatDay(new Date(task.due_at)) !== today) groups.overdue.push(task);
    else if (muscatDay(new Date(task.due_at)) === today) groups.today.push(task);
    else groups.upcoming.push(task);
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9') || a.priority - b.priority);
  }
  return groups;
}

export function isPastDue(date: string | null, now: Date): boolean {
  return !!date && muscatDay(new Date(`${date}T23:59:59+04:00`)) < muscatDay(now);
}

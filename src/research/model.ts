// Research module: domain model, types, statuses, labels, and pure access rules.
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
export type Label = { ar: string; en: string };

export type Tab =
  | 'overview'
  | 'tasks'
  | 'datasets'
  | 'experiments'
  | 'ethics'
  | 'publications'
  | 'documents'
  | 'activity';

export type Research = {
  id: string;
  title: string;
  abstract: string | null;
  field: string | null;
  status: string;
  supervisor_id: string | null;
  is_public: boolean;
  ethics_status: string | null;
  doi: string | null;
  conference: string | null;
  funding_source: string | null;
  start_date: string | null;
  target_date: string | null;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Person = { id: string; full_name: string; email: string };
export type Member = { research_id: string; user_id: string; member_role: string };

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assignee_id: string | null;
  due_at: string | null;
};

export type Dataset = {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  license: string | null;
  record_count: number | null;
  sensitivity: string;
  created_by: string;
};

export type Experiment = {
  id: string;
  dataset_id: string | null;
  title: string;
  hypothesis: string | null;
  method: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  result_summary: string | null;
  created_by: string;
};

export type Ethics = {
  id: string;
  title: string;
  authority: string;
  reference: string | null;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  expires_at: string | null;
  notes: string | null;
};

export type Publication = {
  id: string;
  title: string;
  authors: string | null;
  venue_type: string;
  venue_name: string | null;
  doi: string | null;
  url: string | null;
  status: string;
  submitted_at: string | null;
  published_at: string | null;
  event_date: string | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  restricted: boolean;
  uploaded_by: string;
  created_at: string;
};

export type DocumentPermission = {
  id: string;
  document_id: string;
  user_id: string | null;
  role: string | null;
  can_read: boolean;
  can_write: boolean;
};

export type Activity = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

export type ResearchDetail = {
  members: Member[];
  tasks: Task[];
  datasets: Dataset[];
  experiments: Experiment[];
  ethics: Ethics[];
  publications: Publication[];
  documents: DocumentRow[];
  permissions: DocumentPermission[];
  activity: Activity[];
};

type Option = { label: Label; tone: Tone };
const opt = (ar: string, en: string, tone: Tone): Option => ({ label: { ar, en }, tone });

export const researchStatuses: Record<string, Option> = {
  proposal: opt('مقترح', 'Proposal', 'info'),
  active: opt('نشط', 'Active', 'success'),
  in_review: opt('قيد المراجعة', 'In review', 'warning'),
  published: opt('منشور', 'Published', 'brand'),
  closed: opt('مغلق', 'Closed', 'neutral'),
};

export const taskColumns: Record<string, Option> = {
  todo: opt('للتنفيذ', 'To do', 'neutral'),
  in_progress: opt('قيد العمل', 'In progress', 'info'),
  review: opt('مراجعة', 'Review', 'warning'),
  done: opt('منجز', 'Done', 'success'),
};

export const experimentStatuses: Record<string, Option> = {
  planned: opt('مخطط', 'Planned', 'neutral'),
  running: opt('قيد التشغيل', 'Running', 'info'),
  completed: opt('مكتمل', 'Completed', 'success'),
  failed: opt('غير ناجح', 'Failed', 'danger'),
};

export const ethicsStatuses: Record<string, Option> = {
  draft: opt('مسودة', 'Draft', 'neutral'),
  submitted: opt('مقدم', 'Submitted', 'info'),
  approved: opt('معتمد', 'Approved', 'success'),
  rejected: opt('مرفوض', 'Rejected', 'danger'),
  expired: opt('منتهي الصلاحية', 'Expired', 'warning'),
};

export const publicationStatuses: Record<string, Option> = {
  draft: opt('مسودة', 'Draft', 'neutral'),
  submitted: opt('مقدم', 'Submitted', 'info'),
  under_review: opt('قيد التحكيم', 'Under review', 'warning'),
  accepted: opt('مقبول', 'Accepted', 'brand'),
  published: opt('منشور', 'Published', 'success'),
  rejected: opt('مرفوض', 'Rejected', 'danger'),
};

export const venueTypes: Record<string, Label> = {
  journal: { ar: 'مجلة علمية', en: 'Journal' },
  conference: { ar: 'مؤتمر', en: 'Conference' },
  preprint: { ar: 'مسودة أولية', en: 'Preprint' },
  report: { ar: 'تقرير تقني', en: 'Report' },
  thesis: { ar: 'أطروحة', en: 'Thesis' },
};

export const sensitivities: Record<string, Option> = {
  public: opt('عام', 'Public', 'brand'),
  internal: opt('داخلي', 'Internal', 'info'),
  restricted: opt('مقيد', 'Restricted', 'danger'),
};

export const memberRoles: Record<string, Label> = {
  researcher: { ar: 'باحث', en: 'Researcher' },
  lead: { ar: 'قائد بحثي', en: 'Research Lead' },
  supervisor: { ar: 'مشرف رئيسي', en: 'Principal Supervisor' },
  reviewer: { ar: 'محكّم / مراجع', en: 'Reviewer' },
};

export const appRoles = [
  'owner',
  'super_admin',
  'admin',
  'hr',
  'sales',
  'employee',
  'project_member',
  'research_member',
  'guest',
] as const;

export const tabs: Array<{ id: Tab; label: Label }> = [
  { id: 'overview', label: { ar: 'نظرة عامة', en: 'Overview' } },
  { id: 'tasks', label: { ar: 'المهام', en: 'Tasks' } },
  { id: 'datasets', label: { ar: 'مجموعات البيانات', en: 'Datasets' } },
  { id: 'experiments', label: { ar: 'التجارب', en: 'Experiments' } },
  { id: 'ethics', label: { ar: 'الموافقات الأخلاقية', en: 'Ethics approvals' } },
  { id: 'publications', label: { ar: 'المنشورات', en: 'Publications' } },
  { id: 'documents', label: { ar: 'الوثائق', en: 'Documents' } },
  { id: 'activity', label: { ar: 'سجل النشاط', en: 'Activity' } },
];

export const doiPattern = '10\\.[0-9]{4,9}/\\S+';

export const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

export function canManageResearch(
  userId: string,
  research: Research | null | undefined,
  members: Member[],
  roles: readonly string[],
) {
  const isAdmin = roles.some(r => ['owner', 'super_admin', 'admin'].includes(r));
  const isSupervisor =
    isAdmin ||
    research?.supervisor_id === userId ||
    members.some(m => m.user_id === userId && ['supervisor', 'lead'].includes(m.member_role));
  const isMember = isSupervisor || members.some(m => m.user_id === userId);

  return { isAdmin, isSupervisor, isMember };
}

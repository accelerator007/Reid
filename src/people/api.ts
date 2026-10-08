// People data through db.ts. Row-level security decides whose onboarding,
// documents, KPIs, reviews and hours each person can see.
import { firstError, list, run, toAppError, type AppError, type Result } from '../db';
import { supabase } from '../supabase';
import type {
  Announcement, CalendarEvent, Department, EmployeeDocument, EmployeeKpi, Onboarding, Person, PersonTask, Review, Timesheet,
} from './model';

const db = () => {
  if (!supabase) throw new Error('supabase_unavailable');
  return supabase;
};

export type PeopleData = {
  people: Person[]; departments: Department[]; onboarding: Onboarding[]; tasks: PersonTask[]; events: CalendarEvent[];
  announcements: Announcement[]; documents: EmployeeDocument[]; kpis: EmployeeKpi[]; reviews: Review[]; timesheets: Timesheet[];
};

export async function loadPeople(staff: boolean): Promise<{ data: PeopleData | null; error: AppError | null }> {
  const client = db();
  const results = await Promise.all([
    list<Person>(client.from('profiles').select('id,full_name,email,phone,position,department,department_id,hire_date,employment_status').order('full_name')),
    list<Department>(client.from('departments').select('id,name_ar,name_en,description,manager_id').eq('active', true).order('name_en')),
    list<Onboarding>(client.from('onboarding_items').select('id,user_id,title_ar,title_en,due_date,completed,completed_at').order('sort_order')),
    list<PersonTask>(client.from('tasks').select('id,title,description,status,priority,assignee_id,due_at').not('assignee_id', 'is', null).order('created_at', { ascending: false }).limit(500)),
    list<CalendarEvent>(client.from('calendar_events').select('id,user_id,title,description,starts_at,ends_at,visibility').gte('ends_at', new Date(Date.now() - 86_400_000).toISOString()).order('starts_at')),
    list<Announcement>(client.from('announcements').select('id,title_ar,title_en,body_ar,body_en,published_at').order('published_at', { ascending: false })),
    list<EmployeeDocument>(client.from('employee_documents').select('id,owner_id,title,category,storage_path,created_at').order('created_at', { ascending: false })),
    list<EmployeeKpi>(client.from('employee_kpis').select('id,user_id,title,target_value,current_value,unit,period_start,period_end,status').order('period_end', { ascending: false })),
    list<Review>(client.from('performance_reviews').select('id,user_id,reviewer_id,period_start,period_end,rating,summary,strengths,improvements').order('period_end', { ascending: false })),
    list<Timesheet>(client.from('timesheets').select('id,user_id,task_id,minutes,work_date,notes').order('work_date', { ascending: false }).limit(staff ? 300 : 100)),
  ]);
  const [people, departments, onboarding, tasks, events, announcements, documents, kpis, reviews, timesheets] = results;
  const error = firstError(results);
  if (!people.ok) return { data: null, error };
  const value = <T,>(result: Result<T[]>) => (result.ok ? result.data : []);
  return {
    data: {
      people: people.data, departments: value(departments), onboarding: value(onboarding), tasks: value(tasks), events: value(events),
      announcements: value(announcements), documents: value(documents), kpis: value(kpis), reviews: value(reviews), timesheets: value(timesheets),
    },
    error,
  };
}

/** Live updates for the tables this page shows, not the whole schema. */
export function subscribeToPeople(onChange: () => void) {
  const client = db();
  const tables = ['profiles', 'departments', 'onboarding_items', 'calendar_events', 'announcements', 'employee_documents', 'employee_kpis', 'performance_reviews', 'timesheets'];
  let channel = client.channel('people-workspace');
  for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

type Write = Promise<Result<unknown>>;
const write = (query: PromiseLike<{ data: unknown; error: unknown }>): Write => run(query);
const now = () => new Date().toISOString();

export const updatePerson = (id: string, fields: Record<string, string | null>) =>
  write(db().from('profiles').update(fields).eq('id', id));
export const createDepartment = (fields: Record<string, string | null>) => write(db().from('departments').insert(fields));
export const createAnnouncement = (by: string, fields: Record<string, string | null>) => write(db().from('announcements').insert({ ...fields, created_by: by }));
/** A company event has no owner; a private one belongs to the person it is for. */
export const createEvent = (forUser: string, by: string, fields: Record<string, string | null>) =>
  write(db().from('calendar_events').insert({ ...fields, user_id: fields.visibility === 'company' ? null : forUser, created_by: by }));
export const createOnboarding = (userId: string, by: string, fields: Record<string, string | null>) =>
  write(db().from('onboarding_items').insert({ ...fields, user_id: userId, assigned_by: by }));
export const setOnboardingDone = (id: string, done: boolean) =>
  write(db().from('onboarding_items').update({ completed: done, completed_at: done ? now() : null }).eq('id', id));
export const createTask = (assignee: string, by: string, fields: Record<string, string | number | null>) =>
  write(db().from('tasks').insert({ ...fields, assignee_id: assignee, created_by: by, status: 'todo' }));
export const setTaskStatus = (id: string, status: string) => write(db().from('tasks').update({ status }).eq('id', id));
export const createKpi = (userId: string, by: string, fields: Record<string, string | number | null>) =>
  write(db().from('employee_kpis').insert({
    ...fields, user_id: userId, set_by: by,
    status: Number(fields.current_value) >= Number(fields.target_value) ? 'achieved' : 'on_track',
  }));
export const createReview = (userId: string, reviewer: string, fields: Record<string, string | number | null>) =>
  write(db().from('performance_reviews').insert({ ...fields, user_id: userId, reviewer_id: reviewer }));
export const logTime = (userId: string, fields: Record<string, string | number | null>) => write(db().from('timesheets').insert({ ...fields, user_id: userId }));

export async function uploadDocument(ownerId: string, by: string, file: File, fields: { title: string; category: string }): Write {
  const client = db();
  const path = `${ownerId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const stored = await run(client.storage.from('employee-documents').upload(path, file));
  if (!stored.ok) return stored;
  return write(client.from('employee_documents').insert({ ...fields, owner_id: ownerId, uploaded_by: by, storage_path: path }));
}

/** A one-minute signed link: HR files never become publicly addressable. */
export async function openDocument(path: string): Promise<Result<string | null>> {
  const signed = await run(db().storage.from('employee-documents').createSignedUrl(path, 60));
  if (!signed.ok) return signed;
  const url = (signed.data as { signedUrl?: string } | null)?.signedUrl ?? null;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, data: url };
}

// ---- join applications (owner, super_admin, admin, hr) ----------------------------

export type Application = {
  id: string; full_name: string; email: string; phone: string; organization: string; title: string; account_type: string;
  linkedin_url: string; github_url: string | null; project_or_research: string | null; join_reason: string; cover_letter: string;
  cv_path: string | null; created_at: string; status: string; invitation_status: string | null;
};
export type Applications = { pending: Application[]; failedInvites: Application[] };

const applicationColumns = 'id,full_name,email,phone,organization,title,account_type,linkedin_url,github_url,project_or_research,join_reason,cover_letter,cv_path,created_at,status,invitation_status';

export async function loadApplications(): Promise<{ data: Applications | null; error: AppError | null }> {
  const client = db();
  const [pending, failed] = await Promise.all([
    list<Application>(client.from('applications').select(applicationColumns).eq('status', 'pending').order('created_at')),
    list<Application>(client.from('applications').select(applicationColumns).eq('status', 'approved').eq('invitation_status', 'failed').order('created_at')),
  ]);
  const error = firstError([pending, failed]);
  if (!pending.ok) return { data: null, error };
  return { data: { pending: pending.data, failedInvites: failed.ok ? failed.data : [] }, error };
}

/** Pending requests only, for the tab badge before the tab is opened. */
export async function countPendingApplications(): Promise<number> {
  const { count } = await db().from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return count ?? 0;
}

export function subscribeToApplications(onChange: () => void) {
  const client = db();
  const channel = client.channel('people-applications')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, onChange);
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

/**
 * The decision goes through the decide-application function, which records it
 * with the database rule and sends the invitation; invitationStatus says
 * whether the email left.
 */
export async function decideApplication(id: string, decision: 'approved' | 'rejected' | 'retry_invitation', reason?: string): Promise<Result<{ invitationStatus?: string }>> {
  const result = await run<{ invitationStatus?: string; error?: string }>(
    db().functions.invoke('decide-application', { body: { applicationId: id, decision, rejectionReason: reason ?? null } }),
  );
  if (!result.ok) return result;
  if (result.data?.error) return { ok: false, error: toAppError(new Error(result.data.error)) };
  return { ok: true, data: { invitationStatus: result.data?.invitationStatus } };
}

/** A one-minute signed link to the applicant's CV. */
export async function openCv(path: string): Promise<Result<string | null>> {
  const signed = await run(db().storage.from('application-cvs').createSignedUrl(path, 60));
  if (!signed.ok) return signed;
  const url = (signed.data as { signedUrl?: string } | null)?.signedUrl ?? null;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, data: url };
}

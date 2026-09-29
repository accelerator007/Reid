// Every Supabase read and write the projects pages make, through the typed
// data boundary in db.ts. Row-level security decides what each person sees;
// nothing here widens it.
import { firstError, list, run, type AppError, type Result } from '../db';
import { supabase } from '../supabase';
import type { Person, Project, ProjectDetail, Task } from './model';

const client = () => {
  if (!supabase) throw new Error('supabase_unavailable');
  return supabase;
};

export type DirectoryTask = Pick<Task, 'status' | 'due_at'> & { project_id: string };
export type Directory = { projects: Project[]; people: Person[]; tasks: DirectoryTask[] };

export async function loadDirectory(): Promise<{ data: Directory | null; error: AppError | null }> {
  const db = client();
  const [projects, people, tasks] = await Promise.all([
    list<Project>(db.from('projects')
      .select('id,name,type,description,manager_id,client_name,status,github_repo,start_date,target_date,archived_at,updated_at')
      .order('updated_at', { ascending: false })),
    list<Person>(db.from('profiles').select('id,full_name,email').order('full_name')),
    list<{ project_id: string; status: string; due_at: string | null }>(
      db.from('tasks').select('project_id,status,due_at').not('project_id', 'is', null).limit(5000)),
  ]);
  const error = firstError([projects, people, tasks]);
  if (!projects.ok) return { data: null, error };
  return {
    data: { projects: projects.data, people: people.ok ? people.data : [], tasks: tasks.ok ? tasks.data : [] },
    error,
  };
}

export async function loadProjectDetail(projectId: string): Promise<{ data: ProjectDetail; error: AppError | null }> {
  const db = client();
  const [members, tasks, milestones, meetings, files, permissions, kpis, activity] = await Promise.all([
    list<ProjectDetail['members'][number]>(db.from('project_members').select('project_id,user_id,member_role').eq('project_id', projectId)),
    list<ProjectDetail['tasks'][number]>(db.from('tasks').select('id,title,description,status,priority,assignee_id,due_at').eq('project_id', projectId).order('created_at')),
    list<ProjectDetail['milestones'][number]>(db.from('project_milestones').select('id,title,description,due_date,status').eq('project_id', projectId).order('due_date')),
    list<ProjectDetail['meetings'][number]>(db.from('project_meetings').select('id,title,agenda,starts_at,ends_at,location,notes').eq('project_id', projectId).order('starts_at')),
    list<ProjectDetail['files'][number]>(db.from('project_files').select('id,title,storage_path,category,restricted,uploaded_by,created_at').eq('project_id', projectId).order('created_at', { ascending: false })),
    list<ProjectDetail['permissions'][number]>(db.from('project_file_permissions').select('id,file_id,user_id,role,can_read,can_write')),
    list<ProjectDetail['kpis'][number]>(db.from('project_kpis').select('id,title,target_value,current_value,unit,status').eq('project_id', projectId)),
    list<ProjectDetail['activity'][number]>(db.from('project_activity').select('id,actor_id,action,entity_type,entity_id,details,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)),
  ]);
  const value = <T,>(result: Result<T[]>) => (result.ok ? result.data : []);
  return {
    data: {
      members: value(members), tasks: value(tasks), milestones: value(milestones), meetings: value(meetings),
      files: value(files), permissions: value(permissions), kpis: value(kpis), activity: value(activity),
    },
    error: firstError([members, tasks, milestones, meetings, files, permissions, kpis, activity]),
  };
}

/** Live updates for one project: only its own tables, filtered by project. */
export function subscribeToProject(projectId: string, onChange: () => void) {
  const db = client();
  const tables = ['projects', 'project_members', 'tasks', 'project_milestones', 'project_meetings', 'project_files', 'project_kpis', 'project_activity'];
  let channel = db.channel(`project:${projectId}`);
  for (const table of tables) {
    channel = channel.on('postgres_changes', {
      event: '*', schema: 'public', table, filter: table === 'projects' ? `id=eq.${projectId}` : `project_id=eq.${projectId}`,
    }, onChange);
  }
  channel.subscribe();
  return () => { void db.removeChannel(channel); };
}

// ---- writes -------------------------------------------------------------------
type Write = Promise<Result<unknown>>;
const write = (query: PromiseLike<{ data: unknown; error: unknown }>): Write => run(query);

export async function createProject(fields: Record<string, string | null>, managerId: string): Promise<Result<{ id: string } | null>> {
  const db = client();
  const created = await run<{ id: string }>(db.from('projects').insert({ ...fields, manager_id: managerId, status: 'planning' }).select('id').single());
  if (!created.ok || !created.data) return created;
  const member = await run(db.from('project_members').insert({ project_id: created.data.id, user_id: managerId, member_role: 'manager' }));
  return member.ok ? created : member;
}

export const updateProject = (id: string, fields: Record<string, string | null>) =>
  write(client().from('projects').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id));

export const setArchived = (id: string, archived: boolean) =>
  write(client().from('projects').update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id));

export const addMember = (projectId: string, userId: string, role: string) =>
  write(client().from('project_members').insert({ project_id: projectId, user_id: userId, member_role: role }));

export const removeMember = (projectId: string, userId: string) =>
  write(client().from('project_members').delete().eq('project_id', projectId).eq('user_id', userId));

export const createTask = (projectId: string, createdBy: string, fields: { title: string; description: string | null; assignee_id: string | null; priority: number; due_at: string | null }) =>
  write(client().from('tasks').insert({ ...fields, project_id: projectId, created_by: createdBy, status: 'todo' }));

export const moveTask = (taskId: string, status: string) => write(client().from('tasks').update({ status }).eq('id', taskId));

export const createMilestone = (projectId: string, createdBy: string, fields: { title: string; description: string | null; due_date: string | null }) =>
  write(client().from('project_milestones').insert({ ...fields, project_id: projectId, created_by: createdBy }));

export const updateMilestoneStatus = (id: string, status: string) => write(client().from('project_milestones').update({ status }).eq('id', id));

export const createMeeting = (projectId: string, createdBy: string, fields: { title: string; agenda: string | null; starts_at: string; ends_at: string; location: string | null }) =>
  write(client().from('project_meetings').insert({ ...fields, project_id: projectId, created_by: createdBy }));

export const createKpi = (projectId: string, createdBy: string, fields: { title: string; target_value: number; current_value: number; unit: string }) =>
  write(client().from('project_kpis').insert({
    ...fields, project_id: projectId, created_by: createdBy, status: fields.current_value >= fields.target_value ? 'achieved' : 'on_track',
  }));

export async function uploadFile(projectId: string, uploadedBy: string, file: File, fields: { title: string; category: string; restricted: boolean }): Write {
  const db = client();
  const path = `${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const stored = await run(db.storage.from('project-files').upload(path, file));
  if (!stored.ok) return stored;
  return write(db.from('project_files').insert({ ...fields, project_id: projectId, storage_path: path, uploaded_by: uploadedBy }));
}

export const grantFile = (fileId: string, grantedBy: string, grant: { user_id: string | null; role: string | null; can_write: boolean }) =>
  write(client().from('project_file_permissions').insert({ ...grant, file_id: fileId, can_read: true, granted_by: grantedBy }));

export const revokeFile = (permissionId: string) => write(client().from('project_file_permissions').delete().eq('id', permissionId));

/** A one-minute signed link: the file never becomes publicly addressable. */
export async function openFile(storagePath: string): Promise<Result<string | null>> {
  const signed = await run(client().storage.from('project-files').createSignedUrl(storagePath, 60));
  if (!signed.ok) return signed;
  const url = (signed.data as { signedUrl?: string } | null)?.signedUrl ?? null;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, data: url };
}

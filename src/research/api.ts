// Research API: Supabase queries, mutations, file storage, and signed URL generation.
import { supabase } from '../supabase';
import { firstError, toAppError, type AppError } from '../db';
import type {
  Research,
  Person,
  Member,
  Task,
  Dataset,
  Experiment,
  Ethics,
  Publication,
  DocumentRow,
  DocumentPermission,
  Activity,
  ResearchDetail,
} from './model';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export async function loadResearchList(): Promise<{
  people: Person[];
  research: Research[];
  error?: AppError;
}> {
  if (!supabase) return { people: [], research: [] };

  const [p, q] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email').order('full_name'),
    supabase
      .from('research')
      .select('id,title,abstract,field,status,supervisor_id,is_public,ethics_status,doi,conference,funding_source,start_date,target_date,archived_at')
      .order('updated_at', { ascending: false }),
  ]);

  const failure = firstError(
    [p, q].map(x => (x.error ? { ok: false as const, error: toAppError(x.error) } : { ok: true as const, data: null })),
  );

  return {
    people: (p.data || []) as Person[],
    research: (q.data || []) as Research[],
    error: failure ?? undefined,
  };
}

export async function loadResearchDetail(selected: string): Promise<{
  detail: ResearchDetail;
  error?: AppError;
}> {
  const empty: ResearchDetail = {
    members: [],
    tasks: [],
    datasets: [],
    experiments: [],
    ethics: [],
    publications: [],
    documents: [],
    permissions: [],
    activity: [],
  };

  if (!supabase || !selected) return { detail: empty };

  const [m, ta, ds, ex, et, pu, dc, pe, ac] = await Promise.all([
    supabase.from('research_members').select('research_id,user_id,member_role').eq('research_id', selected),
    supabase.from('tasks').select('id,title,description,status,priority,assignee_id,due_at').eq('research_id', selected).order('created_at'),
    supabase.from('research_datasets').select('id,name,description,source,license,record_count,sensitivity,created_by').eq('research_id', selected).order('created_at'),
    supabase.from('research_experiments').select('id,dataset_id,title,hypothesis,method,status,started_at,ended_at,result_summary,created_by').eq('research_id', selected).order('created_at', { ascending: false }),
    supabase.from('research_ethics_approvals').select('id,title,authority,reference,status,submitted_at,decided_at,decided_by,expires_at,notes').eq('research_id', selected).order('created_at', { ascending: false }),
    supabase.from('research_publications').select('id,title,authors,venue_type,venue_name,doi,url,status,submitted_at,published_at,event_date').eq('research_id', selected).order('created_at', { ascending: false }),
    supabase.from('research_documents').select('id,title,storage_path,category,restricted,uploaded_by,created_at').eq('research_id', selected).order('created_at', { ascending: false }),
    supabase.from('research_document_permissions').select('id,document_id,user_id,role,can_read,can_write'),
    supabase.from('research_activity').select('id,actor_id,action,entity_type,entity_id,created_at').eq('research_id', selected).order('created_at', { ascending: false }).limit(100),
  ]);

  const failure = firstError(
    [m, ta, ds, ex, et, pu, dc, pe, ac].map(x => (x.error ? { ok: false as const, error: toAppError(x.error) } : { ok: true as const, data: null })),
  );

  return {
    detail: {
      members: (m.data || []) as Member[],
      tasks: (ta.data || []) as Task[],
      datasets: (ds.data || []) as Dataset[],
      experiments: (ex.data || []) as Experiment[],
      ethics: (et.data || []) as Ethics[],
      publications: (pu.data || []) as Publication[],
      documents: (dc.data || []) as DocumentRow[],
      permissions: (pe.data || []) as DocumentPermission[],
      activity: (ac.data || []) as Activity[],
    },
    error: failure ?? undefined,
  };
}

export async function createResearch(
  values: {
    title: string;
    abstract: string;
    field?: string | null;
    supervisor_id: string;
    is_public: boolean;
    funding_source?: string | null;
    start_date?: string | null;
    target_date?: string | null;
  },
  userId: string,
): Promise<{ id?: string; error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };

  const { data, error } = await supabase
    .from('research')
    .insert({
      title: values.title,
      abstract: values.abstract,
      field: values.field || null,
      supervisor_id: values.supervisor_id,
      status: 'proposal',
      is_public: values.is_public,
      funding_source: values.funding_source || null,
      start_date: values.start_date || null,
      target_date: values.target_date || null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) return { error: toAppError(error) };

  await supabase.from('research_members').insert({
    research_id: data.id,
    user_id: values.supervisor_id,
    member_role: 'supervisor',
  });

  return { id: data.id };
}

export async function updateResearchSettings(
  id: string,
  values: {
    title: string;
    abstract: string;
    field?: string | null;
    status: string;
    is_public: boolean;
    conference?: string | null;
    target_date?: string | null;
  },
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase
    .from('research')
    .update({
      title: values.title,
      abstract: values.abstract,
      field: values.field || null,
      status: values.status,
      is_public: values.is_public,
      conference: values.conference || null,
      target_date: values.target_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return { error: error ? toAppError(error) : undefined };
}

export async function toggleArchiveResearch(id: string, currentlyArchived: boolean): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase
    .from('research')
    .update({
      archived_at: currentlyArchived ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return { error: error ? toAppError(error) : undefined };
}

export async function addResearchMember(researchId: string, userId: string, memberRole: string): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_members').insert({
    research_id: researchId,
    user_id: userId,
    member_role: memberRole,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function removeResearchMember(researchId: string, userId: string): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_members').delete().eq('research_id', researchId).eq('user_id', userId);
  return { error: error ? toAppError(error) : undefined };
}

export async function createTask(
  researchId: string,
  values: { title: string; description?: string | null; assignee_id?: string | null; due_at?: string | null },
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('tasks').insert({
    research_id: researchId,
    title: values.title,
    description: values.description || null,
    assignee_id: values.assignee_id || null,
    due_at: values.due_at || null,
    created_by: userId,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function updateTaskStatus(taskId: string, status: string): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  return { error: error ? toAppError(error) : undefined };
}

export async function createDataset(
  researchId: string,
  values: {
    name: string;
    description?: string | null;
    source?: string | null;
    license?: string | null;
    record_count?: number | null;
    sensitivity: string;
  },
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_datasets').insert({
    research_id: researchId,
    name: values.name,
    description: values.description || null,
    source: values.source || null,
    license: values.license || null,
    record_count: values.record_count ?? null,
    sensitivity: values.sensitivity,
    created_by: userId,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function createExperiment(
  researchId: string,
  values: { dataset_id?: string | null; title: string; hypothesis?: string | null; method?: string | null },
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_experiments').insert({
    research_id: researchId,
    dataset_id: values.dataset_id || null,
    title: values.title,
    hypothesis: values.hypothesis || null,
    method: values.method || null,
    status: 'planned',
    created_by: userId,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function updateExperimentStatus(
  experimentId: string,
  status: string,
  current: { started_at: string | null; ended_at: string | null },
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('research_experiments')
    .update({
      status,
      started_at: status === 'running' ? now : current.started_at,
      ended_at: ['completed', 'failed'].includes(status) ? now : current.ended_at,
    })
    .eq('id', experimentId);
  return { error: error ? toAppError(error) : undefined };
}

export async function createEthics(
  researchId: string,
  values: { title: string; authority: string; reference?: string | null; expires_at?: string | null; notes?: string | null },
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_ethics_approvals').insert({
    research_id: researchId,
    title: values.title,
    authority: values.authority,
    reference: values.reference || null,
    status: 'draft',
    expires_at: values.expires_at || null,
    notes: values.notes || null,
    created_by: userId,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function updateEthicsStatus(
  ethicsId: string,
  status: string,
  userId: string,
  current: { submitted_at: string | null; decided_at: string | null; decided_by: string | null },
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const decided = ['approved', 'rejected'].includes(status);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('research_ethics_approvals')
    .update({
      status,
      decided_at: decided ? now : current.decided_at,
      decided_by: decided ? userId : current.decided_by,
      submitted_at: status === 'submitted' ? now : current.submitted_at,
    })
    .eq('id', ethicsId);
  return { error: error ? toAppError(error) : undefined };
}

export async function createPublication(
  researchId: string,
  values: {
    title: string;
    authors?: string | null;
    venue_type: string;
    venue_name?: string | null;
    doi?: string | null;
    url?: string | null;
    event_date?: string | null;
  },
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_publications').insert({
    research_id: researchId,
    title: values.title,
    authors: values.authors || null,
    venue_type: values.venue_type,
    venue_name: values.venue_name || null,
    doi: values.doi || null,
    url: values.url || null,
    status: 'draft',
    event_date: values.event_date || null,
    created_by: userId,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function updatePublicationStatus(
  publicationId: string,
  status: string,
  currentPublishedAt: string | null,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase
    .from('research_publications')
    .update({
      status,
      published_at: status === 'published' ? new Date().toISOString().slice(0, 10) : currentPublishedAt,
    })
    .eq('id', publicationId);
  return { error: error ? toAppError(error) : undefined };
}

export async function uploadResearchDocument(
  researchId: string,
  file: File,
  title: string,
  category: string,
  restricted: boolean,
  userId: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${researchId}/${crypto.randomUUID()}-${safeName}`;

  const uploadRes = await supabase.storage.from('research-files').upload(path, file);
  if (uploadRes.error) return { error: toAppError(uploadRes.error) };

  const { error } = await supabase.from('research_documents').insert({
    research_id: researchId,
    title,
    category,
    restricted,
    storage_path: path,
    uploaded_by: userId,
  });

  return { error: error ? toAppError(error) : undefined };
}

export async function addDocumentPermission(
  documentId: string,
  kind: 'user' | 'role',
  targetValue: string,
  mode: 'read' | 'write',
  grantedBy: string,
): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_document_permissions').insert({
    document_id: documentId,
    user_id: kind === 'user' ? targetValue : null,
    role: kind === 'role' ? targetValue : null,
    can_read: true,
    can_write: mode === 'write',
    granted_by: grantedBy,
  });
  return { error: error ? toAppError(error) : undefined };
}

export async function removeDocumentPermission(permissionId: string): Promise<{ error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { error } = await supabase.from('research_document_permissions').delete().eq('id', permissionId);
  return { error: error ? toAppError(error) : undefined };
}

export async function getDocumentSignedUrl(storagePath: string): Promise<{ signedUrl?: string; error?: AppError }> {
  if (!supabase) return { error: toAppError("No database connection") };
  const { data, error } = await supabase.storage.from('research-files').createSignedUrl(storagePath, 60);
  return { signedUrl: data?.signedUrl, error: error ? toAppError(error) : undefined };
}

// Every read and write the forms pages make, through db.ts. Row-level security
// decides who sees which form; respondents never touch the forms table and go
// through public_form() and submit_form_response() instead.
import { firstError, list, run, toAppError, type AppError, type Result } from '../db';
import { supabase } from '../supabase';
import type { Answers, FileAnswer, Form, FormResponse, FormRole, Question } from './model';

const db = () => {
  if (!supabase) throw new Error('supabase_unavailable');
  return supabase;
};

const formColumns = 'id,owner_id,title,description,cover_url,theme,workshop,workshop_id,accepting,one_per_device,confirm_message,close_at,questions,created_at,updated_at';

export type Person = { id: string; full_name: string | null; email: string | null };
export type Collaborator = { form_id: string; user_id: string; role: 'editor' | 'viewer' };
export type Overview = { form_id: string; responses: number; last_response_at: string | null; rating_avg: number | null };
export type FormsData = { forms: Form[]; overview: Map<string, Overview>; roles: Map<string, FormRole>; people: Map<string, Person> };

export async function loadForms(userId: string): Promise<{ data: FormsData | null; error: AppError | null }> {
  const client = db();
  const [forms, overview, collaborators, people] = await Promise.all([
    list<Form>(client.from('forms').select(formColumns).order('updated_at', { ascending: false })),
    list<Overview>(client.rpc('form_overview')),
    list<Collaborator>(client.from('form_collaborators').select('form_id,user_id,role').eq('user_id', userId)),
    list<Person>(client.from('profiles').select('id,full_name,email')),
  ]);
  const error = firstError([forms, overview, collaborators, people]);
  if (!forms.ok) return { data: null, error };
  const roles = new Map<string, FormRole>(forms.data.map(form => [form.id, form.owner_id === userId ? 'owner' : 'viewer']));
  for (const row of collaborators.ok ? collaborators.data : []) roles.set(row.form_id, row.role);
  return {
    data: {
      forms: forms.data,
      overview: new Map((overview.ok ? overview.data : []).map(row => [row.form_id, { ...row, responses: Number(row.responses), rating_avg: row.rating_avg == null ? null : Number(row.rating_avg) }])),
      roles,
      people: new Map((people.ok ? people.data : []).map(person => [person.id, person])),
    },
    error,
  };
}

export async function loadForm(id: string, userId: string): Promise<{ data: { form: Form; role: FormRole } | null; error: AppError | null }> {
  const client = db();
  const [form, mine] = await Promise.all([
    run<Form>(client.from('forms').select(formColumns).eq('id', id).maybeSingle()),
    run<{ role: 'editor' | 'viewer' }>(client.from('form_collaborators').select('role').eq('form_id', id).eq('user_id', userId).maybeSingle()),
  ]);
  if (!form.ok) return { data: null, error: form.error };
  if (!form.data) return { data: null, error: null };
  const role: FormRole = form.data.owner_id === userId ? 'owner' : mine.ok && mine.data ? mine.data.role : 'viewer';
  return { data: { form: form.data, role }, error: null };
}

export type FormFields = Partial<Pick<Form, 'title' | 'description' | 'cover_url' | 'theme' | 'workshop' | 'workshop_id' | 'accepting' | 'one_per_device' | 'confirm_message' | 'close_at' | 'questions'>>;

export async function createForm(userId: string, fields: FormFields): Promise<Result<Form | null>> {
  return run<Form>(db().from('forms').insert({ ...fields, owner_id: userId }).select(formColumns).single());
}

/** Content only: the owner and sharing are never part of an edit. */
export const saveForm = (id: string, fields: FormFields) =>
  run<{ updated_at: string }>(db().from('forms').update(fields).eq('id', id).select('updated_at').single());

/** A copy belongs to whoever made it and is shared with nobody. */
export function duplicateForm(userId: string, form: Form, copySuffix: string) {
  const { title, description, cover_url, theme, workshop, workshop_id, one_per_device, confirm_message, questions } = form;
  return createForm(userId, { title: `${title} ${copySuffix}`.trim().slice(0, 200), description, cover_url, theme, workshop, workshop_id, one_per_device, confirm_message, questions, accepting: false });
}

/** Deletes the form and, first, the files respondents uploaded to it. */
export async function deleteForm(id: string): Promise<Result<unknown>> {
  const client = db();
  const listed = await run(client.storage.from('form-uploads').list(id, { limit: 1000 }));
  const names = ((listed.ok ? listed.data : null) as Array<{ name: string }> | null ?? []).map(item => `${id}/${item.name}`);
  if (names.length) await run(client.storage.from('form-uploads').remove(names));
  return run(client.from('forms').delete().eq('id', id));
}

// ---- people and access ---------------------------------------------------------------

/** Administrators a form can be shared with (the feature is for administrators only). */
export async function loadAdmins(): Promise<Result<Person[]>> {
  const client = db();
  const [roles, people] = await Promise.all([
    list<{ user_id: string }>(client.from('user_roles').select('user_id').in('role', ['owner', 'super_admin', 'admin'])),
    list<Person>(client.from('profiles').select('id,full_name,email').order('full_name')),
  ]);
  if (!roles.ok) return roles;
  if (!people.ok) return people;
  const admins = new Set(roles.data.map(row => row.user_id));
  return { ok: true, data: people.data.filter(person => admins.has(person.id)) };
}

export const loadCollaborators = (formId: string) =>
  list<Collaborator>(db().from('form_collaborators').select('form_id,user_id,role').eq('form_id', formId).order('created_at'));
export const addCollaborator = (formId: string, userId: string, role: 'editor' | 'viewer') =>
  run(db().from('form_collaborators').insert({ form_id: formId, user_id: userId, role }));
export const setCollaboratorRole = (formId: string, userId: string, role: 'editor' | 'viewer') =>
  run(db().from('form_collaborators').update({ role }).eq('form_id', formId).eq('user_id', userId));
export const removeCollaborator = (formId: string, userId: string) =>
  run(db().from('form_collaborators').delete().eq('form_id', formId).eq('user_id', userId));

// ---- responses -------------------------------------------------------------------------------

export const loadResponses = (formId: string) =>
  list<FormResponse>(db().from('form_responses').select('id,form_id,answers,created_at').eq('form_id', formId).order('created_at', { ascending: false }).limit(5000));

const filesOf = (responses: FormResponse[], questions: Question[]) =>
  responses.flatMap(response => questions.filter(item => item.type === 'file').flatMap(item => (response.answers[item.id] as FileAnswer[] | undefined) ?? [])).map(file => file.path);

export async function deleteResponses(responses: FormResponse[], questions: Question[]): Promise<Result<unknown>> {
  const client = db();
  const paths = filesOf(responses, questions);
  if (paths.length) await run(client.storage.from('form-uploads').remove(paths));
  const ids = responses.map(response => response.id);
  return run(client.from('form_responses').delete().in('id', ids));
}

/** A one-minute signed link: respondents' files are never public. */
export async function openFile(path: string): Promise<Result<string | null>> {
  const signed = await run(db().storage.from('form-uploads').createSignedUrl(path, 60, { download: true }));
  if (!signed.ok) return signed;
  return { ok: true, data: (signed.data as { signedUrl?: string } | null)?.signedUrl ?? null };
}

/** Covers and question images go to the public form-media bucket, under the form. */
export async function uploadMedia(formId: string, file: Blob, extension: string): Promise<Result<string>> {
  const client = db();
  const path = `${formId}/${crypto.randomUUID()}.${extension}`;
  const stored = await run(client.storage.from('form-media').upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
  if (!stored.ok) return stored;
  return { ok: true, data: client.storage.from('form-media').getPublicUrl(path).data.publicUrl };
}

// ---- respondents -------------------------------------------------------------------------------

export type PublicForm = Pick<Form, 'id' | 'title' | 'description' | 'cover_url' | 'theme' | 'workshop' | 'questions' | 'confirm_message' | 'one_per_device' | 'close_at'> & { open: boolean; can_manage: boolean };

export async function loadPublicForm(id: string): Promise<Result<PublicForm | null>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: true, data: null };
  return run<PublicForm>(db().rpc('public_form', { p_id: id }));
}

/** Uploads a respondent's file into the form's folder and returns what the answer records. */
export async function uploadAnswerFile(formId: string, file: Blob, name: string): Promise<Result<FileAnswer>> {
  const safe = name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80) || 'file';
  const path = `${formId}/${crypto.randomUUID()}-${safe}`;
  const stored = await run(db().storage.from('form-uploads').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }));
  if (!stored.ok) return stored;
  return { ok: true, data: { path, name, size: file.size, mime: file.type } };
}

/** Returns the server's error code (form_closed, already_submitted…) when it refuses. */
export async function submitResponse(formId: string, answers: Answers, device: string): Promise<{ ok: true } | { ok: false; code: string; error: AppError }> {
  try {
    const { error } = await db().rpc('submit_form_response', { p_form: formId, p_answers: answers, p_device: device });
    if (!error) return { ok: true };
    return { ok: false, code: (error as { message?: string }).message ?? '', error: toAppError(error) };
  } catch (thrown) {
    return { ok: false, code: '', error: toAppError(thrown) };
  }
}

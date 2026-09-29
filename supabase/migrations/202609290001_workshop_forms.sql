begin;

-- Workshop forms: registration, evaluation, attendance, ideas and votes, built
-- by administrators and answered by anyone holding the link.
--
-- Who may do what:
--   * Only administrators (public.is_admin()) create or open forms. A form is
--     private to its creator until they share it with other administrators as
--     editor (edit questions and settings, read and delete responses) or viewer
--     (read and export responses). Losing the administrator role removes access.
--   * Respondents never read the forms table. They load one form through
--     public_form(id) and answer through submit_form_response(), which checks
--     the form is open and validates every answer on the server.
--   * Uploaded files live in the private form-uploads bucket under the form's
--     folder; only the form's people can read them.

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  description text not null default '' check (length(description) <= 4000),
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  theme text not null default 'brand' check (theme in ('brand','accent','blue','green','amber','red','neutral')),
  workshop jsonb not null default '{}'::jsonb
    check (jsonb_typeof(workshop) = 'object' and pg_column_size(workshop) <= 4000),
  workshop_id uuid references public.workshops(id) on delete set null,
  accepting boolean not null default true,
  one_per_device boolean not null default false,
  confirm_message text not null default '' check (length(confirm_message) <= 1000),
  close_at timestamptz,
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 200 and pg_column_size(questions) <= 400000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forms_owner on public.forms(owner_id, updated_at desc);

create table public.form_collaborators (
  form_id uuid not null references public.forms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (form_id, user_id)
);
create index form_collaborators_user on public.form_collaborators(user_id);

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 120000),
  respondent_id uuid references public.profiles(id) on delete set null,
  device_key text check (device_key is null or device_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  created_at timestamptz not null default now()
);
create index form_responses_form on public.form_responses(form_id, created_at desc);
-- "One response per device" is enforced here, not only in the browser.
create unique index form_responses_one_per_device on public.form_responses(form_id, device_key) where device_key is not null;

-- ---- access -------------------------------------------------------------------

-- The caller's role on a form: owner, editor, viewer, or null. Administrators only.
create or replace function public.form_role(p_form uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not public.is_admin() then null
    when f.owner_id = auth.uid() then 'owner'
    else (select c.role from public.form_collaborators c where c.form_id = f.id and c.user_id = auth.uid())
  end
  from public.forms f where f.id = p_form
$$;
revoke all on function public.form_role(uuid) from public, anon;
grant execute on function public.form_role(uuid) to authenticated;

alter table public.forms enable row level security;
alter table public.form_collaborators enable row level security;
alter table public.form_responses enable row level security;
revoke all on public.forms, public.form_collaborators, public.form_responses from anon;
grant select, insert, update, delete on public.forms, public.form_collaborators to authenticated;
grant select, delete on public.form_responses to authenticated;
grant all on public.forms, public.form_collaborators, public.form_responses to service_role;

create policy forms_read on public.forms for select to authenticated
  using (public.form_role(id) is not null);
create policy forms_create on public.forms for insert to authenticated
  with check (public.is_admin() and owner_id = auth.uid());
create policy forms_edit on public.forms for update to authenticated
  using (public.form_role(id) in ('owner','editor'))
  with check (public.form_role(id) in ('owner','editor'));
create policy forms_delete on public.forms for delete to authenticated
  using (public.form_role(id) = 'owner');

create policy form_collaborators_read on public.form_collaborators for select to authenticated
  using (public.form_role(form_id) is not null);
create policy form_collaborators_manage on public.form_collaborators for all to authenticated
  using (public.form_role(form_id) = 'owner')
  with check (public.form_role(form_id) = 'owner');

create policy form_responses_read on public.form_responses for select to authenticated
  using (public.form_role(form_id) is not null);
create policy form_responses_delete on public.form_responses for delete to authenticated
  using (public.form_role(form_id) in ('owner','editor'));
-- No insert policy: responses arrive only through submit_form_response().

-- The owner and creation time never change; every edit is stamped.
create or replace function public.forms_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'form_owner_immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger forms_guard before update on public.forms for each row execute function public.forms_guard();

-- A collaborator is another administrator, never the owner, and at most fifty per form.
create or replace function public.form_collaborators_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles r where r.user_id = new.user_id and r.role in ('owner','super_admin','admin')) then
    raise exception 'collaborator_must_be_admin' using errcode = '23514';
  end if;
  if exists (select 1 from public.forms f where f.id = new.form_id and f.owner_id = new.user_id) then
    raise exception 'collaborator_is_owner' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.form_collaborators c where c.form_id = new.form_id) >= 50 then
    raise exception 'too_many_collaborators' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger form_collaborators_guard before insert or update on public.form_collaborators
  for each row execute function public.form_collaborators_guard();

create trigger audit_forms after insert or update or delete on public.forms for each row execute function public.audit_row();
create trigger audit_form_collaborators after insert or update or delete on public.form_collaborators for each row execute function public.audit_row();

-- ---- respondents ------------------------------------------------------------------

create or replace function public.form_is_open(f public.forms) returns boolean language sql stable set search_path = '' as $$
  select f.accepting and (f.close_at is null or f.close_at > now())
$$;

-- One form as a respondent sees it. Owner details and collaborators stay out.
create or replace function public.public_form(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', f.id, 'title', f.title, 'description', f.description, 'cover_url', f.cover_url, 'theme', f.theme,
    'workshop', f.workshop, 'questions', f.questions, 'confirm_message', f.confirm_message,
    'one_per_device', f.one_per_device, 'open', public.form_is_open(f), 'close_at', f.close_at,
    'can_manage', public.form_role(f.id) is not null
  )
  from public.forms f where f.id = p_id
$$;
revoke all on function public.public_form(uuid) from public;
grant execute on function public.public_form(uuid) to anon, authenticated;

-- Validates one answer against its question. Returns an error code or null.
create or replace function public.form_answer_error(q jsonb, a jsonb, p_form uuid)
returns text language plpgsql stable set search_path = '' as $$
declare
  kind text := q->>'type';
  labels text[] := coalesce((select array_agg(o->>'label') from jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) o), '{}');
  other boolean := coalesce((q->>'other')::boolean, false);
  n numeric; lo int; hi int; item jsonb; path text;
begin
  if a is null or a = 'null'::jsonb then return null; end if;
  case
    when kind in ('short','paragraph','email','phone','date','time') then
      -- plpgsql ends an IF condition at the first THEN, so the limit is computed first.
      hi := 1000;
      if kind = 'paragraph' then hi := 10000; end if;
      if jsonb_typeof(a) <> 'string' or length(a#>>'{}') > hi then return 'invalid_text'; end if;
      if kind = 'email' and (a#>>'{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid_email'; end if;
      if kind = 'phone' and (a#>>'{}') !~ '^\+?[0-9 ()-]{7,20}$' then return 'invalid_phone'; end if;
      if kind = 'date' and (a#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then return 'invalid_date'; end if;
      if kind = 'time' and (a#>>'{}') !~ '^\d{2}:\d{2}$' then return 'invalid_time'; end if;
    when kind in ('number','rating','scale') then
      if jsonb_typeof(a) <> 'number' then return 'invalid_number'; end if;
      n := (a#>>'{}')::numeric;
      if kind = 'rating' and (n <> trunc(n) or n < 1 or n > coalesce((q->>'max')::int, 5)) then return 'invalid_rating'; end if;
      if kind = 'scale' then
        lo := coalesce((q->>'min')::int, 1); hi := coalesce((q->>'max')::int, 5);
        if n <> trunc(n) or n < lo or n > hi then return 'invalid_scale'; end if;
      end if;
    when kind in ('choice','dropdown','image_choice') then
      if jsonb_typeof(a) <> 'string' or length(a#>>'{}') > 500 then return 'invalid_choice'; end if;
      if not ((a#>>'{}') = any(labels) or (other and kind = 'choice')) then return 'invalid_choice'; end if;
    when kind = 'checkbox' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 100 then return 'invalid_choice'; end if;
      for item in select * from jsonb_array_elements(a) loop
        if jsonb_typeof(item) <> 'string' or length(item#>>'{}') > 500 then return 'invalid_choice'; end if;
        if not ((item#>>'{}') = any(labels) or other) then return 'invalid_choice'; end if;
      end loop;
    when kind = 'file' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 5 then return 'invalid_file'; end if;
      for item in select * from jsonb_array_elements(a) loop
        path := item->>'path';
        if path is null or path not like p_form::text || '/%' or path like '%..%'
           or not exists (select 1 from storage.objects o where o.bucket_id = 'form-uploads' and o.name = path) then
          return 'invalid_file';
        end if;
      end loop;
    else
      return 'invalid_answer';
  end case;
  return null;
end $$;
revoke all on function public.form_answer_error(jsonb, jsonb, uuid) from public, anon, authenticated;

create or replace function public.form_answer_empty(a jsonb) returns boolean language sql immutable set search_path = '' as $$
  select a is null or a = 'null'::jsonb
    or (jsonb_typeof(a) = 'string' and btrim(a#>>'{}') = '')
    or (jsonb_typeof(a) = 'array' and jsonb_array_length(a) = 0)
$$;

-- The only way a response is written. Errors are stable codes the page translates.
create or replace function public.submit_form_response(p_form uuid, p_answers jsonb, p_device text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  f public.forms;
  q jsonb;
  question_ids text[];
  problem text;
  key text;
  created uuid;
begin
  select * into f from public.forms where id = p_form;
  if not found then raise exception 'form_not_found' using errcode = 'P0002'; end if;
  if not public.form_is_open(f) then raise exception 'form_closed' using errcode = '42501'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 120000 then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;
  if f.one_per_device and (p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,64}$') then
    raise exception 'device_required' using errcode = '22023';
  end if;

  select coalesce(array_agg(x->>'id'), '{}') into question_ids
  from jsonb_array_elements(f.questions) x where x->>'type' <> 'section';
  for key in select jsonb_object_keys(p_answers) loop
    if not key = any(question_ids) then raise exception 'unknown_question' using errcode = '22023'; end if;
  end loop;

  for q in select * from jsonb_array_elements(f.questions) loop
    continue when q->>'type' = 'section';
    if coalesce((q->>'required')::boolean, false) and public.form_answer_empty(p_answers->(q->>'id')) then
      raise exception 'required_missing' using errcode = '22023', detail = q->>'id';
    end if;
    problem := public.form_answer_error(q, p_answers->(q->>'id'), f.id);
    if problem is not null then raise exception '%', problem using errcode = '22023', detail = q->>'id'; end if;
  end loop;

  begin
    insert into public.form_responses(form_id, answers, respondent_id, device_key)
    values (f.id, p_answers, auth.uid(), case when f.one_per_device then p_device end)
    returning id into created;
  exception when unique_violation then
    raise exception 'already_submitted' using errcode = '23505';
  end;
  return created;
end $$;
revoke all on function public.submit_form_response(uuid, jsonb, text) from public;
grant execute on function public.submit_form_response(uuid, jsonb, text) to anon, authenticated;

-- Per-form figures for the dashboard: responses, the latest one, and the mean
-- rating across every star question scaled to five.
create or replace function public.form_overview()
returns table(form_id uuid, responses bigint, last_response_at timestamptz, rating_avg numeric)
language sql stable security invoker set search_path = '' as $$
  select f.id,
    (select count(*) from public.form_responses r where r.form_id = f.id),
    (select max(r.created_at) from public.form_responses r where r.form_id = f.id),
    (select round(avg((r.answers->>(q->>'id'))::numeric / coalesce((q->>'max')::numeric, 5) * 5), 2)
       from jsonb_array_elements(f.questions) q
       join public.form_responses r on r.form_id = f.id
      where q->>'type' = 'rating' and jsonb_typeof(r.answers->(q->>'id')) = 'number')
  from public.forms f
$$;
revoke all on function public.form_overview() from public, anon;
grant execute on function public.form_overview() to authenticated;

-- ---- files ---------------------------------------------------------------------------

-- A respondent may upload only into a form that is open and asks for a file.
create or replace function public.form_accepts_uploads(p_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.forms f
    where f.id::text = p_folder and public.form_is_open(f) and f.questions @> '[{"type":"file"}]'::jsonb
  )
$$;
revoke all on function public.form_accepts_uploads(text) from public;
grant execute on function public.form_accepts_uploads(text) to anon, authenticated;

create or replace function public.form_role_for_folder(p_folder text)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_folder ~ '^[0-9a-f-]{36}$' then public.form_role(p_folder::uuid) end
$$;
revoke all on function public.form_role_for_folder(text) from public, anon;
grant execute on function public.form_role_for_folder(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('form-uploads', 'form-uploads', false, 10485760, array[
    'application/pdf','image/jpeg','image/png','image/webp','image/heic','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('form-media', 'form-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy form_uploads_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'form-uploads' and public.form_accepts_uploads((storage.foldername(name))[1]));
create policy form_uploads_read on storage.objects for select to authenticated
  using (bucket_id = 'form-uploads' and public.form_role_for_folder((storage.foldername(name))[1]) is not null);
create policy form_uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-uploads' and public.form_role_for_folder((storage.foldername(name))[1]) in ('owner','editor'));

-- Covers and question images are public (respondents see them) but only the
-- form's owner and editors put them there.
create policy form_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'form-media' and public.form_role_for_folder((storage.foldername(name))[1]) in ('owner','editor'));
create policy form_media_read on storage.objects for select to authenticated
  using (bucket_id = 'form-media' and public.form_role_for_folder((storage.foldername(name))[1]) is not null);
create policy form_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-media' and public.form_role_for_folder((storage.foldername(name))[1]) in ('owner','editor'));

commit;

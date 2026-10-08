begin;

-- The original table name is retained for compatibility, but bindings now
-- represent every active Reid employee who has explicitly been linked by an
-- Owner. Authority is still derived from user_roles, never from the phone.
alter table public.whatsapp_admin_profiles
  add column outbound_scope text not null default 'company' check (outbound_scope in ('none','company','any')),
  add column artifacts_enabled boolean not null default true,
  add column workshops_enabled boolean not null default true,
  add column notes_enabled boolean not null default true;

update public.whatsapp_admin_profiles profile set outbound_scope='any'
where exists(select 1 from public.user_roles role where role.user_id=profile.user_id and role.role in ('owner','super_admin'));

drop policy whatsapp_admin_profiles_owner_manage on public.whatsapp_admin_profiles;
create policy whatsapp_admin_profiles_owner_manage on public.whatsapp_admin_profiles
for all to authenticated
using (public.has_role('owner') or public.has_role('super_admin'))
with check (
  (public.has_role('owner') or public.has_role('super_admin'))
  and exists(select 1 from public.user_roles role where role.user_id=whatsapp_admin_profiles.user_id and role.role<>'guest')
  and exists(select 1 from public.account_controls control where control.user_id=whatsapp_admin_profiles.user_id and control.status='active')
);

create table public.whatsapp_actions (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_phone text not null check (requester_phone ~ '^[1-9][0-9]{7,14}$'),
  conversation_id uuid references public.qr_conversations(id) on delete set null,
  kind text not null check (kind in (
    'send_text','send_artifact','generate_artifact','generate_image',
    'workshop_create','workshop_update','workshop_publish','workshop_cancel',
    'note_delete'
  )),
  approval_level integer not null default 1 check (approval_level between 0 and 4),
  payload jsonb not null default '{}' check (jsonb_typeof(payload)='object'),
  preview text not null check (length(preview) between 1 and 8000),
  status text not null default 'pending_confirmation' check (status in (
    'pending_confirmation','queued','running','completed','failed','cancelled','uncertain','expired'
  )),
  recipient_phone text check (recipient_phone is null or recipient_phone ~ '^[1-9][0-9]{7,14}$'),
  recipient_name text check (recipient_name is null or length(recipient_name) between 1 and 120),
  output_summary text check (output_summary is null or length(output_summary)<=2000),
  wa_message_id text,
  error_code text,
  expires_at timestamptz not null default now()+interval '30 minutes',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index whatsapp_actions_requester_recent on public.whatsapp_actions(requester_id,status,created_at desc);
create index whatsapp_actions_queue on public.whatsapp_actions(status,created_at) where status in ('queued','running');
alter table public.whatsapp_actions enable row level security;
revoke all on public.whatsapp_actions from anon,authenticated;
grant select on public.whatsapp_actions to authenticated;
grant all on public.whatsapp_actions to service_role;
create policy whatsapp_actions_read on public.whatsapp_actions for select to authenticated
using (requester_id=auth.uid() or public.has_role('owner') or public.has_role('super_admin'));

create table public.assistant_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^[1-9][0-9]{7,14}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  internal_user_id uuid references public.profiles(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,phone_e164)
);
alter table public.assistant_contacts enable row level security;
revoke all on public.assistant_contacts from anon,authenticated;
grant select,insert,update,delete on public.assistant_contacts to authenticated;
grant all on public.assistant_contacts to service_role;
create policy assistant_contacts_self on public.assistant_contacts for all to authenticated
using (owner_id=auth.uid() and public.is_account_active())
with check (owner_id=auth.uid() and public.is_account_active());

create table public.assistant_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null check (length(title) between 1 and 180),
  body text not null check (length(body) between 1 and 8000),
  scope text not null default 'personal' check (scope in ('personal','project','workshop')),
  project_id uuid references public.projects(id) on delete cascade,
  workshop_id uuid references public.workshops(id) on delete cascade,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope='personal' and project_id is null and workshop_id is null)
    or (scope='project' and project_id is not null and workshop_id is null)
    or (scope='workshop' and project_id is null and workshop_id is not null)
  )
);
create index assistant_notes_owner_recent on public.assistant_notes(owner_id,status,updated_at desc);
alter table public.assistant_notes enable row level security;
revoke all on public.assistant_notes from anon,authenticated;
grant select,insert,update,delete on public.assistant_notes to authenticated;
grant all on public.assistant_notes to service_role;
create policy assistant_notes_self on public.assistant_notes for all to authenticated
using (owner_id=auth.uid() and public.is_account_active())
with check (owner_id=auth.uid() and public.is_account_active());

create table public.whatsapp_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid references public.whatsapp_actions(id) on delete set null,
  kind text not null check (kind in ('pdf','docx','xlsx','image')),
  title text not null check (length(title) between 1 and 180),
  storage_bucket text not null default 'assistant-files' check (storage_bucket='assistant-files'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','image/webp'
  )),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  source_prompt text not null default '' check (length(source_prompt)<=4000),
  created_at timestamptz not null default now()
);
create index whatsapp_artifacts_owner_recent on public.whatsapp_artifacts(owner_id,created_at desc);
alter table public.whatsapp_artifacts enable row level security;
revoke all on public.whatsapp_artifacts from anon,authenticated;
grant select,delete on public.whatsapp_artifacts to authenticated;
grant all on public.whatsapp_artifacts to service_role;
create policy whatsapp_artifacts_self_read on public.whatsapp_artifacts for select to authenticated
using (owner_id=auth.uid() and public.is_account_active());
create policy whatsapp_artifacts_self_delete on public.whatsapp_artifacts for delete to authenticated
using (owner_id=auth.uid() and public.is_account_active());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
  'assistant-files','assistant-files',false,26214400,array[
    'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','image/webp'
  ]
) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy assistant_files_self_read on storage.objects for select to authenticated
using(bucket_id='assistant-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy assistant_files_self_delete on storage.objects for delete to authenticated
using(bucket_id='assistant-files' and (storage.foldername(name))[1]=auth.uid()::text);

alter table public.qr_outbox
  add column action_id uuid references public.whatsapp_actions(id) on delete set null,
  add column message_type text not null default 'text' check (message_type in ('text','document','image')),
  add column media_bucket text,
  add column media_path text,
  add column media_mime text,
  add column media_filename text,
  add column caption text,
  add constraint qr_outbox_media_shape check (
    (message_type='text' and media_bucket is null and media_path is null and media_mime is null and media_filename is null)
    or (message_type in ('document','image') and media_bucket='assistant-files' and media_path is not null and media_mime is not null and media_filename is not null)
  );

create function public.guard_assistant_note() returns trigger language plpgsql set search_path='' as $$
begin
  if new.owner_id<>old.owner_id then raise exception 'immutable_note_owner'; end if;
  new.updated_at=now(); return new;
end $$;
create trigger guard_assistant_notes before update on public.assistant_notes for each row execute function public.guard_assistant_note();

create function public.audit_private_assistant_record() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; actor uuid;
begin
  snapshot:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor:=coalesce(auth.uid(),nullif(snapshot->>'owner_id','')::uuid,nullif(snapshot->>'requester_id','')::uuid);
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(actor,tg_op,tg_table_name,snapshot->>'id',jsonb_build_object(
    'kind',coalesce(snapshot->>'kind',snapshot->>'scope'),
    'status',snapshot->>'status','has_recipient',snapshot ? 'recipient_phone'
  ));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.guard_assistant_note(),public.audit_private_assistant_record() from public,anon,authenticated;
create trigger audit_whatsapp_actions after insert or update or delete on public.whatsapp_actions for each row execute function public.audit_private_assistant_record();
create trigger audit_assistant_notes after insert or update or delete on public.assistant_notes for each row execute function public.audit_private_assistant_record();
create trigger audit_whatsapp_artifacts after insert or update or delete on public.whatsapp_artifacts for each row execute function public.audit_private_assistant_record();

insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema) values
  ('workshops.create_draft','إنشاء مسودة ورشة','Create workshop draft','Create a validated bilingual workshop draft without publishing it.','create',1,'{"required":["title_ar","title_en","start_at","end_at"]}'),
  ('workshops.update','تحديث ورشة','Update workshop','Update a workshop draft; publication and cancellation remain separate approvals.','update',1,'{"required":["workshop_id"]}'),
  ('notes.list','عرض ملاحظاتي','List my notes','List only the requesting user personal assistant notes.','read',0,'{}'),
  ('notes.create','حفظ ملاحظة','Create note','Create a private note owned by the requesting user.','create',1,'{"required":["title","body"]}')
on conflict(id) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
  operation=excluded.operation,approval_level=excluded.approval_level,input_schema=excluded.input_schema,enabled=true,updated_at=now();

insert into public.agent_tool_assignments(agent_id,tool_id) values
  ('ceo','workshops.create_draft'),('operations','workshops.create_draft'),
  ('ceo','workshops.update'),('operations','workshops.update'),
  ('ceo','notes.list'),('operations','notes.list'),('ceo','notes.create'),('operations','notes.create')
on conflict do nothing;

commit;

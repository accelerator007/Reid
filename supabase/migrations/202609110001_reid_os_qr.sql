begin;

-- QR is an independent channel; preserve the legacy inbox and its history.
create table public.qr_conversations (
  id uuid primary key default gen_random_uuid(),
  jid text not null unique,
  display_name text not null default '',
  bot_mode text not null default 'human' check (bot_mode in ('active','human')),
  last_message text not null default '',
  updated_at timestamptz not null default now()
);
create table public.qr_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id),
  message_id text unique not null,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  status text not null default 'received',
  created_at timestamptz not null default now()
);
create table public.qr_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id),
  message_id text not null unique,
  input text not null,
  state text not null default 'queued' check (state in ('queued','running','done','failed','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create table public.qr_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id),
  body text not null check (length(body) between 1 and 8000),
  origin text not null check (origin in ('human','bot')),
  requested_by uuid references public.profiles(id),
  dedupe_key text not null unique,
  wa_message_id text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','uncertain','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index qr_messages_thread on public.qr_messages(conversation_id,created_at);
create index qr_jobs_pending on public.qr_jobs(state,created_at);
create index qr_outbox_pending on public.qr_outbox(status,created_at);

alter table public.qr_conversations enable row level security;
alter table public.qr_messages enable row level security;
alter table public.qr_jobs enable row level security;
alter table public.qr_outbox enable row level security;
revoke all on public.qr_conversations,public.qr_messages,public.qr_jobs,public.qr_outbox from anon,authenticated;
grant select on public.qr_conversations,public.qr_messages,public.qr_jobs,public.qr_outbox to authenticated;
create policy qr_conversations_read on public.qr_conversations for select to authenticated using (public.has_role('owner'));
create policy qr_messages_read on public.qr_messages for select to authenticated using (public.has_role('owner'));
create policy qr_jobs_read on public.qr_jobs for select to authenticated using (public.has_role('owner'));
create policy qr_outbox_read on public.qr_outbox for select to authenticated using (public.has_role('owner'));
grant all on public.qr_conversations,public.qr_messages,public.qr_jobs,public.qr_outbox to service_role;

-- Working records share lifecycle and ownership, not permissions. Scope is
-- decided in the database for each kind, including self-service HR requests.
create table public.work_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('goal','ticket','leave','purchase','asset','content','decision','contract')),
  title text not null check (length(title) between 1 and 250),
  description text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','review','done','cancelled')),
  owner_id uuid not null references public.profiles(id) default auth.uid(),
  assigned_to uuid references public.profiles(id),
  project_id uuid references public.projects(id),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.work_record_access(k text, creator uuid, assignee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_account_active() and (
 public.has_role('owner') or public.has_role('super_admin') or
 (k in ('goal','ticket','asset','content','decision') and public.has_role('admin')) or
 (k='leave' and public.has_role('hr')) or
 (k in ('ticket','leave') and auth.uid() in (creator,assignee))
 )
$$;

alter table public.work_records enable row level security;
revoke all on public.work_records from anon,authenticated;
grant select,insert,update on public.work_records to authenticated;
create policy work_records_read on public.work_records for select to authenticated
 using (public.work_record_access(kind,owner_id,assigned_to));
create policy work_records_insert on public.work_records for insert to authenticated
 with check (owner_id=auth.uid() and status='open' and public.work_record_access(kind,owner_id,assigned_to));
create policy work_records_update on public.work_records for update to authenticated
 using (public.work_record_access(kind,owner_id,assigned_to)) with check (public.work_record_access(kind,owner_id,assigned_to));

create function public.guard_work_record() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind<>old.kind or new.owner_id<>old.owner_id then raise exception 'immutable_record_identity'; end if;
 if old.kind='leave' and not (public.has_role('owner') or public.has_role('super_admin') or public.has_role('hr')) then
   if new.status not in ('open','cancelled') or old.status not in ('open','cancelled') or new.assigned_to is distinct from old.assigned_to then raise exception 'approval_required'; end if;
 end if;
 new.updated_at=now(); return new;
end $$;
create trigger work_records_guard before update on public.work_records for each row execute function public.guard_work_record();

create table public.finance_documents (
 id uuid primary key default gen_random_uuid(),
 number bigint generated always as identity unique,
 kind text not null check (kind in ('quote','invoice','expense')),
 title text not null check (length(title) between 1 and 250),
 counterparty text not null,
 project_id uuid references public.projects(id),
 amount numeric(14,3) not null check (amount>=0),
 currency text not null default 'OMR' check (currency in ('OMR','USD','AED','EUR')),
 status text not null default 'draft' check(status in ('draft','issued','approved','paid','void')),
 due_date date,
 notes text not null default '',
 created_by uuid not null references public.profiles(id) default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.finance_documents enable row level security;
revoke all on public.finance_documents from anon,authenticated;
grant select,insert,update on public.finance_documents to authenticated;
grant usage,select on sequence public.finance_documents_number_seq to authenticated;
create policy finance_owner_read on public.finance_documents for select to authenticated using (public.has_role('owner') or public.has_role('super_admin'));
create policy finance_owner_insert on public.finance_documents for insert to authenticated with check ((public.has_role('owner') or public.has_role('super_admin')) and created_by=auth.uid() and status='draft');
create policy finance_owner_update on public.finance_documents for update to authenticated using (public.has_role('owner') or public.has_role('super_admin')) with check (public.has_role('owner') or public.has_role('super_admin'));
create function public.guard_finance_document() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind<>old.kind or new.created_by<>old.created_by or new.number<>old.number then raise exception 'immutable_document_identity'; end if;
 if old.status<>'draft' and (new.amount<>old.amount or new.currency<>old.currency or new.counterparty<>old.counterparty) then raise exception 'issued_document_immutable'; end if;
 if old.status in ('paid','void') then raise exception 'document_finalized'; end if;
 if new.status<>old.status and not (
  (old.status='draft' and new.status in ('issued','void')) or
  (old.status='issued' and new.status in ('approved','paid','void') and (new.status<>'paid' or old.kind<>'quote')) or
  (old.status='approved' and new.status in ('paid','void') and (new.status<>'paid' or old.kind<>'quote'))
 ) then raise exception 'invalid_document_transition'; end if;
 new.updated_at=now(); return new;
end $$;
create trigger finance_documents_guard before update on public.finance_documents for each row execute function public.guard_finance_document();

-- Store change receipts without duplicating personal message/document bodies.
create function public.audit_reid_os() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
 values(auth.uid(),tg_op,tg_table_name,new.id::text,jsonb_build_object('kind',to_jsonb(new)->>'kind','status',to_jsonb(new)->>'status'));
 return new;
end $$;
revoke all on function public.audit_reid_os() from public;
create trigger work_records_audit after insert or update on public.work_records for each row execute function public.audit_reid_os();
create trigger finance_documents_audit after insert or update on public.finance_documents for each row execute function public.audit_reid_os();
create trigger qr_outbox_audit after insert or update on public.qr_outbox for each row execute function public.audit_reid_os();

commit;

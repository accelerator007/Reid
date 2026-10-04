begin;

create table if not exists public.meeting_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  google_refresh_token text not null check (length(google_refresh_token) between 40 and 4096),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meeting_connections enable row level security;
revoke all on public.meeting_connections from anon, authenticated;
comment on table public.meeting_connections is 'Service-role-only encrypted Google Meet OAuth refresh tokens. Never exposed through PostgREST to browser clients.';

create table if not exists public.reid_meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.qr_conversations(id) on delete set null,
  status text not null default 'creating' check (status in ('creating','joining','active','ended','failed','end_failed')),
  google_space_name text,
  meeting_code text,
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://meet\.google\.com/[a-z-]+$'),
  recall_bot_id text,
  source_text text not null default '',
  error_code text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reid_meetings_one_live_per_owner
  on public.reid_meetings(owner_id) where status in ('creating','joining','active');
create index if not exists reid_meetings_owner_created_idx on public.reid_meetings(owner_id,created_at desc);

alter table public.reid_meetings enable row level security;
drop policy if exists reid_meetings_owner_read on public.reid_meetings;
create policy reid_meetings_owner_read on public.reid_meetings for select to authenticated
  using (owner_id=auth.uid() and public.is_admin());
revoke insert,update,delete on public.reid_meetings from anon,authenticated;
grant select on public.reid_meetings to authenticated;

comment on table public.reid_meetings is 'Audited Google Meet sessions created from Reid. Provider secrets remain in meeting_connections and server environment only.';

alter table public.whatsapp_actions drop constraint if exists whatsapp_actions_kind_check;
alter table public.whatsapp_actions add constraint whatsapp_actions_kind_check check (kind in (
  'send_text','send_artifact','generate_artifact','generate_image',
  'workshop_create','workshop_update','workshop_publish','workshop_cancel',
  'note_delete','server_command','meeting_start','meeting_end'
));

commit;

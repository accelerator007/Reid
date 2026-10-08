begin;

-- Keep each human voice distinct in group history. WhatsApp display names are
-- presentation data only; sender_phone remains the authenticated identity.
alter table public.qr_messages add column if not exists sender_name text
  check (sender_name is null or length(sender_name) between 1 and 120);
alter table public.qr_jobs add column if not exists sender_name text
  check (sender_name is null or length(sender_name) between 1 and 120);

alter table public.qr_messages drop constraint if exists qr_messages_media_kind_check;
alter table public.qr_messages add constraint qr_messages_media_kind_check
  check (media_kind is null or media_kind in ('audio','image','document'));

-- Raw uploads are never retained. Only bounded extracted text stays attached to
-- its conversation so a follow-up question can still refer to the document.
create table if not exists public.qr_conversation_documents (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id) on delete cascade,
  message_id text not null unique,
  sender_phone text,
  sender_name text check (sender_name is null or length(sender_name) between 1 and 120),
  file_name text not null check (length(file_name) between 1 and 180),
  mime_type text,
  byte_size integer not null check (byte_size between 1 and 12582912),
  extracted_text text not null check (length(extracted_text) between 1 and 48000),
  text_truncated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qr_conversation_documents_recent
  on public.qr_conversation_documents(conversation_id,created_at desc);

create table if not exists public.whatsapp_group_participants (
  group_jid text not null references public.whatsapp_qr_groups(jid) on delete cascade,
  sender_phone text not null check (sender_phone ~ '^[1-9][0-9]{7,14}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  linked_user_id uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (group_jid,sender_phone)
);

-- Known Reid accounts keep their canonical company name. Other people, such
-- as guests in the Owner group, retain the WhatsApp name observed on message.
insert into public.whatsapp_group_participants(group_jid,sender_phone,display_name,linked_user_id)
select distinct group_row.jid,link.phone_e164,coalesce(nullif(profile.full_name,''),profile.email,link.phone_e164),profile.id
from public.whatsapp_qr_groups group_row
cross join public.whatsapp_admin_profiles link
join public.profiles profile on profile.id=link.user_id
where group_row.enabled and link.enabled
on conflict (group_jid,sender_phone) do update
set display_name=excluded.display_name,linked_user_id=excluded.linked_user_id,last_seen_at=now();

alter table public.qr_conversation_documents enable row level security;
alter table public.whatsapp_group_participants enable row level security;
revoke all on public.qr_conversation_documents from anon,authenticated;
revoke all on public.whatsapp_group_participants from anon,authenticated;
grant select on public.qr_conversation_documents to authenticated;
grant select on public.whatsapp_group_participants to authenticated;
grant all on public.qr_conversation_documents to service_role;
grant all on public.whatsapp_group_participants to service_role;
drop policy if exists qr_conversation_documents_owner_read on public.qr_conversation_documents;
create policy qr_conversation_documents_owner_read on public.qr_conversation_documents
  for select to authenticated using (public.has_role('owner'));
drop policy if exists whatsapp_group_participants_owner_read on public.whatsapp_group_participants;
create policy whatsapp_group_participants_owner_read on public.whatsapp_group_participants
  for select to authenticated using (public.has_role('owner'));

comment on table public.qr_conversation_documents is
  'Bounded text extracted from an inbound WhatsApp PDF, DOCX or XLSX. Raw files are not retained.';
comment on column public.qr_messages.sender_name is
  'Sanitized WhatsApp display name for speaker attribution; never used as identity or authorization.';

commit;

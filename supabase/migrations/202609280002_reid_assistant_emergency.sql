-- Reid Assistant (مساعد ريد): key-person contacts, emergency incidents and the
-- calls/messages sent about them. The assistant server writes with the service
-- role; people only read. Phone numbers and PIN hashes are never seeded here,
-- because this repository is public: they are inserted at deployment time.
begin;

create table public.emergency_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  priority smallint not null default 1 check (priority between 1 and 9),
  enabled boolean not null default true,
  -- Phone calls are opt-in per person; WhatsApp alerts are on by default.
  call_enabled boolean not null default false,
  whatsapp_enabled boolean not null default true,
  language text not null default 'ar' check (language in ('ar','en')),
  quiet_start time,
  quiet_end time,
  min_call_severity text not null default 'critical' check (min_call_severity in ('high','critical')),
  phone_pin_hash text check (phone_pin_hash is null or phone_pin_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);

create table public.emergency_incidents (
  id uuid primary key default gen_random_uuid(),
  key text not null check (length(key) between 1 and 120),
  severity text not null check (severity in ('normal','high','critical')),
  source text not null check (source in ('system','whatsapp','manual','agent')),
  title_ar text not null check (length(title_ar) between 1 and 300),
  title_en text not null check (length(title_en) between 1 and 300),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  occurrences integer not null default 1 check (occurrences >= 1),
  escalation_round smallint not null default 0 check (escalation_round between 0 and 100),
  next_action_at timestamptz,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_via text check (acknowledged_via in ('phone','whatsapp','desktop','web')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  check (status = 'open' or next_action_at is null),
  check (status <> 'acknowledged' or acknowledged_at is not null)
);
-- One live incident per condition: repeated failures update it instead of
-- opening (and phoning about) a new one.
create unique index emergency_incidents_active_key on public.emergency_incidents(key) where status <> 'resolved';
create index emergency_incidents_due on public.emergency_incidents(next_action_at) where status = 'open';

create table public.emergency_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.emergency_incidents(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('call','whatsapp','desktop')),
  status text not null default 'queued' check (status in (
    'queued','initiated','ringing','in_progress','completed','busy','no_answer','failed','canceled','voicemail','sent')),
  provider_ref text,
  outcome text check (outcome in ('acknowledged','escalated','snoozed','no_response','verified','pin_failed')),
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emergency_notifications_incident on public.emergency_notifications(incident_id, created_at);
create unique index emergency_notifications_provider_ref on public.emergency_notifications(provider_ref)
  where provider_ref is not null;

-- Only a key person (Owner, Super Admin or Admin) can be on the alert list.
create or replace function public.emergency_contact_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = new.user_id and role in ('owner','super_admin','admin')
  ) then
    raise exception 'emergency_contact_requires_key_person' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger emergency_contacts_guard before insert or update on public.emergency_contacts
  for each row execute function public.emergency_contact_guard();

-- Atomic open-or-update. Raising severity re-arms escalation immediately.
create or replace function public.emergency_open_incident(
  p_key text, p_severity text, p_source text, p_title_ar text, p_title_en text,
  p_detail jsonb default '{}'::jsonb, p_created_by uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.emergency_incidents;
  wanted int := case p_severity when 'critical' then 2 when 'high' then 1 else 0 end;
  current_rank int;
begin
  select * into existing from public.emergency_incidents
   where key = p_key and status <> 'resolved' for update;
  if found then
    current_rank := case existing.severity when 'critical' then 2 when 'high' then 1 else 0 end;
    update public.emergency_incidents set
      occurrences = occurrences + 1,
      last_seen_at = now(),
      detail = coalesce(p_detail, '{}'::jsonb),
      severity = case when wanted > current_rank then p_severity else severity end,
      title_ar = case when wanted > current_rank then p_title_ar else title_ar end,
      title_en = case when wanted > current_rank then p_title_en else title_en end,
      next_action_at = case when status = 'open' and wanted > current_rank then now() else next_action_at end
    where id = existing.id
    returning * into existing;
    return jsonb_build_object('incident', to_jsonb(existing), 'created', false);
  end if;

  insert into public.emergency_incidents(key, severity, source, title_ar, title_en, detail, created_by, next_action_at)
  values (p_key, p_severity, p_source, p_title_ar, p_title_en, coalesce(p_detail, '{}'::jsonb), p_created_by, now())
  on conflict (key) where status <> 'resolved' do nothing
  returning * into existing;
  if not found then
    select * into existing from public.emergency_incidents where key = p_key and status <> 'resolved';
    return jsonb_build_object('incident', to_jsonb(existing), 'created', false);
  end if;
  return jsonb_build_object('incident', to_jsonb(existing), 'created', true);
end $$;

-- Transcripts are bounded: 60 turns of at most 500 characters each.
create or replace function public.emergency_append_transcript(p_notification_id uuid, p_role text, p_text text)
returns void language sql security definer set search_path = '' as $$
  update public.emergency_notifications
     set transcript = case when jsonb_array_length(transcript) >= 60 then transcript
                           else transcript || jsonb_build_array(jsonb_build_object(
                             'role', p_role, 'text', left(p_text, 500), 'at', now())) end,
         updated_at = now()
   where id = p_notification_id and p_role in ('assistant','person');
$$;

revoke all on function public.emergency_open_incident(text,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.emergency_append_transcript(uuid,text,text) from public, anon, authenticated;
revoke all on function public.emergency_contact_guard() from public, anon, authenticated;
grant execute on function public.emergency_open_incident(text,text,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.emergency_append_transcript(uuid,text,text) to service_role;

alter table public.emergency_contacts enable row level security;
alter table public.emergency_incidents enable row level security;
alter table public.emergency_notifications enable row level security;

revoke all on public.emergency_contacts, public.emergency_incidents, public.emergency_notifications from anon, authenticated;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
grant select on public.emergency_incidents, public.emergency_notifications to authenticated;
grant all on public.emergency_contacts, public.emergency_incidents, public.emergency_notifications to service_role;

-- Contacts: every key person sees the list; only the Owner changes it.
create policy emergency_contacts_read on public.emergency_contacts for select to authenticated
  using (public.has_role('owner') or public.has_role('super_admin') or user_id = auth.uid());
create policy emergency_contacts_owner_insert on public.emergency_contacts for insert to authenticated
  with check (public.has_role('owner'));
create policy emergency_contacts_owner_update on public.emergency_contacts for update to authenticated
  using (public.has_role('owner')) with check (public.has_role('owner'));
create policy emergency_contacts_owner_delete on public.emergency_contacts for delete to authenticated
  using (public.has_role('owner'));

-- Incidents and call records (including transcripts): Owner and Super Admin only.
create policy emergency_incidents_read on public.emergency_incidents for select to authenticated
  using (public.has_role('owner') or public.has_role('super_admin'));
create policy emergency_notifications_read on public.emergency_notifications for select to authenticated
  using (public.has_role('owner') or public.has_role('super_admin'));

commit;

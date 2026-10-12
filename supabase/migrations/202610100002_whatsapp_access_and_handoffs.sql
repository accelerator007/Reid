begin;

alter table public.whatsapp_assistant_settings
  add column customer_handoff_enabled boolean not null default true;

alter table public.whatsapp_admin_profiles
  add column handoff_notifications_enabled boolean not null default false;

alter table public.whatsapp_qr_groups alter column enabled set default false;

-- The two currently linked operators requested by the Owner receive customer
-- handoff alerts by default. Future recipients are chosen from the dashboard.
update public.whatsapp_admin_profiles link
set handoff_notifications_enabled=true,
    updated_at=now()
from public.profiles profile
where profile.id=link.user_id
  and lower(profile.email) in ('alialajmi524@gmail.com','sheikhaalmamari4@gmail.com')
  and link.enabled=true;

create table public.whatsapp_customer_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id) on delete cascade,
  message_id text not null unique check (length(message_id) between 1 and 240),
  requester_phone text not null check (requester_phone ~ '^[1-9][0-9]{7,14}$'),
  requester_name text not null check (length(requester_name) between 1 and 120),
  message_excerpt text not null check (length(message_excerpt) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','resolved')),
  notified_user_ids uuid[] not null default '{}',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='pending' and resolved_by is null and resolved_at is null)
      or (status='resolved' and resolved_by is not null and resolved_at is not null))
);
create index whatsapp_customer_handoffs_pending
  on public.whatsapp_customer_handoffs(status,created_at desc);

alter table public.whatsapp_customer_handoffs enable row level security;
revoke all on public.whatsapp_customer_handoffs from anon,authenticated;
grant select on public.whatsapp_customer_handoffs to authenticated;
grant all on public.whatsapp_customer_handoffs to service_role;
create policy whatsapp_customer_handoffs_owner_read on public.whatsapp_customer_handoffs
for select to authenticated
using (public.has_role('owner') or public.has_role('super_admin'));

comment on column public.whatsapp_admin_profiles.handoff_notifications_enabled is
  'Receives a direct WhatsApp alert when an unknown direct contact asks for a human.';
comment on column public.whatsapp_qr_groups.enabled is
  'Newly discovered groups stay silent until the Owner explicitly enables Reid from the dashboard.';
comment on table public.whatsapp_customer_handoffs is
  'Durable customer requests for a human. Runtime creates them; a dashboard reply or Owner action resolves them.';

commit;

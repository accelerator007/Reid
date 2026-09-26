-- Recover the legacy approval ledger discovered in the production API schema.
-- Both the QR sender and governed webhook still use it. Fresh projects must
-- have it even though older installations created it outside migration history.
create table if not exists public.whatsapp_pending_sends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  requester_phone text not null,
  target_phone text not null,
  target_name text not null,
  body text not null,
  status text not null default 'pending',
  expires_at timestamptz not null default now() + interval '15 minutes',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_pending_sends_requester_state
  on public.whatsapp_pending_sends(requester_id, status, created_at desc);
alter table public.whatsapp_pending_sends enable row level security;
revoke all on public.whatsapp_pending_sends from anon, authenticated;
grant select on public.whatsapp_pending_sends to authenticated;
grant all on public.whatsapp_pending_sends to service_role;
drop policy if exists whatsapp_pending_sends_self_read on public.whatsapp_pending_sends;
create policy whatsapp_pending_sends_self_read on public.whatsapp_pending_sends
  for select to authenticated using (requester_id=auth.uid() and public.is_account_active());

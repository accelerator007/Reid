-- Track invitation delivery separately from the atomic application decision.

alter table public.applications
  add column if not exists invitation_status text not null default 'not_sent'
    check (invitation_status in ('not_sent', 'pending', 'sent', 'failed')),
  add column if not exists invitation_error text,
  add column if not exists invited_at timestamptz;

create index if not exists applications_failed_invitations_idx
  on public.applications (invitation_status, decided_at)
  where status = 'approved' and invitation_status = 'failed';

create or replace function public.decide_application(
  application_id uuid,
  decision public.application_status,
  rejection_reason text default null
) returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  decided public.applications;
begin
  if not (public.is_admin() or public.has_role('hr')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'rejected' and nullif(trim(rejection_reason), '') is null then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  update public.applications
     set status = decision,
         internal_rejection_reason = case when decision = 'rejected' then trim(rejection_reason) else null end,
         decided_by = auth.uid(),
         decided_at = now(),
         invitation_status = case when decision = 'approved' then 'pending' else 'not_sent' end,
         invitation_error = null
   where id = application_id and status = 'pending'
  returning * into decided;

  if decided.id is null then
    raise exception 'application_already_decided' using errcode = '40001';
  end if;
  return decided;
end;
$$;

revoke all on function public.decide_application(uuid, public.application_status, text) from public;
grant execute on function public.decide_application(uuid, public.application_status, text) to authenticated;

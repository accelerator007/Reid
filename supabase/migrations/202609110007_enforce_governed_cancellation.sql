begin;

create or replace function public.guard_business_case_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.stage='cancelled' and old.stage<>'cancelled' and coalesce(current_setting('reid.business_cancellation',true),'')<>'on' then
    raise exception 'use_governed_cancellation';
  end if;
  return new;
end $$;
revoke all on function public.guard_business_case_update() from public,anon;
create trigger business_cases_governed_update before update on public.business_cases
for each row execute function public.guard_business_case_update();

create or replace function public.cancel_business_case(wanted_case uuid, change_reason text)
returns public.business_cases
language plpgsql security definer set search_path='' as $$
declare c public.business_cases; posted_payments bigint;
begin
  if not (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin')) then raise exception 'management_approval_required'; end if;
  if nullif(trim(change_reason),'') is null then raise exception 'reason_required'; end if;
  select * into c from public.business_cases where id=wanted_case for update;
  if not found then raise exception 'business_case_not_found'; end if;
  if c.stage in ('closed','cancelled') then raise exception 'business_case_finalized'; end if;
  if c.stage in ('invoiced','collected') and not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_approval_required'; end if;
  select count(*) into posted_payments from public.finance_payments where business_case_id=c.id and status='posted';
  if posted_payments>0 then raise exception 'reverse_payments_before_cancellation'; end if;

  if c.invoice_id is not null then
    update public.finance_documents set status='void' where id=c.invoice_id and status in ('draft','issued','approved');
  end if;
  if c.stage in ('opportunity','quoted') and c.quote_id is not null then
    update public.finance_documents set status='void' where id=c.quote_id and status in ('draft','issued');
  end if;
  if c.project_id is not null then
    update public.projects set status='cancelled',archived_at=coalesce(archived_at,now()),updated_at=now() where id=c.project_id;
  end if;
  if c.deal_id is not null and c.stage in ('opportunity','quoted') then
    update public.crm_deals set stage='lost',loss_reason=trim(change_reason),closed_at=coalesce(closed_at,now()),updated_at=now() where id=c.deal_id;
  end if;

  insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note)
  values(c.id,auth.uid(),'case_cancelled',c.stage,'cancelled',trim(change_reason));
  perform set_config('reid.business_cancellation','on',true);
  update public.business_cases set stage='cancelled',updated_at=now() where id=c.id returning * into c;
  return c;
end $$;

revoke all on function public.cancel_business_case(uuid,text) from public,anon;
grant execute on function public.cancel_business_case(uuid,text) to authenticated;

commit;

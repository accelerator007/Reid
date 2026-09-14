begin;

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null check (length(title_ar) between 2 and 180),
  title_en text not null check (length(title_en) between 2 and 180),
  description_ar text not null default '' check (length(description_ar) <= 4000),
  description_en text not null default '' check (length(description_en) <= 4000),
  status text not null default 'draft' check (status in ('draft','published','completed','cancelled')),
  visibility text not null default 'public' check (visibility in ('public','internal')),
  format text not null default 'onsite' check (format in ('onsite','online','hybrid')),
  venue_ar text not null default '' check (length(venue_ar) <= 240),
  venue_en text not null default '' check (length(venue_en) <= 240),
  facilitator_name text not null default '' check (length(facilitator_name) <= 160),
  registration_url text check (registration_url is null or registration_url ~ '^https://'),
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_deadline timestamptz,
  capacity integer not null default 20 check (capacity between 1 and 10000),
  price_omr numeric(12,3) not null default 0 check (price_omr >= 0),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (registration_deadline is null or registration_deadline <= start_at)
);

create table public.workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  attendee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','waitlisted','attended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workshop_id,attendee_id)
);

create index workshops_schedule on public.workshops(status,start_at);
create index workshop_registrations_workshop on public.workshop_registrations(workshop_id,status);

alter table public.workshops enable row level security;
alter table public.workshop_registrations enable row level security;
revoke all on public.workshops,public.workshop_registrations from anon,authenticated;
grant select on public.workshops to anon,authenticated;
grant insert,update,delete on public.workshops to authenticated;
grant select,update on public.workshop_registrations to authenticated;
grant all on public.workshops,public.workshop_registrations to service_role;

create policy workshops_public_read on public.workshops for select to anon
using (status='published' and visibility='public');

create policy workshops_authenticated_read on public.workshops for select to authenticated
using (
  (status='published' and visibility='public')
  or (status='published' and visibility='internal' and public.is_account_active() and exists(
    select 1 from public.user_roles role where role.user_id=auth.uid() and role.role<>'guest'
  ))
  or public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr')
);

create policy workshops_manager_insert on public.workshops for insert to authenticated
with check (
  created_by=auth.uid() and (
    public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr')
  )
);
create policy workshops_manager_update on public.workshops for update to authenticated
using (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr'))
with check (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr'));
create policy workshops_manager_delete on public.workshops for delete to authenticated
using (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr'));

create policy workshop_registrations_read on public.workshop_registrations for select to authenticated
using (
  attendee_id=auth.uid()
  or public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr')
);
create policy workshop_registrations_manager_update on public.workshop_registrations for update to authenticated
using (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr'))
with check (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('hr'));

create function public.register_for_workshop(target_workshop uuid)
returns table(registration_id uuid,registration_status text)
language plpgsql security definer set search_path='' as $$
declare selected public.workshops; active_count integer; chosen text; existing public.workshop_registrations;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'sign_in_required'; end if;
  select * into selected from public.workshops where id=target_workshop for update;
  if not found or selected.status<>'published' then raise exception 'workshop_not_found'; end if;
  if selected.visibility='internal' and not exists(
    select 1 from public.user_roles role where role.user_id=auth.uid() and role.role<>'guest'
  ) then raise exception 'workshop_access_denied'; end if;
  if selected.start_at<=now() or coalesce(selected.registration_deadline,selected.start_at)<=now() then raise exception 'workshop_registration_closed'; end if;
  select * into existing from public.workshop_registrations
    where workshop_id=target_workshop and attendee_id=auth.uid();
  if found and existing.status in ('registered','attended') then
    registration_id:=existing.id;
    registration_status:=existing.status;
    return next;
    return;
  end if;
  select count(*) into active_count from public.workshop_registrations
    where workshop_id=target_workshop and status in ('registered','attended');
  chosen:=case when active_count<selected.capacity then 'registered' else 'waitlisted' end;
  insert into public.workshop_registrations(workshop_id,attendee_id,status)
  values(target_workshop,auth.uid(),chosen)
  on conflict(workshop_id,attendee_id) do update set
    status=case when workshop_registrations.status='cancelled' then excluded.status else workshop_registrations.status end,
    updated_at=now()
  returning id,status into registration_id,registration_status;
  return next;
end $$;

create function public.cancel_workshop_registration(target_workshop uuid)
returns void language plpgsql security definer set search_path='' as $$
declare cancelled_status text; promoted_id uuid;
begin
  if auth.uid() is null or not public.is_account_active() then raise exception 'sign_in_required'; end if;
  perform 1 from public.workshops where id=target_workshop for update;
  select status into cancelled_status from public.workshop_registrations
  where workshop_id=target_workshop and attendee_id=auth.uid() and status in ('registered','waitlisted')
  for update;
  if not found then raise exception 'workshop_registration_not_found'; end if;
  update public.workshop_registrations set status='cancelled',updated_at=now()
  where workshop_id=target_workshop and attendee_id=auth.uid();
  if cancelled_status='registered' then
    select id into promoted_id from public.workshop_registrations
    where workshop_id=target_workshop and status='waitlisted'
    order by created_at for update skip locked limit 1;
    if promoted_id is not null then
      update public.workshop_registrations set status='registered',updated_at=now() where id=promoted_id;
    end if;
  end if;
end $$;

revoke all on function public.register_for_workshop(uuid) from public,anon;
revoke all on function public.cancel_workshop_registration(uuid) from public,anon;
grant execute on function public.register_for_workshop(uuid) to authenticated;
grant execute on function public.cancel_workshop_registration(uuid) to authenticated;

create view public.workshop_registration_counts with (security_invoker=true) as
select workshop_id,
  count(*) filter(where status in ('registered','attended'))::integer as registration_count,
  count(*) filter(where status='waitlisted')::integer as waitlist_count
from public.workshop_registrations group by workshop_id;
revoke all on public.workshop_registration_counts from public,anon,authenticated;
grant select on public.workshop_registration_counts to service_role;

create function public.guard_workshop() returns trigger language plpgsql set search_path='' as $$
begin
  if new.created_by<>old.created_by then raise exception 'immutable_workshop_creator'; end if;
  new.updated_at=now(); return new;
end $$;
create trigger guard_workshops before update on public.workshops for each row execute function public.guard_workshop();

create function public.audit_workshop() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),tg_op,tg_table_name,snapshot->>'id',jsonb_build_object(
    'status',snapshot->>'status','visibility',snapshot->>'visibility','start_at',snapshot->>'start_at'
  ));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.guard_workshop(),public.audit_workshop() from public,anon,authenticated;
create trigger audit_workshops after insert or update or delete on public.workshops for each row execute function public.audit_workshop();
create trigger audit_workshop_registrations after insert or update or delete on public.workshop_registrations for each row execute function public.audit_row();

insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema)
values('workshops.list','عرض الورش','List workshops','Read the bounded workshop schedule, publication state, capacity and aggregate registration totals.','read',0,'{}')
on conflict(id) do update set
  name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
  operation=excluded.operation,approval_level=excluded.approval_level,input_schema=excluded.input_schema,updated_at=now();

insert into public.agent_tool_assignments(agent_id,tool_id) values
  ('ceo','workshops.list'),('operations','workshops.list'),('sales','workshops.list'),
  ('support','workshops.list'),('knowledge','workshops.list')
on conflict do nothing;

commit;

begin;

-- A conversation has one durable operational follow-up. Retrying the save is
-- safe: the conversation lock serializes creation of every linked record.
create table public.customer_journeys (
  conversation_id uuid primary key references public.qr_conversations on delete cascade,
  contact_id uuid not null references public.crm_contacts,
  lead_id uuid not null references public.crm_leads,
  request_id uuid not null unique references public.work_records,
  task_id uuid not null unique references public.tasks,
  project_id uuid references public.projects,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_journeys enable row level security;
revoke all on public.customer_journeys from anon, authenticated;
grant select on public.customer_journeys to authenticated;
grant all on public.customer_journeys to service_role;
create policy customer_journeys_owner_read on public.customer_journeys for select to authenticated
using (public.is_account_active() and (public.has_role('owner') or public.has_role('super_admin')));

create function public.save_customer_journey(
  wanted_conversation uuid, follow_up_title text, follow_up_due timestamptz,
  assigned_user uuid, wanted_contact uuid default null, wanted_project uuid default null,
  new_project_name text default null
) returns public.customer_journeys
language plpgsql security definer set search_path='' as $$
declare
  chat public.qr_conversations;
  journey public.customer_journeys;
  contact uuid; lead uuid; request uuid; task uuid; project uuid;
  customer_phone text; matches int;
begin
  if not public.is_account_active() or not (public.has_role('owner') or public.has_role('super_admin')) then
    raise exception 'owner_required';
  end if;
  if nullif(trim(follow_up_title),'') is null or length(follow_up_title)>250 or follow_up_due is null
    or not isfinite(follow_up_due) then raise exception 'invalid_follow_up'; end if;
  if not exists(select 1 from public.account_controls where user_id=assigned_user and status='active')
    or not exists(select 1 from public.user_roles where user_id=assigned_user and role<>'guest')
    then raise exception 'invalid_assignee'; end if;
  select * into chat from public.qr_conversations where id=wanted_conversation for update;
  if not found then raise exception 'conversation_not_found'; end if;
  customer_phone:=split_part(chat.jid,'@',1);
  if chat.jid not like '%@s.whatsapp.net' or exists(
    select 1 from public.whatsapp_admin_profiles where enabled and phone_e164=customer_phone
  ) then raise exception 'customer_conversation_required'; end if;
  select * into journey from public.customer_journeys where conversation_id=chat.id;
  project:=coalesce(wanted_project,journey.project_id);
  if wanted_project is not null and nullif(trim(new_project_name),'') is not null then raise exception 'invalid_project'; end if;
  if project is not null and not exists(select 1 from public.projects where id=project and archived_at is null) then raise exception 'invalid_project'; end if;
  if nullif(trim(new_project_name),'') is not null and project is null then
    if length(new_project_name)>200 then raise exception 'invalid_project'; end if;
    insert into public.projects(name,type,manager_id) values(trim(new_project_name),'client',auth.uid()) returning id into project;
  end if;
  if journey.conversation_id is null then
    contact:=wanted_contact;
    if contact is not null and not exists(select 1 from public.crm_contacts where id=contact) then raise exception 'invalid_contact'; end if;
    if contact is null then
      -- Normalize only full international numbers; ambiguous matches need a human choice.
      select count(*), (array_agg(id))[1] into matches,contact from public.crm_contacts
      where regexp_replace(coalesce(crm_contacts.phone,''),'[^0-9]','','g')=customer_phone;
      if matches>1 then raise exception 'ambiguous_contact'; end if;
    end if;
    if contact is null then
      insert into public.crm_contacts(name,phone,source,owner_id)
      values(coalesce(nullif(trim(chat.display_name),''),'+'||customer_phone),'+'||customer_phone,'whatsapp',auth.uid()) returning id into contact;
    end if;
    insert into public.crm_leads(title,contact_id,owner_id,source,next_follow_up_at)
      values(trim(follow_up_title),contact,assigned_user,'whatsapp',follow_up_due) returning id into lead;
    insert into public.work_records(kind,title,owner_id,assigned_to,project_id,due_date)
      values('ticket',trim(follow_up_title),auth.uid(),assigned_user,project,(follow_up_due at time zone 'Asia/Muscat')::date) returning id into request;
    insert into public.tasks(title,assignee_id,project_id,due_at,created_by)
      values(trim(follow_up_title),assigned_user,project,follow_up_due,auth.uid()) returning id into task;
    insert into public.customer_journeys(conversation_id,contact_id,lead_id,request_id,task_id,project_id,created_by)
      values(chat.id,contact,lead,request,task,project,auth.uid()) returning * into journey;
  else
    if wanted_contact is not null and wanted_contact<>journey.contact_id then raise exception 'contact_already_linked'; end if;
    update public.tasks set title=trim(follow_up_title),assignee_id=assigned_user,project_id=project,due_at=follow_up_due where id=journey.task_id;
    update public.work_records set title=trim(follow_up_title),assigned_to=assigned_user,project_id=project,due_date=(follow_up_due at time zone 'Asia/Muscat')::date where id=journey.request_id;
    update public.crm_leads set next_follow_up_at=case when exists(select 1 from public.tasks where id=journey.task_id and status in ('done','cancelled')) then null else follow_up_due end,owner_id=assigned_user,updated_at=now() where id=journey.lead_id;
    update public.customer_journeys set project_id=project,updated_at=now() where conversation_id=chat.id returning * into journey;
  end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
    values(auth.uid(),'customer_journey_saved','customer_journeys',chat.id::text,to_jsonb(journey));
  return journey;
end $$;
revoke all on function public.save_customer_journey(uuid,text,timestamptz,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.save_customer_journey(uuid,text,timestamptz,uuid,uuid,uuid,text) to authenticated;

-- Completing the task also closes its linked request and CRM follow-up. The
-- existing task policy authorizes the assignee; no conversation data is exposed.
create function public.sync_customer_journey_task() returns trigger
language plpgsql security definer set search_path='' as $$
declare journey public.customer_journeys;
begin
  select * into journey from public.customer_journeys where task_id=new.id;
  if found then
    if new.status is distinct from old.status then
      update public.work_records set status=case when new.status in ('done','cancelled') then new.status when new.status='in_progress' then 'in_progress' else 'open' end,
        updated_at=now() where id=journey.request_id and not (status='review' and new.status='in_progress') and status is distinct from
        case when new.status in ('done','cancelled') then new.status when new.status='in_progress' then 'in_progress' else 'open' end;
    end if;
    update public.crm_leads set next_follow_up_at=case when new.status in ('done','cancelled') then null else new.due_at end,
      updated_at=now() where id=journey.lead_id;
  end if;
  return new;
end $$;
create trigger sync_customer_journey_task after update of status,due_at on public.tasks
for each row execute function public.sync_customer_journey_task();

create function public.sync_customer_journey_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare wanted_status text;
begin
  if new.status is distinct from old.status then
    wanted_status:=case when new.status in ('done','cancelled') then new.status when new.status in ('in_progress','review') then 'in_progress' else 'todo' end;
    update public.tasks set status=wanted_status where id in
      (select task_id from public.customer_journeys where request_id=new.id) and status is distinct from wanted_status;
  end if;
  return new;
end $$;
create trigger sync_customer_journey_request after update of status on public.work_records
for each row execute function public.sync_customer_journey_request();

create function public.owner_action_items()
returns table(id text,kind text,title text,due_at timestamptz,href text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_account_active() or not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'owner_required'; end if;
  return query select a.id,a.kind,a.title,a.due_at,a.href from (
    select 'handoff:'||h.id id,'handoff'::text kind,h.requester_name title,h.created_at due_at,'/inbox?chat='||h.conversation_id href,0 rank
      from public.whatsapp_customer_handoffs h where h.status='pending'
    union all
    select 'task:'||t.id,'task',t.title,t.due_at,
      case when j.conversation_id is not null then '/inbox?chat='||j.conversation_id else '/today?task='||t.id end,1
      from public.tasks t left join public.customer_journeys j on j.task_id=t.id where t.status not in ('done','cancelled') and t.due_at<now()
    union all
    select 'review:'||w.id,'review',w.title,w.created_at,'/operations?record='||w.id,2
      from public.work_records w where w.status='review'
    union all
    select 'lead:'||l.id,'lead',l.title,l.next_follow_up_at,'/crm?lead='||l.id,3
      from public.crm_leads l where l.stage not in ('converted','lost') and l.next_follow_up_at<=now()
        and not exists(select 1 from public.customer_journeys j where j.lead_id=l.id)
  ) a order by a.rank,a.due_at,a.id limit 30;
end $$;
revoke all on function public.owner_action_items() from public,anon;
grant execute on function public.owner_action_items() to authenticated;
commit;

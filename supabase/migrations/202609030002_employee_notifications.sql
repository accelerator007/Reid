-- Employee-facing notifications for assignments and company activity.
create or replace function public.notify_employee_assignment() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if new.assignee_id is not null and (tg_op='INSERT' or old.assignee_id is distinct from new.assignee_id) then
    insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
    values(new.assignee_id,'task_assigned','مهمة جديدة','New task',new.title,new.title,'task',new.id);
  end if; return new;
end $$;
create trigger notify_employee_assignment after insert or update of assignee_id on public.tasks for each row execute function public.notify_employee_assignment();

create or replace function public.notify_onboarding_assignment() returns trigger language plpgsql security definer set search_path='' as $$ begin
  insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  values(new.user_id,'onboarding_assigned','خطوة تهيئة جديدة','New onboarding step',new.title_ar,new.title_en,'onboarding',new.id); return new;
end $$;
create trigger notify_onboarding_assignment after insert on public.onboarding_items for each row execute function public.notify_onboarding_assignment();

create or replace function public.notify_employee_kpi() returns trigger language plpgsql security definer set search_path='' as $$ begin
  insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  values(new.user_id,'kpi_assigned','مؤشر أداء جديد','New KPI',new.title,new.title,'kpi',new.id); return new;
end $$;
create trigger notify_employee_kpi after insert on public.employee_kpis for each row execute function public.notify_employee_kpi();

create or replace function public.notify_company_announcement() returns trigger language plpgsql security definer set search_path='' as $$ begin
  insert into public.notifications(user_id,kind,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  select distinct p.id,'announcement',new.title_ar,new.title_en,new.body_ar,new.body_en,'announcement',new.id
  from public.profiles p join public.account_controls ac on ac.user_id=p.id and ac.status='active'
  where new.audience_role is null or exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role=new.audience_role);
  return new;
end $$;
create trigger notify_company_announcement after insert on public.announcements for each row execute function public.notify_company_announcement();

revoke all on function public.notify_employee_assignment() from public,anon,authenticated;
revoke all on function public.notify_onboarding_assignment() from public,anon,authenticated;
revoke all on function public.notify_employee_kpi() from public,anon,authenticated;
revoke all on function public.notify_company_announcement() from public,anon,authenticated;

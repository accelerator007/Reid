-- Grant approved bootstrap roles to accounts that existed before the role trigger.
insert into public.user_roles(user_id, role, granted_by)
select id, 'owner'::public.app_role, id from public.profiles
where lower(email) = 'alialajmi524@gmail.com'
on conflict do nothing;

insert into public.user_roles(user_id, role)
select id, 'admin'::public.app_role from public.profiles
where lower(email) = 'sheikhaalmamari4@gmail.com'
on conflict do nothing;

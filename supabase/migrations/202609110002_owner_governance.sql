-- Owner governance: Ali and Sheikha are Reid's two designated owners.
-- Retire synthetic QA identities accidentally left active by older suites.

create or replace function public.grant_bootstrap_company_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) in ('alialajmi524@gmail.com', 'sheikhaalmamari4@gmail.com') then
    insert into public.user_roles(user_id, role, granted_by)
    values(new.id, 'owner', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

insert into public.user_roles(user_id, role, granted_by)
select id, 'owner'::public.app_role, id
from public.profiles
where lower(email) in ('alialajmi524@gmail.com', 'sheikhaalmamari4@gmail.com')
on conflict do nothing;

with synthetic_accounts as (
  select id
  from public.profiles
  where lower(email) like 'reid-browser-%@example.com'
     or lower(email) like 'reid-research-%@example.com'
     or lower(email) like 'reid.research.%@example.com'
     or lower(email) like 'reid.qa.%@example.com'
     or lower(email) like 'reid-os-qa-%@reid.test'
     or lower(email) like 'reid.contact.us+reid-qa-%@gmail.com'
)
update public.account_controls controls
set status = 'disabled', reason = 'Retired synthetic QA identity', changed_at = now()
from synthetic_accounts
where controls.user_id = synthetic_accounts.id and controls.status <> 'disabled';

delete from public.user_roles roles
using public.profiles profiles
where roles.user_id = profiles.id
  and (
    lower(profiles.email) like 'reid-browser-%@example.com'
    or lower(profiles.email) like 'reid-research-%@example.com'
    or lower(profiles.email) like 'reid.research.%@example.com'
    or lower(profiles.email) like 'reid.qa.%@example.com'
    or lower(profiles.email) like 'reid-os-qa-%@reid.test'
    or lower(profiles.email) like 'reid.contact.us+reid-qa-%@gmail.com'
  );

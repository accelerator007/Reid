-- Explicit WhatsApp identities for Reid administrators. Conversation bodies
-- stay in the existing QR message ledger; this table stores only the account
-- binding, consent controls and aggregate speaking-style signals.
create table public.whatsapp_admin_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^[1-9][0-9]{7,14}$'),
  enabled boolean not null default true,
  memory_enabled boolean not null default true,
  style_learning_enabled boolean not null default true,
  style_profile jsonb not null default jsonb_build_object(
    'dominant_language','ar','average_message_length',0,'emoji_rate',0,'directness',0,'tone','natural'
  ) check (jsonb_typeof(style_profile)='object'),
  sample_count integer not null default 0 check (sample_count between 0 and 1000000),
  last_learned_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_admin_profiles enable row level security;
revoke all on public.whatsapp_admin_profiles from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_admin_profiles to authenticated;

create policy whatsapp_admin_profiles_owner_manage on public.whatsapp_admin_profiles
for all to authenticated
using (public.has_role('owner') or public.has_role('super_admin'))
with check (
  (public.has_role('owner') or public.has_role('super_admin'))
  and exists (
    select 1 from public.user_roles role
    where role.user_id=whatsapp_admin_profiles.user_id
      and role.role in ('owner','super_admin','admin')
  )
);

create policy whatsapp_admin_profiles_self_read on public.whatsapp_admin_profiles
for select to authenticated using (user_id=auth.uid());

-- Preserve the two Owner mappings already verified for the QR bridge. Future
-- administrators are linked explicitly by an Owner from Connections.
insert into public.whatsapp_admin_profiles(user_id,phone_e164,created_by)
select profile.id,
  case profile.email
    when 'alialajmi524@gmail.com' then '96896709444'
    when 'sheikhaalmamari4@gmail.com' then '96892797586'
  end,
  profile.id
from public.profiles profile
where profile.email in ('alialajmi524@gmail.com','sheikhaalmamari4@gmail.com')
  and exists(select 1 from public.user_roles role where role.user_id=profile.id and role.role='owner')
on conflict do nothing;

create or replace function public.learn_whatsapp_admin_style(
  target_user uuid,
  target_phone text,
  sample_language text,
  sample_length integer,
  sample_has_emoji boolean,
  sample_is_direct boolean
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  profile public.whatsapp_admin_profiles;
  next_count integer;
  alpha numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into profile from public.whatsapp_admin_profiles
  where user_id=target_user and phone_e164=target_phone and enabled and style_learning_enabled
  for update;
  if not found then return; end if;
  next_count := least(profile.sample_count+1,1000000);
  alpha := greatest(0.05,1.0/least(next_count,20));
  update public.whatsapp_admin_profiles set
    sample_count=next_count,
    style_profile=jsonb_build_object(
      'dominant_language',case
        when sample_language='ar' then 'ar'
        when profile.sample_count=0 then 'en'
        else coalesce(profile.style_profile->>'dominant_language','ar') end,
      'average_message_length',round((coalesce((profile.style_profile->>'average_message_length')::numeric,0)*(1-alpha))+(least(greatest(sample_length,1),4000)*alpha),1),
      'emoji_rate',round((coalesce((profile.style_profile->>'emoji_rate')::numeric,0)*(1-alpha))+((case when sample_has_emoji then 1 else 0 end)*alpha),2),
      'directness',round((coalesce((profile.style_profile->>'directness')::numeric,0)*(1-alpha))+((case when sample_is_direct then 1 else 0 end)*alpha),2),
      'tone',case when sample_language='ar' then 'gulf-natural' else 'natural' end
    ),
    last_learned_at=now(),updated_at=now()
  where user_id=profile.user_id;
end
$$;

revoke all on function public.learn_whatsapp_admin_style(uuid,text,text,integer,boolean,boolean) from public, anon, authenticated;
grant execute on function public.learn_whatsapp_admin_style(uuid,text,text,integer,boolean,boolean) to service_role;

create function public.audit_whatsapp_admin_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  snapshot:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),tg_op,tg_table_name,snapshot->>'user_id',jsonb_build_object(
    'enabled',snapshot->>'enabled','memory_enabled',snapshot->>'memory_enabled',
    'style_learning_enabled',snapshot->>'style_learning_enabled','sample_count',snapshot->>'sample_count'
  ));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.audit_whatsapp_admin_profile() from public,anon,authenticated;
create trigger audit_whatsapp_admin_profiles after insert or update or delete on public.whatsapp_admin_profiles
for each row execute function public.audit_whatsapp_admin_profile();

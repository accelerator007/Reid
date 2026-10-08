create table public.content_image_usage (
  usage_day date primary key,
  generations integer not null default 0 check (generations >= 0),
  updated_at timestamptz not null default now()
);

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  prompt text not null,
  platforms text[] not null default '{}',
  aspect_ratio text not null default '1:1',
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','published','archived')),
  active_version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  version integer not null check (version > 0),
  storage_bucket text not null check (storage_bucket in ('content-assets','project-files')),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  width integer,
  height integer,
  prompt text not null,
  model text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (asset_id, version), unique (storage_bucket, storage_path)
);

alter table public.content_image_usage enable row level security;
alter table public.content_assets enable row level security;
alter table public.content_asset_versions enable row level security;

create policy content_assets_admin_read on public.content_assets for select to authenticated
using (public.is_admin() or (project_id is not null and public.is_project_member(project_id)));
create policy content_assets_admin_write on public.content_assets for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy content_asset_versions_read on public.content_asset_versions for select to authenticated
using (exists(select 1 from public.content_assets a where a.id=asset_id and (public.is_admin() or (a.project_id is not null and public.is_project_member(a.project_id)))));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('content-assets','content-assets',false,20971520,array['image/png','image/jpeg','image/webp']) on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy content_assets_storage_read on storage.objects for select to authenticated
using(bucket_id='content-assets' and exists(select 1 from public.content_asset_versions v join public.content_assets a on a.id=v.asset_id where v.storage_path=name and (public.is_admin() or (a.project_id is not null and public.is_project_member(a.project_id)))));

create or replace function public.claim_content_image_budget(wanted integer, daily_limit integer)
returns table(allowed boolean, used integer, remaining integer)
language plpgsql security definer set search_path='' as $$
declare current_used integer;
begin
  if wanted < 1 or wanted > 4 or daily_limit < 1 then raise exception 'invalid_image_budget_request'; end if;
  insert into public.content_image_usage(usage_day,generations) values(current_date,0) on conflict do nothing;
  select generations into current_used from public.content_image_usage where usage_day=current_date for update;
  if current_used + wanted > daily_limit then return query select false,current_used,greatest(daily_limit-current_used,0); return; end if;
  update public.content_image_usage set generations=generations+wanted,updated_at=now() where usage_day=current_date returning generations into current_used;
  return query select true,current_used,greatest(daily_limit-current_used,0);
end $$;
revoke all on function public.claim_content_image_budget(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_content_image_budget(integer,integer) to service_role;

create trigger audit_content_assets after insert or update or delete on public.content_assets for each row execute function public.audit_row();
create trigger audit_content_asset_versions after insert or update or delete on public.content_asset_versions for each row execute function public.audit_row();


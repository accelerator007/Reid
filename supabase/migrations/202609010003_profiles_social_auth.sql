alter table public.profiles
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

alter table public.applications
  add column if not exists linkedin_url text,
  add column if not exists github_url text;

alter table public.profiles
  add constraint profiles_linkedin_url_check check (linkedin_url is null or linkedin_url ~ '^https://(www\.)?linkedin\.com/'),
  add constraint profiles_github_url_check check (github_url is null or github_url ~ '^https://(www\.)?github\.com/');

alter table public.applications
  add constraint applications_linkedin_required check (linkedin_url ~ '^https://(www\.)?linkedin\.com/'),
  add constraint applications_github_url_check check (github_url is null or github_url ~ '^https://(www\.)?github\.com/');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name, email, linkedin_url, github_url, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'linkedin_url', ''),
    nullif(new.raw_user_meta_data->>'github_url', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create policy profile_self_insert on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy profile_self_update on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin() or public.has_role('hr'))
with check (id = auth.uid() or public.is_admin() or public.has_role('hr'));

comment on column public.profiles.linkedin_url is 'Required before a user can access the full workspace; OAuth users complete it after first sign-in.';

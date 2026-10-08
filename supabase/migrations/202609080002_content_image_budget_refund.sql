create or replace function public.release_content_image_budget(wanted integer)
returns integer language plpgsql security definer set search_path='' as $$
declare current_used integer;
begin
  if wanted < 1 or wanted > 4 then raise exception 'invalid_image_budget_release'; end if;
  update public.content_image_usage set generations=greatest(generations-wanted,0),updated_at=now()
  where usage_day=current_date returning generations into current_used;
  return coalesce(current_used,0);
end $$;
revoke all on function public.release_content_image_budget(integer) from public,anon,authenticated;
grant execute on function public.release_content_image_budget(integer) to service_role;


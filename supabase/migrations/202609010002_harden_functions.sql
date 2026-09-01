alter function public.is_admin() set search_path = '';
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

comment on function public.has_role(public.app_role) is
  'SECURITY DEFINER is intentional: authenticated users need a non-recursive role lookup for RLS. PUBLIC and anon execute are revoked.';

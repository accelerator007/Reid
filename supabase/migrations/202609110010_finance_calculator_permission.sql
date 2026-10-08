begin;

-- The finance guard runs under the authenticated caller on hosted Supabase.
-- This immutable helper only validates supplied JSON and returns arithmetic;
-- it reads no table and exposes no company data.
grant execute on function public.finance_line_subtotal(jsonb) to authenticated;

commit;

-- Allow governed tool calls to wait in the existing private approval queue.
alter table public.agent_run_payloads drop constraint if exists agent_run_payloads_action_check;
alter table public.agent_run_payloads add constraint agent_run_payloads_action_check
  check (action in ('run','embed','tool'));

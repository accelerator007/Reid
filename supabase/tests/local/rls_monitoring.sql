\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_monitoring'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

insert into public.service_health_snapshots(id,checked_at,ok,components)
values ('production',now(),true,'{"website":true,"database":true,"whatsapp":true,"aiLap":true,"tts":true,"queues":true}'::jsonb);

select test_sign_out();
select t_visible(:'suite','a visitor cannot read the private heartbeat row','select 1 from public.service_health_snapshots',0);
select t_true(:'suite','the public RPC returns a fresh healthy heartbeat',
  $$select (public.reid_public_health()->>'ok')::boolean$$);
select t_true(:'suite','the public RPC returns exactly the six bounded component flags',
  $$select (select count(*) = 6 from jsonb_object_keys(public.reid_public_health()->'components'))$$);

reset role;
update public.service_health_snapshots set checked_at=now()-interval '11 minutes';
select test_sign_out();
select t_true(:'suite','a stale heartbeat fails closed',
  $$select not (public.reid_public_health()->>'ok')::boolean$$);
select t_true(:'suite','a stale heartbeat exposes no stale healthy flag',
  $$select not exists (select 1 from jsonb_each_text(public.reid_public_health()->'components') where value='true')$$);

select t_finish(:'suite');
rollback;

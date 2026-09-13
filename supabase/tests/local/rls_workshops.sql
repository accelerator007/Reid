\set ON_ERROR_STOP on
begin;
set local search_path = public;

insert into auth.users(id,email) values
  ('71000000-0000-0000-0000-000000000001','workshop-owner@reid.test'),
  ('71000000-0000-0000-0000-000000000002','workshop-employee@reid.test'),
  ('71000000-0000-0000-0000-000000000003','workshop-guest@reid.test'),
  ('71000000-0000-0000-0000-000000000004','workshop-waitlist@reid.test');
insert into public.user_roles(user_id,role) values
  ('71000000-0000-0000-0000-000000000001','owner'),
  ('71000000-0000-0000-0000-000000000002','employee'),
  ('71000000-0000-0000-0000-000000000003','guest'),
  ('71000000-0000-0000-0000-000000000004','employee');

select public.test_sign_in('71000000-0000-0000-0000-000000000001');
insert into public.workshops(id,title_ar,title_en,status,visibility,start_at,end_at,capacity,created_by) values
  ('72000000-0000-0000-0000-000000000001','ورشة عامة','Public workshop','published','public',now()+interval '7 days',now()+interval '7 days 2 hours',1,'71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000002','ورشة داخلية','Internal workshop','published','internal',now()+interval '8 days',now()+interval '8 days 2 hours',10,'71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000003','مسودة','Draft workshop','draft','public',now()+interval '9 days',now()+interval '9 days 2 hours',10,'71000000-0000-0000-0000-000000000001');
select public.t_visible('workshops','Owner sees every workshop','select 1 from public.workshops',3);
select public.t_changed('workshops','Owner can edit a workshop',
  $$update public.workshops set venue_en='Muscat' where id='72000000-0000-0000-0000-000000000003'$$,1);

select public.test_sign_out();
select public.t_visible('workshops','Anonymous visitor sees only published public workshops','select 1 from public.workshops',1);
select public.t_rejected('workshops','Anonymous visitor cannot register',
  $$select * from public.register_for_workshop('72000000-0000-0000-0000-000000000001')$$);

select public.test_sign_in('71000000-0000-0000-0000-000000000003');
select public.t_visible('workshops','Guest cannot see an internal workshop','select 1 from public.workshops',1);
select public.t_rejected('workshops','Guest cannot register for an internal workshop',
  $$select * from public.register_for_workshop('72000000-0000-0000-0000-000000000002')$$,'P0001');

select public.test_sign_in('71000000-0000-0000-0000-000000000002');
select public.t_visible('workshops','Employee sees public and internal published workshops','select 1 from public.workshops',2);
select public.t_changed('workshops','Employee cannot edit workshops',
  $$update public.workshops set venue_en='Forbidden' where id='72000000-0000-0000-0000-000000000001'$$,0);
select public.t_allowed('workshops','Employee can register through the governed function',
  $$select * from public.register_for_workshop('72000000-0000-0000-0000-000000000001')$$);
select public.t_visible('workshops','Employee sees only their own registration','select 1 from public.workshop_registrations',1);
select public.t_true('workshops','First attendee receives the available seat',
  $$select status='registered' from public.workshop_registrations where attendee_id='71000000-0000-0000-0000-000000000002'$$);

select public.test_sign_in('71000000-0000-0000-0000-000000000004');
select public.t_allowed('workshops','Second attendee can join the waitlist',
  $$select * from public.register_for_workshop('72000000-0000-0000-0000-000000000001')$$);
select public.t_true('workshops','Capacity overflow becomes waitlisted',
  $$select status='waitlisted' from public.workshop_registrations where attendee_id='71000000-0000-0000-0000-000000000004'$$);

select public.test_sign_in('71000000-0000-0000-0000-000000000002');
select public.t_allowed('workshops','Registered attendee can cancel',
  $$select public.cancel_workshop_registration('72000000-0000-0000-0000-000000000001')$$);
select public.test_sign_in('71000000-0000-0000-0000-000000000004');
select public.t_true('workshops','Cancellation promotes the oldest waitlisted attendee',
  $$select status='registered' from public.workshop_registrations where attendee_id='71000000-0000-0000-0000-000000000004'$$);

select public.test_sign_out();
set local role postgres;
select public.t_true('workshops','Workshop changes are audited',
  $$select count(*) >= 4 from public.audit_logs where table_name in ('workshops','workshop_registrations')$$);
select public.t_true('workshops','Public agents cannot invoke the internal workshop tool',
  $$select count(*)=0 from public.agent_tool_assignments where agent_id in ('marketing','content') and tool_id='workshops.list'$$);
select public.t_finish('workshops');
rollback;

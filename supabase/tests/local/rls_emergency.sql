\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_emergency'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id    '41111111-1111-4111-8111-111111111111'
\set super_id    '42222222-2222-4222-8222-222222222222'
\set admin_id    '43333333-3333-4333-8333-333333333333'
\set employee_id '44444444-4444-4444-8444-444444444444'

insert into auth.users(id,email) values
  (:'owner_id','assistant-owner@reid.test'),(:'super_id','assistant-super@reid.test'),
  (:'admin_id','assistant-admin@reid.test'),(:'employee_id','assistant-employee@reid.test');
update public.profiles set linkedin_url='https://linkedin.com/in/reid-assistant-test';
insert into public.user_roles(user_id,role) values
  (:'owner_id','owner'),(:'super_id','super_admin'),(:'admin_id','admin'),(:'employee_id','employee');

-- Contacts ------------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_allowed(:'suite','the Owner can put a key person on the alert list',format(
  $$insert into public.emergency_contacts(user_id,display_name,phone_e164,call_enabled) values (%L,'Owner','+96890000001',true)$$,
  :'owner_id'));
select t_allowed(:'suite','the Owner can add an Admin as a contact',format(
  $$insert into public.emergency_contacts(user_id,display_name,phone_e164) values (%L,'Admin','+96890000003')$$, :'admin_id'));
select t_rejected(:'suite','an employee can never be an alert contact',format(
  $$insert into public.emergency_contacts(user_id,display_name,phone_e164) values (%L,'Employee','+96890000004')$$,
  :'employee_id'),'23514');
select t_rejected(:'suite','a phone number must be E.164',format(
  $$insert into public.emergency_contacts(user_id,display_name,phone_e164) values (%L,'Super','96890000002')$$,
  :'super_id'),'23514');
select t_rejected(:'suite','a PIN is stored only as an scrypt hash',format(
  $$update public.emergency_contacts set phone_pin_hash='1234' where user_id=%L$$, :'owner_id'),'23514');

select test_sign_in(:'super_id');
select t_visible(:'suite','a Super Admin can read the alert list','select 1 from public.emergency_contacts',2);
select t_changed(:'suite','a Super Admin cannot change contacts',
  $$update public.emergency_contacts set call_enabled=false$$,0);

select test_sign_in(:'admin_id');
select t_visible(:'suite','an Admin sees only their own contact row','select 1 from public.emergency_contacts',1);
select t_changed(:'suite','an Admin cannot opt themselves into phone calls',
  $$update public.emergency_contacts set call_enabled=true$$,0);

select test_sign_in(:'employee_id');
select t_visible(:'suite','an employee cannot read the alert list','select 1 from public.emergency_contacts',0);

-- Incidents and calls --------------------------------------------------------
select test_sign_in(:'owner_id');
select t_rejected(:'suite','a browser cannot open an incident directly',
  $$insert into public.emergency_incidents(key,severity,source,title_ar,title_en) values ('x','critical','manual','x','x')$$,'42501');
select t_rejected(:'suite','a browser cannot call the open-incident function',
  $$select public.emergency_open_incident('system:website','critical','system','الموقع','Site')$$,'42501');

set local role postgres;
set local role service_role;
select t_true(:'suite','the service opens a new incident',
  $$select (public.emergency_open_incident('system:website','high','system','الموقع بطيء','Site slow')->>'created')::boolean$$);
select t_true(:'suite','a repeated failure updates the live incident instead of opening another',
  $$select not (public.emergency_open_incident('system:website','high','system','الموقع بطيء','Site slow')->>'created')::boolean$$);
select t_true(:'suite','a higher severity raises the live incident and re-arms escalation',
  $$select (public.emergency_open_incident('system:website','critical','system','الموقع متوقف','Site down')->'incident'->>'severity')='critical'$$);
select t_true(:'suite','one live incident per key',
  $$select count(*)=1 and max(occurrences)=3 from public.emergency_incidents where key='system:website'$$);
select t_rejected(:'suite','an acknowledged incident must record when',
  $$update public.emergency_incidents set status='acknowledged', next_action_at=null where key='system:website'$$,'23514');
insert into public.emergency_notifications(incident_id,user_id,channel,status)
  select id, :'owner_id', 'call', 'in_progress' from public.emergency_incidents where key='system:website';
select public.emergency_append_transcript(id,'person','تم') from public.emergency_notifications;
select public.emergency_append_transcript(id,'system','ignored') from public.emergency_notifications;
select t_true(:'suite','transcripts accept only assistant/person turns',
  $$select jsonb_array_length(transcript)=1 from public.emergency_notifications$$);
update public.emergency_incidents set status='resolved', resolved_at=now(), next_action_at=null where key='system:website';
select t_true(:'suite','after resolution the same condition opens a fresh incident',
  $$select (public.emergency_open_incident('system:website','critical','system','الموقع متوقف','Site down')->>'created')::boolean$$);

select test_sign_in(:'owner_id');
select t_visible(:'suite','the Owner reads incidents','select 1 from public.emergency_incidents',2);
select t_visible(:'suite','the Owner reads call records','select 1 from public.emergency_notifications',1);
select t_changed(:'suite','the Owner cannot rewrite an incident from the browser',
  $$update public.emergency_incidents set status='resolved'$$,0);

select test_sign_in(:'super_id');
select t_visible(:'suite','a Super Admin reads incidents','select 1 from public.emergency_incidents',2);

select test_sign_in(:'admin_id');
select t_visible(:'suite','an Admin cannot read incidents','select 1 from public.emergency_incidents',0);
select t_visible(:'suite','an Admin cannot read call transcripts','select 1 from public.emergency_notifications',0);

select test_sign_out();
select t_visible(:'suite','an anonymous visitor sees no contacts','select 1 from public.emergency_contacts',0);
select t_visible(:'suite','an anonymous visitor sees no incidents','select 1 from public.emergency_incidents',0);

\o
select label,case when ok then 'PASS' else 'FAIL' end as result,detail
from public.test_results where suite=:'suite' order by id;
select t_finish(:'suite');
rollback;

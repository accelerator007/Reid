\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_agent_rooms'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id    '11111111-1111-4111-8111-111111111111'
\set admin_id    '22222222-2222-4222-8222-222222222222'
\set employee_id '33333333-3333-4333-8333-333333333333'
\set owner_room  'aaaaaaaa-1111-4111-8111-111111111111'
\set admin_room  'aaaaaaaa-2222-4222-8222-222222222222'
\set admin_msg   'aaaaaaaa-3333-4333-8333-333333333333'
\set run_id      'bbbbbbbb-1111-4111-8111-111111111111'

insert into auth.users(id,email) values
  (:'owner_id','room-owner@reid.test'),(:'admin_id','room-admin@reid.test'),(:'employee_id','room-employee@reid.test');
update public.profiles set linkedin_url='https://linkedin.com/in/reid-room-test';
insert into public.user_roles(user_id,role) values
  (:'owner_id','owner'),(:'admin_id','admin'),(:'employee_id','employee');

select test_sign_in(:'owner_id');
select t_allowed(:'suite','an Owner can create their private agent room',format(
  $$insert into public.agent_rooms(id,name,created_by) values (%L,'Owner room',%L)$$, :'owner_room', :'owner_id'));
select t_allowed(:'suite','the Owner can write their own human message',format(
  $$insert into public.agent_room_messages(room_id,sender_kind,sender_user_id,body,mentions) values (%L,'user',%L,'@operations review delivery',array['operations'])$$, :'owner_room', :'owner_id'));
select t_rejected(:'suite','a browser cannot forge an agent reply',format(
  $$insert into public.agent_room_messages(room_id,sender_kind,sender_agent_id,body,state,run_id) values (%L,'agent','operations','forged','completed',gen_random_uuid())$$, :'owner_room'),'42501');

set local role postgres;
insert into public.agent_runs(id,agent_id,provider_id,requested_by,classification,status,run_state)
values (:'run_id','operations','ollama',:'owner_id','internal','succeeded','succeeded');
insert into public.agent_room_messages(room_id,sender_kind,sender_agent_id,body,state,run_id)
values (:'owner_room','agent','operations','verified agent reply','completed',:'run_id');
insert into public.agent_rooms(id,name,created_by) values (:'admin_room','Admin room',:'admin_id');
insert into public.agent_room_messages(id,room_id,sender_kind,sender_user_id,body)
values (:'admin_msg',:'admin_room','user',:'admin_id','private admin message');

select test_sign_in(:'owner_id');
select t_rejected(:'suite','a reply cannot cross between private rooms',format(
  $$insert into public.agent_room_messages(room_id,sender_kind,sender_user_id,body,reply_to) values (%L,'user',%L,'cross-room reply',%L)$$,
  :'owner_room', :'owner_id', :'admin_msg'),'23514');

select test_sign_in(:'admin_id');
select t_visible(:'suite','another administrator cannot read the Owner room',format(
  $$select 1 from public.agent_rooms where id=%L$$, :'owner_room'),0);
select t_visible(:'suite','another administrator cannot read the Owner messages',format(
  $$select 1 from public.agent_room_messages where room_id=%L$$, :'owner_room'),0);

select test_sign_in(:'employee_id');
select t_rejected(:'suite','an employee cannot create an agent room',format(
  $$insert into public.agent_rooms(name,created_by) values ('Employee room',%L)$$, :'employee_id'),'42501');
select t_visible(:'suite','an employee cannot read agent-room messages','select 1 from public.agent_room_messages',0);

select test_sign_out();
select t_visible(:'suite','an anonymous visitor sees no agent rooms','select 1 from public.agent_rooms',0);
select t_visible(:'suite','an anonymous visitor sees no agent-room messages','select 1 from public.agent_room_messages',0);

set local role postgres;
select t_visible(:'suite','agent-room messages publish to Realtime',
  $q$select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_room_messages'$q$,1);

\o
select label,case when ok then 'PASS' else 'FAIL' end as result,detail
from public.test_results where suite=:'suite' order by id;
select t_finish(:'suite');
rollback;

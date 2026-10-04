\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_meetings'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id  '91111111-1111-4111-8111-111111111111'
\set admin_id  '92222222-2222-4222-8222-222222222222'
\set owner_meeting '93333333-3333-4333-8333-333333333333'
\set admin_meeting '94444444-4444-4444-8444-444444444444'

insert into auth.users(id,email) values
  (:'owner_id','meeting-owner@reid.test'),(:'admin_id','meeting-admin@reid.test');
insert into public.user_roles(user_id,role) values
  (:'owner_id','owner'),(:'admin_id','admin');

set local role postgres;
insert into public.meeting_connections(owner_id,google_email,google_refresh_token)
values (:'owner_id','owner@reid.test',repeat('x',64));
insert into public.reid_meetings(id,owner_id,status,meeting_url)
values
  (:'owner_meeting',:'owner_id','active','https://meet.google.com/abc-defg-hij'),
  (:'admin_meeting',:'admin_id','ended','https://meet.google.com/xyz-abcd-efg');
insert into public.reid_meeting_turns(meeting_id,owner_id,role,body)
values
  (:'owner_meeting',:'owner_id','user','owner private turn'),
  (:'admin_meeting',:'admin_id','assistant','admin private turn');

select test_sign_in(:'owner_id');
select t_visible(:'suite','the Owner reads their own meeting',format(
  $$select 1 from public.reid_meetings where id=%L$$, :'owner_meeting'),1);
select t_visible(:'suite','the Owner cannot read another administrator meeting',format(
  $$select 1 from public.reid_meetings where id=%L$$, :'admin_meeting'),0);
select t_visible(:'suite','the Owner reads their own meeting turns',format(
  $$select 1 from public.reid_meeting_turns where meeting_id=%L$$, :'owner_meeting'),1);
select t_visible(:'suite','the Owner cannot read another administrator turns',format(
  $$select 1 from public.reid_meeting_turns where meeting_id=%L$$, :'admin_meeting'),0);
select t_visible(:'suite','OAuth refresh tokens are never browser-readable',
  'select 1 from public.meeting_connections',0);
select t_rejected(:'suite','a browser cannot create meetings',format(
  $$insert into public.reid_meetings(owner_id,status) values (%L,'creating')$$, :'owner_id'),'42501');
select t_changed(:'suite','a browser cannot update meeting state',format(
  $$update public.reid_meetings set status='ended' where id=%L$$, :'owner_meeting'),0);
select t_changed(:'suite','a browser cannot delete meetings',format(
  $$delete from public.reid_meetings where id=%L$$, :'owner_meeting'),0);
select t_rejected(:'suite','a browser cannot forge voice turns',format(
  $$insert into public.reid_meeting_turns(meeting_id,owner_id,role,body) values (%L,%L,'assistant','forged')$$,
  :'owner_meeting', :'owner_id'),'42501');
select t_changed(:'suite','a browser cannot update voice history',format(
  $$update public.reid_meeting_turns set body='changed' where meeting_id=%L$$, :'owner_meeting'),0);
select t_changed(:'suite','a browser cannot delete voice history',format(
  $$delete from public.reid_meeting_turns where meeting_id=%L$$, :'owner_meeting'),0);

select test_sign_in(:'admin_id');
select t_visible(:'suite','another administrator cannot read the Owner meeting',format(
  $$select 1 from public.reid_meetings where id=%L$$, :'owner_meeting'),0);
select t_visible(:'suite','another administrator cannot read the Owner voice history',format(
  $$select 1 from public.reid_meeting_turns where meeting_id=%L$$, :'owner_meeting'),0);

select test_sign_out();
select t_visible(:'suite','an anonymous visitor sees no meetings','select 1 from public.reid_meetings',0);
select t_visible(:'suite','an anonymous visitor sees no voice history','select 1 from public.reid_meeting_turns',0);
select t_visible(:'suite','an anonymous visitor sees no OAuth connections','select 1 from public.meeting_connections',0);

\o
select label,case when ok then 'PASS' else 'FAIL' end as result,detail
from public.test_results where suite=:'suite' order by id;
select t_finish(:'suite');
rollback;

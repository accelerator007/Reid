\set ON_ERROR_STOP on
begin;
set local search_path = public;

insert into auth.users(id,email) values
  ('81000000-0000-0000-0000-000000000001','assistant-owner@reid.test'),
  ('81000000-0000-0000-0000-000000000002','assistant-employee@reid.test'),
  ('81000000-0000-0000-0000-000000000003','assistant-other@reid.test'),
  ('81000000-0000-0000-0000-000000000004','assistant-guest@reid.test');
insert into public.user_roles(user_id,role) values
  ('81000000-0000-0000-0000-000000000001','owner'),
  ('81000000-0000-0000-0000-000000000002','employee'),
  ('81000000-0000-0000-0000-000000000003','employee'),
  ('81000000-0000-0000-0000-000000000004','guest');

select public.test_sign_in('81000000-0000-0000-0000-000000000001');
select public.t_allowed('whatsapp_assistants','Owner can link a company employee',
  $$insert into public.whatsapp_admin_profiles(user_id,phone_e164,created_by,outbound_scope)
    values('81000000-0000-0000-0000-000000000002','96891000002','81000000-0000-0000-0000-000000000001','company')$$);
select public.t_rejected('whatsapp_assistants','Owner cannot link a guest as an internal assistant',
  $$insert into public.whatsapp_admin_profiles(user_id,phone_e164,created_by)
    values('81000000-0000-0000-0000-000000000004','96891000004','81000000-0000-0000-0000-000000000001')$$,'42501');

set local role postgres;
insert into public.whatsapp_actions(id,requester_id,requester_phone,kind,preview,status)
values
  ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','96891000002','send_text','private employee action','completed'),
  ('82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003','96891000003','send_text','other employee action','completed');
insert into public.assistant_notes(id,owner_id,title,body) values
  ('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','private','employee secret note'),
  ('83000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003','other','other secret note');

select public.test_sign_in('81000000-0000-0000-0000-000000000002');
select public.t_visible('whatsapp_assistants','Employee sees only their own assistant action',
  'select 1 from public.whatsapp_actions',1);
select public.t_visible('whatsapp_assistants','Employee sees only their own private note',
  'select 1 from public.assistant_notes',1);
select public.t_changed('whatsapp_assistants','Employee cannot change their outbound permission',
  $$update public.whatsapp_admin_profiles set outbound_scope='any' where user_id='81000000-0000-0000-0000-000000000002'$$,0);
select public.t_allowed('whatsapp_assistants','Employee can create their own private note',
  $$insert into public.assistant_notes(owner_id,title,body) values('81000000-0000-0000-0000-000000000002','mine','my note')$$);
select public.t_rejected('whatsapp_assistants','Employee cannot create a note for another employee',
  $$insert into public.assistant_notes(owner_id,title,body) values('81000000-0000-0000-0000-000000000003','forbidden','not mine')$$,'42501');

select public.test_sign_in('81000000-0000-0000-0000-000000000001');
select public.t_visible('whatsapp_assistants','Owner sees company action receipts',
  'select 1 from public.whatsapp_actions',2);
select public.t_visible('whatsapp_assistants','Owner cannot read employee private notes',
  'select 1 from public.assistant_notes',0);
select public.t_changed('whatsapp_assistants','Owner can grant any-number sending',
  $$update public.whatsapp_admin_profiles set outbound_scope='any' where user_id='81000000-0000-0000-0000-000000000002'$$,1);
select public.t_true('whatsapp_assistants','Assistant mutations keep a privacy-safe audit trail',
  $$select count(*)>=4 and bool_and(not (new_data ? 'body')) from public.audit_logs where table_name in ('whatsapp_actions','assistant_notes')$$);

select public.t_finish('whatsapp_assistants');
rollback;

\set ON_ERROR_STOP on
begin;
set local search_path = public;

insert into auth.users(id,email) values
  ('70000000-0000-0000-0000-000000000001','whatsapp-owner@reid.test'),
  ('70000000-0000-0000-0000-000000000002','whatsapp-admin@reid.test');
insert into public.user_roles(user_id,role) values
  ('70000000-0000-0000-0000-000000000001','owner'),
  ('70000000-0000-0000-0000-000000000002','admin');

select public.test_sign_out();
set local role postgres;
insert into public.whatsapp_events(event_id,sender_phone,message_type,payload)
values ('wamid.test','96800000000','text','{}');
insert into public.whatsapp_commands(sender_phone,message_id,command_text)
values ('96800000000','wamid.test','اعرض حالة المشاريع');
insert into public.whatsapp_conversations(sender_phone,display_name) values ('96800000000','Owner test');
insert into public.whatsapp_messages(conversation_id,meta_message_id,direction,body)
select id,'wamid.inbox.test','inbound','مساعدة' from public.whatsapp_conversations where sender_phone='96800000000';

select public.test_sign_in('70000000-0000-0000-0000-000000000001');
select public.t_visible('whatsapp','Owner reads inbound events','select 1 from public.whatsapp_events',1);
select public.t_visible('whatsapp','Owner reads command queue','select 1 from public.whatsapp_commands',1);
select public.t_visible('whatsapp','Owner reads inbox conversations','select 1 from public.whatsapp_conversations',1);
select public.t_visible('whatsapp','Owner reads inbox messages','select 1 from public.whatsapp_messages',1);
insert into public.whatsapp_admin_profiles(user_id,phone_e164,created_by) values
  ('70000000-0000-0000-0000-000000000001','96890000001','70000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002','96890000002','70000000-0000-0000-0000-000000000001');
select public.t_visible('whatsapp','Owner manages every linked administrator','select 1 from public.whatsapp_admin_profiles',2);
insert into public.whatsapp_qr_groups(jid,display_name,created_by) values
  ('120363000000001@g.us','Reid_Owner','70000000-0000-0000-0000-000000000001');
select public.t_visible('whatsapp','Owner reads the exact QR group allow-list','select 1 from public.whatsapp_qr_groups',1);

select public.test_sign_in('70000000-0000-0000-0000-000000000002');
select public.t_visible('whatsapp','Admin cannot read owner WhatsApp events','select 1 from public.whatsapp_events',0);
select public.t_visible('whatsapp','Admin cannot read owner command queue','select 1 from public.whatsapp_commands',0);
select public.t_visible('whatsapp','Admin cannot read owner inbox','select 1 from public.whatsapp_conversations',0);
select public.t_visible('whatsapp','Admin cannot read owner messages','select 1 from public.whatsapp_messages',0);
select public.t_rejected('whatsapp','Admin cannot inject a WhatsApp command',
  $$insert into public.whatsapp_commands(sender_phone,message_id,command_text) values ('x','fake','forbidden')$$);
select public.t_visible('whatsapp','Admin reads only their own WhatsApp identity','select 1 from public.whatsapp_admin_profiles',1);
select public.t_changed('whatsapp','Admin cannot change their own WhatsApp authority',
  $$update public.whatsapp_admin_profiles set enabled=false where user_id='70000000-0000-0000-0000-000000000002'$$,0);
select public.t_visible('whatsapp','Admin cannot enumerate Owner QR groups','select 1 from public.whatsapp_qr_groups',0);
select public.t_changed('whatsapp','Admin cannot enable an Owner QR group',
  $$update public.whatsapp_qr_groups set enabled=false where jid='120363000000001@g.us'$$,0);

select public.test_sign_out();
select public.t_visible('whatsapp','Anonymous user sees no WhatsApp events','select 1 from public.whatsapp_events',0);
select public.t_visible('whatsapp','Anonymous user sees no WhatsApp commands','select 1 from public.whatsapp_commands',0);
select public.t_visible('whatsapp','Anonymous user sees no WhatsApp inbox','select 1 from public.whatsapp_conversations',0);
select public.t_visible('whatsapp','Anonymous user sees no WhatsApp messages','select 1 from public.whatsapp_messages',0);
select public.t_visible('whatsapp','Anonymous user sees no administrator bindings','select 1 from public.whatsapp_admin_profiles',0);
select public.t_visible('whatsapp','Anonymous user sees no Owner QR groups','select 1 from public.whatsapp_qr_groups',0);

set local role postgres;
select public.t_true('whatsapp','WhatsApp commands are audited',
  $$select count(*) >= 1 from public.audit_logs where table_name='whatsapp_commands'$$);
select public.t_finish('whatsapp');
rollback;

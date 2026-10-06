\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_whatsapp_documents'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id '67111111-1111-4111-8111-111111111111'
\set employee_id '67222222-2222-4222-8222-222222222222'
\set chat_id '67333333-3333-4333-8333-333333333333'

insert into auth.users(id,email) values
  (:'owner_id','whatsapp-doc-owner@reid.test'),
  (:'employee_id','whatsapp-doc-employee@reid.test');
insert into public.user_roles(user_id,role) values
  (:'owner_id','owner'),(:'employee_id','employee');
insert into public.qr_conversations(id,jid,display_name) values
  (:'chat_id','96890000001@s.whatsapp.net','Document test');
insert into public.qr_conversation_documents(conversation_id,message_id,file_name,byte_size,extracted_text)
values (:'chat_id','document-message','brief.pdf',120,'private text');

select test_sign_in(:'owner_id');
select t_visible(:'suite','the owner can read extracted WhatsApp documents','select 1 from public.qr_conversation_documents',1);
select t_rejected(:'suite','the owner cannot write extracted documents',format($$insert into public.qr_conversation_documents(conversation_id,message_id,file_name,byte_size,extracted_text) values (%L,'forged','x.pdf',1,'x')$$,:'chat_id'));

select test_sign_in(:'employee_id');
select t_visible(:'suite','an employee cannot read WhatsApp documents','select 1 from public.qr_conversation_documents',0);
select test_sign_out();
select t_visible(:'suite','a visitor cannot read WhatsApp documents','select 1 from public.qr_conversation_documents',0);

select t_finish(:'suite');
rollback;

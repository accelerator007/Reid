-- Allow/deny suite for everything the assistant rebuild added: the learning
-- signals, the initiative log and the web-access quota. Every one of these is
-- either personal data or an outbound-cost counter, so none of them may be
-- readable by an ordinary employee and none of the service functions may be
-- callable from a browser session.
\set ON_ERROR_STOP on
begin;
set local search_path = public;

insert into auth.users(id,email) values
  ('84000000-0000-0000-0000-000000000001','learning-owner@reid.test'),
  ('84000000-0000-0000-0000-000000000002','learning-employee@reid.test'),
  ('84000000-0000-0000-0000-000000000003','learning-other@reid.test');
insert into public.user_roles(user_id,role) values
  ('84000000-0000-0000-0000-000000000001','owner'),
  ('84000000-0000-0000-0000-000000000002','employee'),
  ('84000000-0000-0000-0000-000000000003','employee');

set local role postgres;
insert into public.qr_conversations(id,jid,display_name,bot_mode)
values ('85000000-0000-0000-0000-000000000001','96891000002@s.whatsapp.net','employee','active');
insert into public.qr_messages(conversation_id,message_id,direction,body,quality_score,quality_flags)
values ('85000000-0000-0000-0000-000000000001','m-out-1','outbound','reply under contract',92,'{}');
insert into public.assistant_feedback(conversation_id,message_id,sender_phone,signal,detail)
values ('85000000-0000-0000-0000-000000000001','m-out-1','96891000002','negative','wrong workshop');
insert into public.assistant_nudges(owner_id,kind,subject_day,body) values
  ('84000000-0000-0000-0000-000000000002','morning_brief',current_date,'employee brief'),
  ('84000000-0000-0000-0000-000000000003','morning_brief',current_date,'other brief');
insert into public.web_search_usage(usage_day,request_count) values (current_date,3)
  on conflict (usage_day) do update set request_count=3;

-- ------------------------------------------------------------- message counter
select public.t_true('assistant_learning','Inserting a message keeps the conversation counter exact',
  $$select message_count = 1 from public.qr_conversations where id='85000000-0000-0000-0000-000000000001'$$);
select public.t_true('assistant_learning','A conversation starts with a neutral mood and no familiarity',
  $$select mood='محايد' and rapport=0 and summary='' and recent_openers='{}'
      from public.qr_conversations where id='85000000-0000-0000-0000-000000000001'$$);
select public.t_rejected('assistant_learning','A mood outside the known set is refused',
  $$update public.qr_conversations set mood='ecstatic' where id='85000000-0000-0000-0000-000000000001'$$,'23514');
select public.t_rejected('assistant_learning','A quality score outside 0-100 is refused',
  $$update public.qr_messages set quality_score=250 where message_id='m-out-1'$$,'23514');

-- ------------------------------------------------------------------ feedback
select public.test_sign_in('84000000-0000-0000-0000-000000000002');
select public.t_visible('assistant_learning','An employee cannot read assistant feedback',
  'select 1 from public.assistant_feedback',0);
select public.t_visible('assistant_learning','An employee reads only their own nudges',
  'select 1 from public.assistant_nudges',1);
select public.t_visible('assistant_learning','An employee cannot read the web search counter',
  'select 1 from public.web_search_usage',0);
select public.t_rejected('assistant_learning','An employee cannot write feedback directly',
  $$insert into public.assistant_feedback(conversation_id,message_id,sender_phone,signal)
    values('85000000-0000-0000-0000-000000000001','m-out-2','96891000002','positive')$$,'42501');
select public.t_rejected('assistant_learning','An employee cannot manufacture a nudge',
  $$insert into public.assistant_nudges(owner_id,kind,subject_day,body)
    values('84000000-0000-0000-0000-000000000002','morning_brief',current_date+1,'forged')$$,'42501');

-- --------------------------------------------------------- service-only functions
select public.t_rejected('assistant_learning','An employee cannot search another scope of memories',
  $$select public.match_memories('[0,0,0]','user','84000000-0000-0000-0000-000000000003',5)$$,'42501');
select public.t_rejected('assistant_learning','An employee cannot spend the web search quota',
  $$select public.consume_web_search_quota(60)$$,'42501');
select public.t_rejected('assistant_learning','An employee cannot refund the web search quota',
  $$select public.release_web_search_quota()$$,'42501');
select public.t_rejected('assistant_learning','An employee cannot drive the conversation counter',
  $$select public.bump_qr_conversation_messages()$$,'42501');

-- --------------------------------------------------------------------- owner
select public.test_sign_in('84000000-0000-0000-0000-000000000001');
select public.t_visible('assistant_learning','An Owner reviews every feedback signal',
  'select 1 from public.assistant_feedback',1);
select public.t_visible('assistant_learning','An Owner reviews every message the assistant started',
  'select 1 from public.assistant_nudges',2);
select public.t_visible('assistant_learning','An Owner reviews the web search spend',
  'select 1 from public.web_search_usage',1);
select public.t_true('assistant_learning','Initiative stays opt-in for every linked account',
  $$select coalesce(bool_and(not proactive_enabled), true) from public.whatsapp_admin_profiles$$);
-- The tool catalogue is Owner-visible only, so these run inside the Owner
-- session; asserted while signed out they would pass on an empty result.
select public.t_true('assistant_learning','Both web tools are read-only and need no approval',
  $$select count(*)=2 from public.agent_tools
     where id in ('web.search','web.read') and operation='read' and approval_level=0 and enabled$$);
select public.t_true('assistant_learning','Every enabled specialist receives both governed web tools',
  $$select not exists(
      select a.id
        from public.agents a
       where a.enabled and a.id <> 'finance'
         and (select count(*) from public.agent_tool_assignments x
               where x.agent_id=a.id and x.tool_id in ('web.search','web.read')) <> 2)
     and not exists(
      select 1 from public.agent_tool_assignments x
       where x.tool_id in ('web.search','web.read') and x.agent_id='finance')$$);

-- ----------------------------------------------------------------- anonymous
select public.test_sign_out();
select public.t_visible('assistant_learning','An anonymous visitor sees no feedback',
  'select 1 from public.assistant_feedback',0);
select public.t_visible('assistant_learning','An anonymous visitor sees no nudges',
  'select 1 from public.assistant_nudges',0);
select public.t_visible('assistant_learning','An anonymous visitor sees no web search counter',
  'select 1 from public.web_search_usage',0);


select public.t_finish('assistant_learning');
rollback;

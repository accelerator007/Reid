\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('74000000-0000-0000-0000-000000000001','journey-owner@reid.test'),
 ('74000000-0000-0000-0000-000000000002','journey-worker@reid.test');
insert into public.user_roles(user_id,role) values
 ('74000000-0000-0000-0000-000000000001','owner'),
 ('74000000-0000-0000-0000-000000000002','employee');
insert into public.qr_conversations(id,jid,display_name) values
 ('74000000-0000-0000-0000-000000000003','96890001122@s.whatsapp.net','Test customer'),
 ('74000000-0000-0000-0000-000000000004','120000001@g.us','Test group');
select public.test_sign_in('74000000-0000-0000-0000-000000000001');
select public.save_customer_journey('74000000-0000-0000-0000-000000000003','Follow up',now()-interval '1 day','74000000-0000-0000-0000-000000000002',null,null,'Customer project');
select public.save_customer_journey('74000000-0000-0000-0000-000000000003','Follow up',now()-interval '1 day','74000000-0000-0000-0000-000000000002',null,null,'Customer project');
select public.t_visible('journeys','Retry keeps one journey','select 1 from public.customer_journeys',1);
select public.t_visible('journeys','Retry keeps one task',$$select 1 from public.tasks where title='Follow up'$$,1);
select public.t_visible('journeys','Retry keeps one project',$$select 1 from public.projects where name='Customer project'$$,1);
select public.t_visible('journeys','Task appears in owner actions',$$select 1 from public.owner_action_items() where kind='task' and title='Follow up'$$,1);
select public.t_rejected('journeys','Groups cannot become customers',$$select public.save_customer_journey('74000000-0000-0000-0000-000000000004','No',now(),'74000000-0000-0000-0000-000000000002')$$,'P0001');
select public.t_rejected('journeys','Direct browser writes denied',$$insert into public.customer_journeys select * from public.customer_journeys$$);
select public.test_sign_in('74000000-0000-0000-0000-000000000002');
select public.t_visible('journeys','Employee cannot see customer chat links','select 1 from public.customer_journeys',0);
select public.t_rejected('journeys','Employee cannot create journey',$$select public.save_customer_journey('74000000-0000-0000-0000-000000000003','No',now(),'74000000-0000-0000-0000-000000000002')$$,'P0001');
select public.t_rejected('journeys','Employee cannot read owner action feed','select * from public.owner_action_items()','P0001');
select public.t_visible('journeys','Assignee gets task notification',$$select 1 from public.notifications where kind='task_assigned' and body_en='Follow up'$$,1);
select public.t_changed('journeys','Assignee can complete linked task',$$update public.tasks set status='done' where title='Follow up'$$,1);
select public.test_sign_in('74000000-0000-0000-0000-000000000001');
select public.t_visible('journeys','Completing task closes linked request',$$select 1 from public.work_records where title='Follow up' and status='done'$$,1);
select public.t_visible('journeys','Completing task clears CRM follow-up',$$select 1 from public.crm_leads where title='Follow up' and next_follow_up_at is null$$,1);
select public.t_visible('journeys','Completed task leaves action feed',$$select 1 from public.owner_action_items() where title='Follow up'$$,0);
select public.t_changed('journeys','Owner reopens request for review',$$update public.work_records set status='review' where title='Follow up'$$,1);
select public.t_visible('journeys','Request review reopens task',$$select 1 from public.tasks where title='Follow up' and status='in_progress'$$,1);
select public.t_visible('journeys','Review is retained by both-direction synchronization',$$select 1 from public.work_records where title='Follow up' and status='review'$$,1);
select public.t_changed('journeys','Closing request also closes task',$$update public.work_records set status='done' where title='Follow up'$$,1);
select public.t_visible('journeys','Task closes with its request',$$select 1 from public.tasks where title='Follow up' and status='done'$$,1);
select public.test_sign_out();
select public.t_rejected('journeys','Anonymous cannot call journey RPC',$$select public.save_customer_journey('74000000-0000-0000-0000-000000000003','No',now(),'74000000-0000-0000-0000-000000000002')$$);
select public.test_sign_in('74000000-0000-0000-0000-000000000001');
set local role postgres;
select public.t_finish('journeys');
rollback;

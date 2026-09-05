\set ON_ERROR_STOP on
begin;
set local search_path = public;

-- Stable identities for the complete CRM permission matrix.
insert into auth.users(id,email) values
  ('10000000-0000-0000-0000-000000000001','crm-admin@reid.test'),
  ('10000000-0000-0000-0000-000000000002','crm-hr@reid.test'),
  ('10000000-0000-0000-0000-000000000003','crm-sales@reid.test'),
  ('10000000-0000-0000-0000-000000000004','crm-employee@reid.test');
insert into public.user_roles(user_id,role) values
  ('10000000-0000-0000-0000-000000000001','admin'),
  ('10000000-0000-0000-0000-000000000002','hr'),
  ('10000000-0000-0000-0000-000000000003','sales'),
  ('10000000-0000-0000-0000-000000000004','employee');

select public.test_sign_in('10000000-0000-0000-0000-000000000003');
select public.t_allowed('crm','Sales creates company', $$insert into public.crm_companies(id,name,owner_id) values ('20000000-0000-0000-0000-000000000001','Reid Client','10000000-0000-0000-0000-000000000003')$$);
select public.t_allowed('crm','Sales creates contact', $$insert into public.crm_contacts(id,name,company_id,owner_id) values ('20000000-0000-0000-0000-000000000002','Client Contact','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003')$$);
select public.t_allowed('crm','Sales creates lead', $$insert into public.crm_leads(id,title,company_id,contact_id,owner_id) values ('20000000-0000-0000-0000-000000000003','Website rebuild','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003')$$);
select public.t_allowed('crm','Sales creates deal', $$insert into public.crm_deals(id,title,company_id,contact_id,lead_id,owner_id,value) values ('20000000-0000-0000-0000-000000000004','Platform deal','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003',12000)$$);
select public.t_allowed('crm','Sales creates follow-up', $$insert into public.crm_activities(subject,activity_type,deal_id,owner_id) values ('Follow up','call','20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003')$$);
select public.t_visible('crm','Sales reads pipeline', 'select * from public.crm_deals', 1);
select public.t_visible('crm','Sales cannot read executive reports', 'select * from public.executive_reports', 0);

select public.test_sign_in('10000000-0000-0000-0000-000000000002');
select public.t_visible('crm','HR reads clients', 'select * from public.crm_companies', 1);
select public.t_true('crm','HR generates daily report', $$select (public.generate_executive_report('daily',current_date)).period = 'daily'$$);

select public.test_sign_in('10000000-0000-0000-0000-000000000004');
select public.t_visible('crm','Employee cannot read companies', 'select * from public.crm_companies', 0);
select public.t_rejected('crm','Employee cannot create lead', $$insert into public.crm_leads(title) values ('Forbidden')$$);
select public.t_rejected('crm','Employee cannot generate report', $$select public.generate_executive_report('daily',current_date)$$, 'P0001');

select public.test_sign_in('10000000-0000-0000-0000-000000000001');
select public.t_visible('crm','Admin reads reports', 'select * from public.executive_reports', 1);
select public.t_changed('crm','Admin advances deal', $$update public.crm_deals set stage='won',closed_at=now() where id='20000000-0000-0000-0000-000000000004'$$, 1);
select public.t_true('crm','CRM writes are audited', $$select count(*) >= 5 from public.audit_logs where table_name like 'crm_%'$$);

select public.t_finish('crm');
rollback;

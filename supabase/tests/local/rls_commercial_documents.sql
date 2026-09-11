\set ON_ERROR_STOP on
begin;
set local search_path=public;

insert into auth.users(id,email) values
  ('71000000-0000-0000-0000-000000000001','commercial-owner@reid.test'),
  ('71000000-0000-0000-0000-000000000002','commercial-admin@reid.test'),
  ('71000000-0000-0000-0000-000000000003','commercial-sales@reid.test'),
  ('71000000-0000-0000-0000-000000000004','commercial-employee@reid.test');
insert into public.user_roles(user_id,role) values
  ('71000000-0000-0000-0000-000000000001','owner'),
  ('71000000-0000-0000-0000-000000000002','admin'),
  ('71000000-0000-0000-0000-000000000003','sales'),
  ('71000000-0000-0000-0000-000000000004','employee');

select public.test_sign_in('71000000-0000-0000-0000-000000000003');
select public.t_visible('commercial_documents','Sales cannot read private company legal and bank details','select * from public.company_profile',0);
select public.t_rejected('commercial_documents','Sales cannot create standalone finance documents',
  $$select public.create_finance_draft('quote','Unauthorized','Client','OMR','[{"description":"Service","quantity":1,"unit_price":10}]',0,0,null,null,'')$$,'P0001');
insert into public.crm_companies(id,name,email,phone,address,owner_id)
values('72000000-0000-0000-0000-000000000001','Commercial Client','client@example.test','+96890000000','Muscat','71000000-0000-0000-0000-000000000003');
insert into public.crm_deals(id,title,company_id,owner_id,value,currency)
values('72000000-0000-0000-0000-000000000002','Commercial engagement','72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003',250,'OMR');
select public.create_business_case_from_deal('72000000-0000-0000-0000-000000000002');
select public.t_allowed('commercial_documents','Sales issues a detailed business quote',
  $$select public.issue_business_quote(
    (select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'),
    '[{"description":"Discovery","quantity":2,"unit_price":100},{"description":"Delivery","quantity":1,"unit_price":50}]',10,5,current_date+14,'Customer reviewed scope'
  )$$);
select public.t_true('commercial_documents','Sales sees the database-calculated quote value on the case',
  $$select stage='quoted' and value=252 from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'$$);

select public.test_sign_in('71000000-0000-0000-0000-000000000002');
select public.advance_business_case((select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'),'contracted','Management approved quote');
select public.advance_business_case((select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'),'delivery','Start delivery');
select public.t_true('commercial_documents','Project kickoff creates a milestone and owned task',
  $$select exists(select 1 from public.project_milestones m where m.project_id=c.project_id and m.title like '%Project kickoff%') and
    exists(select 1 from public.tasks t where t.project_id=c.project_id and t.assignee_id='71000000-0000-0000-0000-000000000002')
    from public.business_cases c where c.deal_id='72000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('commercial_documents','Admin cannot issue the invoice',
  $$select public.issue_business_invoice((select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'),current_date+30,'Unauthorized invoice')$$,'P0001');

select public.test_sign_in('71000000-0000-0000-0000-000000000001');
select public.t_visible('commercial_documents','Owner reads the company document identity','select * from public.company_profile',1);
select public.t_true('commercial_documents','Quote totals, customer snapshot and immutable issue snapshot are exact',
  $$select d.subtotal=250 and d.discount_amount=10 and d.tax_amount=12 and d.amount=252 and
    jsonb_array_length(d.line_items)=2 and d.counterparty_snapshot->>'email'='client@example.test' and
    d.document_snapshot->>'amount'='252.000' and d.issued_at is not null
    from public.business_cases c join public.finance_documents d on d.id=c.quote_id
    where c.deal_id='72000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('commercial_documents','An issued quote line item cannot be rewritten',
  $$update public.finance_documents set line_items='[{"description":"Changed","quantity":1,"unit_price":1}]'
    where business_case_id=(select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002') and kind='quote'$$,'P0001');
select public.t_changed('commercial_documents','Owner updates document identity without exposing its values to general audit',
  $$update public.company_profile set legal_name_en='Reid Professional Services',cr_number='TEST-CR',updated_by=auth.uid(),updated_at=now() where id=true$$,1);
select public.t_allowed('commercial_documents','Owner creates a calculated standalone draft',
  $$select public.create_finance_draft('expense','Infrastructure','Supplier','OMR','[{"description":"Server","quantity":3,"unit_price":20}]',5,5,current_date+30,null,'Monthly capacity')$$);
select public.t_true('commercial_documents','Draft totals are calculated only by the database',
  $$select subtotal=60 and discount_amount=5 and tax_amount=2.75 and amount=57.75
    from public.finance_documents where title='Infrastructure'$$);
select public.t_rejected('commercial_documents','A discount cannot exceed subtotal',
  $$select public.create_finance_draft('expense','Invalid discount','Supplier','OMR','[{"description":"Server","quantity":1,"unit_price":20}]',25,0,null,null,'')$$,'P0001');
select public.t_allowed('commercial_documents','Owner issues invoice by copying the approved quote',
  $$select public.issue_business_invoice((select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002'),current_date+30,'Delivery accepted')$$);
select public.t_true('commercial_documents','Invoice exactly copies the approved quote economics',
  $$select i.amount=q.amount and i.subtotal=q.subtotal and i.discount_amount=q.discount_amount and i.tax_rate=q.tax_rate and
    i.line_items=q.line_items and i.parent_document_id=q.id and i.document_snapshot is not null and c.stage='invoiced'
    from public.business_cases c join public.finance_documents q on q.id=c.quote_id join public.finance_documents i on i.id=c.invoice_id
    where c.deal_id='72000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('commercial_documents','Issued invoice due date is immutable',
  $$update public.finance_documents set due_date=current_date+60 where kind='invoice' and business_case_id=(select id from public.business_cases where deal_id='72000000-0000-0000-0000-000000000002')$$,'P0001');
select public.t_true('commercial_documents','Company-profile audit stores no legal or bank values',
  $$select new_data ? 'updated_at' and not (new_data ? 'iban') and not (new_data ? 'cr_number') from public.audit_logs where table_name='company_profile' order by id desc limit 1$$);

select public.test_sign_in('71000000-0000-0000-0000-000000000004');
select public.t_visible('commercial_documents','Employee cannot read finance documents','select * from public.finance_documents',0);
select public.t_visible('commercial_documents','Employee cannot read company legal and bank details','select * from public.company_profile',0);
select public.t_rejected('commercial_documents','Employee cannot issue a business quote',
  $$select public.issue_business_quote((select id from public.business_cases limit 1),'[{"description":"Bad","quantity":1,"unit_price":1}]',0,0,current_date+1,'No authority')$$,'P0001');

select public.t_finish('commercial_documents');
rollback;

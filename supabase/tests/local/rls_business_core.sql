\set ON_ERROR_STOP on
begin;
set local search_path = public;

insert into auth.users(id,email) values
  ('61000000-0000-0000-0000-000000000001','business-owner@reid.test'),
  ('61000000-0000-0000-0000-000000000002','business-admin@reid.test'),
  ('61000000-0000-0000-0000-000000000003','business-sales@reid.test'),
  ('61000000-0000-0000-0000-000000000004','business-employee@reid.test');
insert into public.user_roles(user_id,role) values
  ('61000000-0000-0000-0000-000000000001','owner'),
  ('61000000-0000-0000-0000-000000000002','admin'),
  ('61000000-0000-0000-0000-000000000003','sales'),
  ('61000000-0000-0000-0000-000000000004','employee');

select public.test_sign_in('61000000-0000-0000-0000-000000000003');
insert into public.crm_companies(id,name,owner_id)
values('62000000-0000-0000-0000-000000000001','Business Core Client','61000000-0000-0000-0000-000000000003');
insert into public.crm_deals(id,title,company_id,owner_id,value,currency)
values('62000000-0000-0000-0000-000000000002','Integrated engagement','62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000003',1000,'OMR');

select public.t_allowed('business_core','Sales opens a case from a deal',
  $$select public.create_business_case_from_deal('62000000-0000-0000-0000-000000000002')$$);
select public.t_allowed('business_core','Sales issues the quote',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'quoted','Quote reviewed with client')$$);
select public.t_true('business_core','Quote is linked to the case',
  $$select stage='quoted' and quote_id is not null from public.business_cases
    where deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('business_core','Sales cannot approve a contract',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'contracted','Unauthorized approval')$$,'P0001');
select public.t_visible('business_core','Sales sees business progress','select * from public.business_cases',1);
select public.t_visible('business_core','Sales cannot read finance ledger','select * from public.finance_documents',0);
select public.t_visible('business_core','Sales cannot read payments','select * from public.finance_payments',0);

select public.test_sign_in('61000000-0000-0000-0000-000000000002');
select public.t_allowed('business_core','Admin approves contract',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'contracted','Commercial approval')$$);
select public.t_allowed('business_core','Admin starts delivery project',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'delivery','Kickoff approved')$$);
select public.t_true('business_core','Contract, won deal and project are linked',
  $$select c.stage='delivery' and c.contract_id is not null and c.project_id is not null and d.stage='won'
    from public.business_cases c join public.crm_deals d on d.id=c.deal_id
    where c.deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('business_core','Admin cannot issue invoice',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'invoiced','Unauthorized invoice')$$,'P0001');

select public.test_sign_in('61000000-0000-0000-0000-000000000001');
select public.t_true('business_core','Owner sees the approved quote',
  $$select d.kind='quote' and d.status='approved' and d.amount=1000
    from public.business_cases c join public.finance_documents d on d.id=c.quote_id
    where c.deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_allowed('business_core','Owner creates a company expense',
  $$insert into public.finance_documents(id,kind,title,counterparty,amount,currency) values('63000000-0000-0000-0000-000000000001','expense','Hosting cost','Infrastructure supplier',50,'OMR')$$);
select public.t_allowed('business_core','Owner issues the company expense',
  $$update public.finance_documents set status='issued' where id='63000000-0000-0000-0000-000000000001'$$);
select public.t_allowed('business_core','Owner records the expense as paid',
  $$update public.finance_documents set status='paid' where id='63000000-0000-0000-0000-000000000001'$$);
select public.t_true('business_core','Paid expense keeps its own audited transition',
  $$select status='paid' and paid_at is not null and paid_amount=0 from public.finance_documents where id='63000000-0000-0000-0000-000000000001'$$);
select public.t_allowed('business_core','Owner issues invoice',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'invoiced','Delivery milestone accepted')$$);
select public.t_rejected('business_core','Invoice cannot be marked paid without ledger entry',
  $$update public.finance_documents set status='paid' where business_case_id=(select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002') and kind='invoice'$$,'P0001');
select public.t_allowed('business_core','Owner records partial payment',
  $$select public.record_business_payment((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),400,'bank_transfer','PART-1',current_date,'Deposit')$$);
select public.t_true('business_core','Partial payment preserves collection stage and balance',
  $$select c.stage='invoiced' and d.status='issued' and d.paid_amount=400
    from public.business_cases c join public.finance_documents d on d.id=c.invoice_id
    where c.deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_allowed('business_core','Owner records final payment',
  $$select public.record_business_payment((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),600,'bank_transfer','FINAL-1',current_date,'Balance')$$);
select public.t_true('business_core','Final payment closes receivable exactly',
  $$select c.stage='collected' and d.status='paid' and d.paid_amount=d.amount
    from public.business_cases c join public.finance_documents d on d.id=c.invoice_id
    where c.deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('business_core','Overpayment is rejected',
  $$select public.record_business_payment((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),1,'cash')$$,'P0001');
select public.t_allowed('business_core','Owner reverses the final payment with reason',
  $$select public.reverse_business_payment((select id from public.finance_payments where reference='FINAL-1'),'Bank returned payment')$$);
select public.t_true('business_core','Reversal reopens invoice and case',
  $$select c.stage='invoiced' and d.status='issued' and d.paid_amount=400
    from public.business_cases c join public.finance_documents d on d.id=c.invoice_id
    where c.deal_id='62000000-0000-0000-0000-000000000002'$$);
select public.t_rejected('business_core','Cancellation requires posted payments to be reversed first',
  $$select public.cancel_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'),'Cannot cancel with a deposit')$$,'P0001');
select public.t_rejected('business_core','Posted payment cannot be reversed without reason',
  $$select public.reverse_business_payment((select id from public.finance_payments where reference='PART-1'),'')$$,'P0001');
select public.t_true('business_core','Lifecycle actions have durable audit receipts',
  $$select count(*) >= 12 from public.audit_logs where table_name in ('business_cases','business_case_events','finance_payments')$$);

insert into public.crm_deals(id,title,company_id,owner_id,value,currency)
values('62000000-0000-0000-0000-000000000003','Cancellation flow','62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',250,'OMR');
select public.create_business_case_from_deal('62000000-0000-0000-0000-000000000003');
select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'quoted','Cancellation quote');
select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'contracted','Cancellation contract');
select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'delivery','Cancellation delivery');
select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'invoiced','Cancellation invoice');
select public.test_sign_in('61000000-0000-0000-0000-000000000002');
select public.t_rejected('business_core','Admin cannot cancel an invoiced engagement',
  $$select public.cancel_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'Unauthorized cancellation')$$,'P0001');
select public.t_rejected('business_core','Legacy stage RPC cannot bypass governed cancellation',
  $$select public.advance_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'cancelled','Bypass attempt')$$,'P0001');
select public.test_sign_in('61000000-0000-0000-0000-000000000001');
select public.t_allowed('business_core','Owner cancels an unpaid invoiced engagement',
  $$select public.cancel_business_case((select id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000003'),'Customer cancelled before payment')$$);
select public.t_true('business_core','Cancellation voids invoice and archives delivery',
  $$select c.stage='cancelled' and d.status='void' and p.status='cancelled' and p.archived_at is not null
    from public.business_cases c join public.finance_documents d on d.id=c.invoice_id join public.projects p on p.id=c.project_id
    where c.deal_id='62000000-0000-0000-0000-000000000003'$$);

select public.test_sign_in('61000000-0000-0000-0000-000000000004');
select public.t_visible('business_core','Employee cannot read business cases','select * from public.business_cases',0);
select public.t_rejected('business_core','Employee cannot open a business case',
  $$select public.create_business_case_from_deal('62000000-0000-0000-0000-000000000002')$$,'P0001');

reset role;
select public.t_allowed('business_core','Project deletion clears cascaded activity safely',
  $$delete from public.projects where id=(select project_id from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002')$$);
select public.t_true('business_core','Deleted delivery is unlinked from the case',
  $$select project_id is null from public.business_cases where deal_id='62000000-0000-0000-0000-000000000002'$$);

select public.t_finish('business_core');
rollback;

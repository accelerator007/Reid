begin;

-- One durable record connects sales, commercial approval, delivery and cash.
create table public.business_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 250),
  company_id uuid references public.crm_companies(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  deal_id uuid unique references public.crm_deals(id) on delete set null,
  stage text not null default 'opportunity' check (stage in ('opportunity','quoted','contracted','delivery','invoiced','collected','closed','cancelled')),
  value numeric(14,3) not null default 0 check (value >= 0),
  currency text not null default 'OMR' check (currency in ('OMR','USD','AED','EUR')),
  owner_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  quote_id uuid,
  contract_id uuid,
  project_id uuid,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_documents
  add column business_case_id uuid references public.business_cases(id) on delete set null,
  add column company_id uuid references public.crm_companies(id) on delete set null,
  add column deal_id uuid references public.crm_deals(id) on delete set null,
  add column parent_document_id uuid references public.finance_documents(id) on delete set null,
  add column line_items jsonb not null default '[]' check (jsonb_typeof(line_items) = 'array'),
  add column subtotal numeric(14,3) not null default 0 check (subtotal >= 0),
  add column tax_rate numeric(6,3) not null default 0 check (tax_rate between 0 and 100),
  add column tax_amount numeric(14,3) not null default 0 check (tax_amount >= 0),
  add column paid_amount numeric(14,3) not null default 0 check (paid_amount between 0 and amount),
  add column issued_at timestamptz,
  add column approved_at timestamptz,
  add column paid_at timestamptz;

alter table public.business_cases
  add constraint business_cases_quote_id_fkey foreign key (quote_id) references public.finance_documents(id) on delete set null,
  add constraint business_cases_contract_id_fkey foreign key (contract_id) references public.work_records(id) on delete set null,
  add constraint business_cases_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null,
  add constraint business_cases_invoice_id_fkey foreign key (invoice_id) references public.finance_documents(id) on delete set null;

create table public.business_case_events (
  id bigint generated always as identity primary key,
  business_case_id uuid not null references public.business_cases(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_stage text,
  to_stage text,
  note text not null default '',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_documents(id) on delete restrict,
  business_case_id uuid not null references public.business_cases(id) on delete restrict,
  amount numeric(14,3) not null check (amount > 0),
  currency text not null check (currency in ('OMR','USD','AED','EUR')),
  paid_on date not null default current_date,
  method text not null check (method in ('bank_transfer','cash','card','cheque','other')),
  reference text,
  notes text not null default '',
  status text not null default 'posted' check (status in ('posted','reversed')),
  recorded_by uuid not null references public.profiles(id),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  check ((status='posted' and reversed_at is null and reversed_by is null and reversal_reason is null) or
         (status='reversed' and reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason),'') is not null))
);

create index business_cases_stage_idx on public.business_cases(stage, updated_at desc);
create index business_cases_company_idx on public.business_cases(company_id);
create index business_case_events_case_idx on public.business_case_events(business_case_id, created_at desc);
create index finance_payments_invoice_idx on public.finance_payments(invoice_id, paid_on desc) where status='posted';

create or replace function public.business_access() returns boolean
language sql stable security definer set search_path='' as $$
  select public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin') or public.has_role('sales')
$$;
revoke all on function public.business_access() from public,anon;
grant execute on function public.business_access() to authenticated;

alter table public.business_cases enable row level security;
alter table public.business_case_events enable row level security;
alter table public.finance_payments enable row level security;
revoke all on public.business_cases,public.business_case_events,public.finance_payments from anon,authenticated;
grant select on public.business_cases,public.business_case_events to authenticated;
grant select on public.finance_payments to authenticated;
create policy business_cases_read on public.business_cases for select to authenticated using(public.business_access());
create policy business_case_events_read on public.business_case_events for select to authenticated using(public.business_access());
create policy finance_payments_owner_read on public.finance_payments for select to authenticated
using(public.has_role('owner') or public.has_role('super_admin'));

-- Paid invoices are immutable except for a governed payment reversal.
create or replace function public.guard_finance_document() returns trigger language plpgsql set search_path='' as $$
declare governed_reversal boolean := coalesce(current_setting('reid.payment_reversal',true),'')='on';
        governed_payment boolean := coalesce(current_setting('reid.payment_write',true),'')='on';
begin
 if new.kind<>old.kind or new.created_by<>old.created_by or new.number<>old.number then raise exception 'immutable_document_identity'; end if;
 if old.status<>'draft' and (new.amount<>old.amount or new.currency<>old.currency or new.counterparty<>old.counterparty) then raise exception 'issued_document_immutable'; end if;
 if new.paid_amount<>old.paid_amount and not governed_payment then raise exception 'payment_ledger_required'; end if;
 if old.status='void' or (old.status='paid' and not (governed_reversal and new.status='issued')) then raise exception 'document_finalized'; end if;
 if new.status<>old.status and not (
  (old.status='draft' and new.status in ('issued','void')) or
  (old.status='issued' and new.status in ('approved','paid','void') and (new.status<>'paid' or (old.kind<>'quote' and governed_payment))) or
  (old.status='approved' and new.status in ('paid','void') and (new.status<>'paid' or (old.kind<>'quote' and governed_payment))) or
  (governed_reversal and old.status='paid' and new.status='issued')
 ) then raise exception 'invalid_document_transition'; end if;
 new.updated_at=now(); return new;
end $$;

create or replace function public.create_business_case_from_deal(wanted_deal uuid)
returns public.business_cases
language plpgsql security definer set search_path='' as $$
declare deal_row public.crm_deals; result public.business_cases;
begin
  if not public.business_access() then raise exception 'business_access_denied'; end if;
  select * into deal_row from public.crm_deals where id=wanted_deal for update;
  if not found then raise exception 'deal_not_found'; end if;
  if deal_row.stage='lost' then raise exception 'lost_deal_cannot_start_delivery'; end if;
  select * into result from public.business_cases where deal_id=wanted_deal;
  if found then return result; end if;
  insert into public.business_cases(title,company_id,contact_id,deal_id,value,currency,owner_id,created_by)
  values(deal_row.title,deal_row.company_id,deal_row.contact_id,deal_row.id,deal_row.value,deal_row.currency,coalesce(deal_row.owner_id,auth.uid()),auth.uid())
  returning * into result;
  insert into public.business_case_events(business_case_id,actor_id,event_type,to_stage,note)
  values(result.id,auth.uid(),'case_created','opportunity','Created from CRM deal');
  return result;
end $$;

create or replace function public.advance_business_case(wanted_case uuid, requested_stage text, change_reason text)
returns public.business_cases
language plpgsql security definer set search_path='' as $$
declare c public.business_cases; next_allowed boolean; company_name text; doc uuid; record_id uuid; delivery_id uuid;
begin
  if not public.business_access() then raise exception 'business_access_denied'; end if;
  if nullif(trim(change_reason),'') is null then raise exception 'reason_required'; end if;
  select * into c from public.business_cases where id=wanted_case for update;
  if not found then raise exception 'business_case_not_found'; end if;
  next_allowed := (c.stage='opportunity' and requested_stage='quoted') or
                  (c.stage='quoted' and requested_stage='contracted') or
                  (c.stage='contracted' and requested_stage='delivery') or
                  (c.stage='delivery' and requested_stage='invoiced') or
                  (c.stage='collected' and requested_stage='closed') or
                  (requested_stage='cancelled' and c.stage not in ('closed','cancelled'));
  if not next_allowed then raise exception 'invalid_business_transition'; end if;
  if requested_stage in ('contracted','delivery','closed','cancelled') and not (public.has_role('owner') or public.has_role('super_admin') or public.has_role('admin')) then
    raise exception 'management_approval_required';
  end if;
  if requested_stage='invoiced' and not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_approval_required'; end if;
  select name into company_name from public.crm_companies where id=c.company_id;
  company_name:=coalesce(company_name,'Reid customer');

  if requested_stage='quoted' then
    insert into public.finance_documents(kind,title,counterparty,amount,currency,status,created_by,business_case_id,company_id,deal_id,subtotal,issued_at,notes)
    values('quote',c.title,company_name,c.value,c.currency,'draft',auth.uid(),c.id,c.company_id,c.deal_id,c.value,now(),trim(change_reason)) returning id into doc;
    update public.finance_documents set status='issued' where id=doc;
    update public.business_cases set quote_id=doc where id=c.id;
  elsif requested_stage='contracted' then
    if c.quote_id is null then raise exception 'quote_required'; end if;
    update public.finance_documents set status='approved',approved_at=now() where id=c.quote_id and status='issued';
    insert into public.work_records(kind,title,description,status,owner_id)
    values('contract','Contract · '||c.title,trim(change_reason),'done',auth.uid()) returning id into record_id;
    update public.crm_deals set stage='won',closed_at=coalesce(closed_at,now()),updated_at=now() where id=c.deal_id;
    update public.business_cases set contract_id=record_id where id=c.id;
  elsif requested_stage='delivery' then
    if c.contract_id is null then raise exception 'contract_required'; end if;
    insert into public.projects(name,type,manager_id,client_id,status,budget,visibility,description,client_name,currency,start_date)
    values(c.title,'client',auth.uid(),c.company_id,'active',c.value,'private',trim(change_reason),company_name,c.currency,current_date) returning id into delivery_id;
    insert into public.project_members(project_id,user_id,member_role) values(delivery_id,auth.uid(),'manager') on conflict do nothing;
    update public.business_cases set project_id=delivery_id where id=c.id;
  elsif requested_stage='invoiced' then
    if c.project_id is null then raise exception 'project_required'; end if;
    insert into public.finance_documents(kind,title,counterparty,project_id,amount,currency,status,due_date,created_by,business_case_id,company_id,deal_id,parent_document_id,subtotal,issued_at,notes)
    values('invoice',c.title,company_name,c.project_id,c.value,c.currency,'draft',current_date+30,auth.uid(),c.id,c.company_id,c.deal_id,c.quote_id,c.value,now(),trim(change_reason)) returning id into doc;
    update public.finance_documents set status='issued' where id=doc;
    update public.business_cases set invoice_id=doc where id=c.id;
  end if;
  insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note)
  values(c.id,auth.uid(),'stage_changed',c.stage,requested_stage,trim(change_reason));
  update public.business_cases set stage=requested_stage,updated_at=now() where id=c.id returning * into c;
  return c;
end $$;

create or replace function public.record_business_payment(wanted_case uuid, payment_amount numeric, payment_method text, payment_reference text default null, payment_date date default current_date, payment_notes text default '')
returns public.finance_payments
language plpgsql security definer set search_path='' as $$
declare c public.business_cases; invoice public.finance_documents; already_paid numeric; result public.finance_payments; new_total numeric;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_access_denied'; end if;
  if payment_amount<=0 then raise exception 'invalid_payment_amount'; end if;
  if payment_method not in ('bank_transfer','cash','card','cheque','other') then raise exception 'invalid_payment_method'; end if;
  select * into c from public.business_cases where id=wanted_case for update;
  if not found or c.stage<>'invoiced' or c.invoice_id is null then raise exception 'invoice_not_ready'; end if;
  select * into invoice from public.finance_documents where id=c.invoice_id for update;
  select coalesce(sum(amount),0) into already_paid from public.finance_payments where invoice_id=invoice.id and status='posted';
  new_total:=already_paid+payment_amount;
  if new_total>invoice.amount then raise exception 'payment_exceeds_balance'; end if;
  insert into public.finance_payments(invoice_id,business_case_id,amount,currency,paid_on,method,reference,notes,recorded_by)
  values(invoice.id,c.id,payment_amount,invoice.currency,coalesce(payment_date,current_date),payment_method,nullif(trim(payment_reference),''),coalesce(trim(payment_notes),''),auth.uid()) returning * into result;
  perform set_config('reid.payment_write','on',true);
  update public.finance_documents set paid_amount=new_total,status=case when new_total=amount then 'paid' else status end,paid_at=case when new_total=amount then now() else null end where id=invoice.id;
  if new_total=invoice.amount then
    update public.business_cases set stage='collected',updated_at=now() where id=c.id;
    insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note)
    values(c.id,auth.uid(),'payment_completed','invoiced','collected',coalesce(trim(payment_notes),'Full balance received'));
  else
    insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note,metadata)
    values(c.id,auth.uid(),'payment_recorded','invoiced','invoiced',coalesce(trim(payment_notes),'Partial payment received'),jsonb_build_object('remaining',invoice.amount-new_total,'currency',invoice.currency));
  end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),'payment_recorded','finance_payments',result.id::text,jsonb_build_object('status','posted','business_case_id',c.id));
  return result;
end $$;

create or replace function public.reverse_business_payment(wanted_payment uuid, reason text)
returns public.finance_payments
language plpgsql security definer set search_path='' as $$
declare p public.finance_payments; invoice public.finance_documents; c public.business_cases; remaining numeric;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_access_denied'; end if;
  if nullif(trim(reason),'') is null then raise exception 'reversal_reason_required'; end if;
  select * into p from public.finance_payments where id=wanted_payment for update;
  if not found or p.status<>'posted' then raise exception 'payment_not_reversible'; end if;
  select * into invoice from public.finance_documents where id=p.invoice_id for update;
  select * into c from public.business_cases where id=p.business_case_id for update;
  update public.finance_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=trim(reason) where id=p.id returning * into p;
  select coalesce(sum(amount),0) into remaining from public.finance_payments where invoice_id=invoice.id and status='posted';
  perform set_config('reid.payment_reversal','on',true);
  perform set_config('reid.payment_write','on',true);
  update public.finance_documents set paid_amount=remaining,status=case when status='paid' then 'issued' else status end,paid_at=null where id=invoice.id;
  if c.stage='collected' then update public.business_cases set stage='invoiced',updated_at=now() where id=c.id; end if;
  insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note)
  values(c.id,auth.uid(),'payment_reversed',c.stage,case when c.stage='collected' then 'invoiced' else c.stage end,trim(reason));
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),'payment_reversed','finance_payments',p.id::text,jsonb_build_object('status','reversed','business_case_id',c.id));
  return p;
end $$;

create or replace function public.audit_business_core() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),tg_op,tg_table_name,new.id::text,jsonb_build_object('stage',to_jsonb(new)->>'stage','status',to_jsonb(new)->>'status'));
  return new;
end $$;
revoke all on function public.audit_business_core() from public;
create trigger business_cases_audit after insert or update on public.business_cases for each row execute function public.audit_business_core();
create trigger business_case_events_audit after insert on public.business_case_events for each row execute function public.audit_business_core();

revoke all on function public.create_business_case_from_deal(uuid) from public,anon;
revoke all on function public.advance_business_case(uuid,text,text) from public,anon;
revoke all on function public.record_business_payment(uuid,numeric,text,text,date,text) from public,anon;
revoke all on function public.reverse_business_payment(uuid,text) from public,anon;
grant execute on function public.create_business_case_from_deal(uuid) to authenticated;
grant execute on function public.advance_business_case(uuid,text,text) to authenticated;
grant execute on function public.record_business_payment(uuid,numeric,text,text,date,text) to authenticated;
grant execute on function public.reverse_business_payment(uuid,text) to authenticated;

alter publication supabase_realtime add table public.business_cases,public.business_case_events,public.finance_payments;

commit;

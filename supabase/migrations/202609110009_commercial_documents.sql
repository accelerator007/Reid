begin;

-- The legal/business identity printed on commercial documents. Bank and legal
-- identifiers stay Owner-only; issued documents receive a private immutable
-- snapshot so later profile edits never rewrite history.
create table public.company_profile (
  id boolean primary key default true check (id),
  trade_name_ar text not null default 'ريّد',
  trade_name_en text not null default 'Reid',
  legal_name_ar text not null default '',
  legal_name_en text not null default '',
  cr_number text not null default '',
  vat_number text not null default '',
  website text not null default 'reidpro.com',
  email text not null default '',
  phone text not null default '',
  address_ar text not null default '',
  address_en text not null default '',
  bank_name text not null default '',
  account_name text not null default '',
  iban text not null default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.company_profile(id) values(true) on conflict do nothing;
alter table public.company_profile enable row level security;
revoke all on public.company_profile from anon,authenticated;
grant select,update on public.company_profile to authenticated;
create policy company_profile_owner_read on public.company_profile for select to authenticated
  using(public.has_role('owner') or public.has_role('super_admin'));
create policy company_profile_owner_update on public.company_profile for update to authenticated
  using(public.has_role('owner') or public.has_role('super_admin'))
  with check((public.has_role('owner') or public.has_role('super_admin')) and id and updated_by=auth.uid());

create function public.audit_company_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(auth.uid(),'COMPANY_PROFILE_UPDATED','company_profile','true',jsonb_build_object('updated_at',new.updated_at));
  return new;
end $$;
revoke all on function public.audit_company_profile() from public;
create trigger company_profile_audit after update on public.company_profile
  for each row execute function public.audit_company_profile();

alter table public.finance_documents
  add column discount_amount numeric(14,3) not null default 0 check(discount_amount >= 0),
  add column document_date date not null default current_date,
  add column valid_until date,
  add column seller_snapshot jsonb not null default '{}',
  add column counterparty_snapshot jsonb not null default '{}',
  add column document_snapshot jsonb;

create or replace function public.finance_line_subtotal(items jsonb)
returns numeric language plpgsql immutable set search_path='' as $$
declare item jsonb; description text; quantity numeric; unit_price numeric; total numeric := 0;
begin
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'line_items_required'; end if;
  if jsonb_array_length(items)>100 then raise exception 'too_many_line_items'; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid_line_item'; end if;
    description:=trim(coalesce(item->>'description',''));
    if length(description)<1 or length(description)>250 then raise exception 'invalid_line_description'; end if;
    quantity:=(item->>'quantity')::numeric;
    unit_price:=(item->>'unit_price')::numeric;
    if quantity<=0 or quantity>1000000 then raise exception 'invalid_line_quantity'; end if;
    if unit_price<0 or unit_price>1000000000000 then raise exception 'invalid_line_unit_price'; end if;
    total:=total+round(quantity*unit_price,3);
  end loop;
  return round(total,3);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_line_item_number';
end $$;
revoke all on function public.finance_line_subtotal(jsonb) from public,anon,authenticated;

-- Backfill historical documents before the stricter guard is installed.
update public.finance_documents
set document_date=created_at::date,
    line_items=case when jsonb_array_length(line_items)=0 then jsonb_build_array(jsonb_build_object(
      'description',title,'quantity',1,'unit_price',case when subtotal>0 then subtotal else amount end
    )) else line_items end,
    subtotal=case when subtotal=0 and amount>0 then amount else subtotal end;

update public.finance_documents d
set seller_snapshot=jsonb_build_object('trade_name_ar','ريّد','trade_name_en','Reid','website','reidpro.com'),
    counterparty_snapshot=jsonb_build_object('name',d.counterparty),
    document_snapshot=jsonb_build_object(
      'number',d.number,'kind',d.kind,'title',d.title,'counterparty',d.counterparty,
      'line_items',d.line_items,'subtotal',d.subtotal,'discount_amount',d.discount_amount,
      'tax_rate',d.tax_rate,'tax_amount',d.tax_amount,'amount',d.amount,'currency',d.currency,
      'document_date',d.document_date,'due_date',d.due_date,'valid_until',d.valid_until
    )
where d.status<>'draft';

create or replace function public.guard_finance_document() returns trigger
language plpgsql set search_path='' as $$
declare governed_reversal boolean := coalesce(current_setting('reid.payment_reversal',true),'')='on';
        governed_payment boolean := coalesce(current_setting('reid.payment_write',true),'')='on';
        calculated_subtotal numeric; taxable numeric; seller jsonb; customer jsonb;
begin
  if new.kind<>old.kind or new.created_by<>old.created_by or new.number<>old.number then raise exception 'immutable_document_identity'; end if;
  if old.status<>'draft' and (
    new.title<>old.title or new.counterparty<>old.counterparty or new.currency<>old.currency or
    new.line_items is distinct from old.line_items or new.subtotal<>old.subtotal or
    new.discount_amount<>old.discount_amount or new.tax_rate<>old.tax_rate or new.tax_amount<>old.tax_amount or
    new.amount<>old.amount or new.document_date<>old.document_date or
    new.due_date is distinct from old.due_date or new.valid_until is distinct from old.valid_until or
    new.notes<>old.notes or new.seller_snapshot is distinct from old.seller_snapshot or
    new.counterparty_snapshot is distinct from old.counterparty_snapshot or
    new.document_snapshot is distinct from old.document_snapshot or
    new.business_case_id is distinct from old.business_case_id or new.company_id is distinct from old.company_id or
    new.deal_id is distinct from old.deal_id or new.parent_document_id is distinct from old.parent_document_id
  ) then raise exception 'issued_document_immutable'; end if;
  if new.paid_amount<>old.paid_amount and not governed_payment then raise exception 'payment_ledger_required'; end if;
  if old.status='void' or (old.status='paid' and not (governed_reversal and new.status='issued')) then raise exception 'document_finalized'; end if;
  if new.status<>old.status and not (
    (old.status='draft' and new.status in ('issued','void')) or
    (old.status='issued' and new.status in ('approved','paid','void') and
      (new.status<>'paid' or old.kind='expense' or (old.kind='invoice' and governed_payment))) or
    (old.status='approved' and new.status in ('paid','void') and
      (new.status<>'paid' or old.kind='expense' or (old.kind='invoice' and governed_payment))) or
    (governed_reversal and old.status='paid' and new.status='issued')
  ) then raise exception 'invalid_document_transition'; end if;

  if old.status='draft' then
    if new.status='issued' and jsonb_array_length(new.line_items)=0 and new.kind='invoice' and new.parent_document_id is not null then
      select line_items,subtotal,discount_amount,tax_rate into new.line_items,new.subtotal,new.discount_amount,new.tax_rate
      from public.finance_documents where id=new.parent_document_id;
    end if;
    if new.status='issued' and jsonb_array_length(new.line_items)=0 then
      new.line_items:=jsonb_build_array(jsonb_build_object('description',new.title,'quantity',1,'unit_price',new.amount));
    end if;
    if jsonb_array_length(new.line_items)>0 then
      calculated_subtotal:=public.finance_line_subtotal(new.line_items);
      if new.discount_amount>calculated_subtotal then raise exception 'discount_exceeds_subtotal'; end if;
      taxable:=calculated_subtotal-new.discount_amount;
      new.subtotal:=calculated_subtotal;
      new.tax_amount:=round(taxable*new.tax_rate/100,3);
      new.amount:=round(taxable+new.tax_amount,3);
    end if;
    if new.valid_until is not null and new.valid_until<new.document_date then raise exception 'invalid_valid_until'; end if;
    if new.due_date is not null and new.due_date<new.document_date then raise exception 'invalid_due_date'; end if;
  end if;

  if old.status='draft' and new.status='issued' then
    select to_jsonb(profile)-'id'-'updated_by'-'updated_at' into seller from public.company_profile profile where id=true;
    select jsonb_strip_nulls(jsonb_build_object('name',coalesce(company.name,new.counterparty),'email',company.email,'phone',company.phone,'address',company.address,'website',company.website))
      into customer from public.crm_companies company where company.id=new.company_id;
    new.seller_snapshot:=coalesce(seller,jsonb_build_object('trade_name_ar','ريّد','trade_name_en','Reid','website','reidpro.com'));
    new.counterparty_snapshot:=coalesce(customer,jsonb_build_object('name',new.counterparty));
    new.issued_at:=now();
    new.document_snapshot:=jsonb_build_object(
      'number',new.number,'kind',new.kind,'title',new.title,'seller',new.seller_snapshot,
      'counterparty',new.counterparty_snapshot,'line_items',new.line_items,'subtotal',new.subtotal,
      'discount_amount',new.discount_amount,'tax_rate',new.tax_rate,'tax_amount',new.tax_amount,
      'amount',new.amount,'currency',new.currency,'document_date',new.document_date,
      'due_date',new.due_date,'valid_until',new.valid_until,'notes',new.notes
    );
  end if;
  if not (old.status='draft' and new.status='issued') then new.issued_at:=old.issued_at; end if;
  if new.status='approved' and old.status<>'approved' then new.approved_at:=now();
  else new.approved_at:=old.approved_at; end if;
  if new.status='paid' and old.status<>'paid' then new.paid_at:=now();
  elsif governed_reversal and old.status='paid' and new.status='issued' then new.paid_at:=null;
  else new.paid_at:=old.paid_at; end if;
  new.updated_at:=now();
  return new;
end $$;

create or replace function public.create_finance_draft(
  document_kind text, document_title text, document_counterparty text, document_currency text,
  document_items jsonb, document_discount numeric default 0, document_tax_rate numeric default 0,
  document_due_date date default null, document_valid_until date default null, document_notes text default ''
) returns public.finance_documents
language plpgsql security definer set search_path='' as $$
declare result public.finance_documents;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_access_denied'; end if;
  if document_kind not in ('quote','invoice','expense') then raise exception 'invalid_document_kind'; end if;
  if nullif(trim(document_title),'') is null or nullif(trim(document_counterparty),'') is null then raise exception 'document_identity_required'; end if;
  perform public.finance_line_subtotal(document_items);
  insert into public.finance_documents(kind,title,counterparty,amount,currency,line_items,discount_amount,tax_rate,due_date,valid_until,notes,created_by)
  values(document_kind,trim(document_title),trim(document_counterparty),0,document_currency,document_items,coalesce(document_discount,0),coalesce(document_tax_rate,0),document_due_date,document_valid_until,coalesce(document_notes,''),auth.uid())
  returning * into result;
  update public.finance_documents set line_items=document_items where id=result.id returning * into result;
  return result;
end $$;

create or replace function public.update_finance_draft(
  wanted_document uuid, document_title text, document_counterparty text, document_currency text,
  document_items jsonb, document_discount numeric default 0, document_tax_rate numeric default 0,
  document_due_date date default null, document_valid_until date default null, document_notes text default ''
) returns public.finance_documents
language plpgsql security definer set search_path='' as $$
declare result public.finance_documents;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_access_denied'; end if;
  if nullif(trim(document_title),'') is null or nullif(trim(document_counterparty),'') is null then raise exception 'document_identity_required'; end if;
  perform public.finance_line_subtotal(document_items);
  update public.finance_documents set title=trim(document_title),counterparty=trim(document_counterparty),currency=document_currency,
    line_items=document_items,discount_amount=coalesce(document_discount,0),tax_rate=coalesce(document_tax_rate,0),
    due_date=document_due_date,valid_until=document_valid_until,notes=coalesce(document_notes,'')
  where id=wanted_document and status='draft' returning * into result;
  if not found then raise exception 'draft_document_not_found'; end if;
  return result;
end $$;

create or replace function public.issue_business_quote(
  wanted_case uuid, document_items jsonb, document_discount numeric, document_tax_rate numeric,
  document_valid_until date, change_reason text
) returns public.business_cases
language plpgsql security definer set search_path='' as $$
declare c public.business_cases; company_name text; doc public.finance_documents;
begin
  if not public.business_access() then raise exception 'business_access_denied'; end if;
  if nullif(trim(change_reason),'') is null then raise exception 'reason_required'; end if;
  perform public.finance_line_subtotal(document_items);
  select * into c from public.business_cases where id=wanted_case for update;
  if not found then raise exception 'business_case_not_found'; end if;
  if c.stage<>'opportunity' or c.quote_id is not null then raise exception 'invalid_business_transition'; end if;
  select name into company_name from public.crm_companies where id=c.company_id;
  insert into public.finance_documents(kind,title,counterparty,amount,currency,status,created_by,business_case_id,company_id,deal_id,line_items,discount_amount,tax_rate,valid_until,notes)
  values('quote',c.title,coalesce(company_name,'Reid customer'),0,c.currency,'draft',auth.uid(),c.id,c.company_id,c.deal_id,document_items,coalesce(document_discount,0),coalesce(document_tax_rate,0),document_valid_until,trim(change_reason)) returning * into doc;
  update public.finance_documents set status='issued' where id=doc.id returning * into doc;
  update public.business_cases set quote_id=doc.id,stage='quoted',value=doc.amount,updated_at=now() where id=c.id returning * into c;
  update public.crm_deals set value=doc.amount,stage='proposal',updated_at=now() where id=c.deal_id and stage not in ('won','lost');
  insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note,metadata)
  values(c.id,auth.uid(),'quote_issued','opportunity','quoted',trim(change_reason),jsonb_build_object('document_id',doc.id,'amount',doc.amount,'currency',doc.currency));
  return c;
end $$;

create or replace function public.issue_business_invoice(wanted_case uuid, document_due_date date, change_reason text)
returns public.business_cases
language plpgsql security definer set search_path='' as $$
declare c public.business_cases; quote public.finance_documents; company_name text; doc public.finance_documents;
begin
  if not (public.has_role('owner') or public.has_role('super_admin')) then raise exception 'finance_access_denied'; end if;
  if nullif(trim(change_reason),'') is null then raise exception 'reason_required'; end if;
  select * into c from public.business_cases where id=wanted_case for update;
  if not found then raise exception 'business_case_not_found'; end if;
  if c.stage<>'delivery' or c.project_id is null or c.invoice_id is not null then raise exception 'invalid_business_transition'; end if;
  select * into quote from public.finance_documents where id=c.quote_id and status='approved';
  if not found then raise exception 'approved_quote_required'; end if;
  select name into company_name from public.crm_companies where id=c.company_id;
  insert into public.finance_documents(kind,title,counterparty,project_id,amount,currency,status,due_date,created_by,business_case_id,company_id,deal_id,parent_document_id,line_items,discount_amount,tax_rate,notes)
  values('invoice',c.title,coalesce(company_name,quote.counterparty),c.project_id,0,quote.currency,'draft',document_due_date,auth.uid(),c.id,c.company_id,c.deal_id,quote.id,quote.line_items,quote.discount_amount,quote.tax_rate,trim(change_reason)) returning * into doc;
  update public.finance_documents set status='issued' where id=doc.id returning * into doc;
  update public.business_cases set invoice_id=doc.id,stage='invoiced',value=doc.amount,updated_at=now() where id=c.id returning * into c;
  insert into public.business_case_events(business_case_id,actor_id,event_type,from_stage,to_stage,note,metadata)
  values(c.id,auth.uid(),'invoice_issued','delivery','invoiced',trim(change_reason),jsonb_build_object('document_id',doc.id,'amount',doc.amount,'currency',doc.currency));
  return c;
end $$;

-- A delivery starts with an explicit milestone and one owned planning task.
create function public.seed_business_project_plan() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.stage='contracted' and new.stage='delivery' and new.project_id is not null then
    insert into public.project_milestones(project_id,title,description,due_date,status,created_by)
    values(new.project_id,'بدء المشروع · Project kickoff','اعتماد النطاق وخطة التسليم مع العميل · Confirm scope and delivery plan with the customer',current_date+7,'planned',auth.uid());
    insert into public.tasks(title,description,status,priority,assignee_id,project_id,due_at,created_by)
    values('اعتماد النطاق وخطة التسليم · Confirm scope and delivery plan','مهمة تأسيسية من دورة العمل · Initial task created from Business Flow','todo',1,auth.uid(),new.project_id,(current_date+3)::timestamptz,auth.uid());
  end if;
  return new;
end $$;
revoke all on function public.seed_business_project_plan() from public;
create trigger business_case_project_plan after update of stage,project_id on public.business_cases
for each row execute function public.seed_business_project_plan();

revoke all on function public.create_finance_draft(text,text,text,text,jsonb,numeric,numeric,date,date,text) from public,anon;
revoke all on function public.update_finance_draft(uuid,text,text,text,jsonb,numeric,numeric,date,date,text) from public,anon;
revoke all on function public.issue_business_quote(uuid,jsonb,numeric,numeric,date,text) from public,anon;
revoke all on function public.issue_business_invoice(uuid,date,text) from public,anon;
grant execute on function public.create_finance_draft(text,text,text,text,jsonb,numeric,numeric,date,date,text) to authenticated;
grant execute on function public.update_finance_draft(uuid,text,text,text,jsonb,numeric,numeric,date,date,text) to authenticated;
grant execute on function public.issue_business_quote(uuid,jsonb,numeric,numeric,date,text) to authenticated;
grant execute on function public.issue_business_invoice(uuid,date,text) to authenticated;

commit;

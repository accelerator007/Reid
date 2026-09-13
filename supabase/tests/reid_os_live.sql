begin;
insert into auth.users(id,email) values
('91000000-0000-0000-0000-000000000001','qr-owner-fixture@reid.test'),
('91000000-0000-0000-0000-000000000002','qr-employee-fixture@reid.test');
insert into public.user_roles(user_id,role) values
('91000000-0000-0000-0000-000000000001','owner'),
('91000000-0000-0000-0000-000000000002','employee');
insert into public.qr_conversations(id,jid) values('91000000-0000-0000-0000-000000000003','96800000000@s.whatsapp.net');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
insert into public.finance_documents(kind,title,counterparty,amount) values('invoice','QA rollback invoice','Synthetic',10.123);
update public.finance_documents set status='issued' where title='QA rollback invoice';
do $$ begin
 begin
  update public.finance_documents set amount=20 where title='QA rollback invoice';
  raise exception 'TEST FAILED: issued document mutated';
 exception when raise_exception then
  if sqlerrm<>'issued_document_immutable' then raise; end if;
 end;
 if not exists(select 1 from public.qr_conversations where id='91000000-0000-0000-0000-000000000003') then raise exception 'TEST FAILED: owner cannot read QR'; end if;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from public.qr_conversations) then raise exception 'TEST FAILED: employee sees QR'; end if;
 if exists(select 1 from public.finance_documents) then raise exception 'TEST FAILED: employee sees finance'; end if;
 begin
  insert into public.finance_documents(kind,title,counterparty,amount) values('invoice','forbidden','Synthetic',1);
  raise exception 'TEST FAILED: employee writes finance';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.work_records(kind,title) values('leave','QA rollback leave');
do $$ begin
 begin
  update public.work_records set status='done' where title='QA rollback leave';
  raise exception 'TEST FAILED: employee approves own leave';
 exception when raise_exception then if sqlerrm<>'approval_required' then raise; end if; end;
 begin
  insert into public.work_records(kind,title) values('contract','forbidden');
  raise exception 'TEST FAILED: employee creates contract';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Owner scope, employee isolation, invoice immutability and leave approval tests passed' as result;
rollback;

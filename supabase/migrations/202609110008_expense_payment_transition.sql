begin;

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
  (old.status='issued' and new.status in ('approved','paid','void') and
    (new.status<>'paid' or old.kind='expense' or (old.kind='invoice' and governed_payment))) or
  (old.status='approved' and new.status in ('paid','void') and
    (new.status<>'paid' or old.kind='expense' or (old.kind='invoice' and governed_payment))) or
  (governed_reversal and old.status='paid' and new.status='issued')
 ) then raise exception 'invalid_document_transition'; end if;
 if new.kind='expense' and new.status='paid' and old.status<>'paid' then new.paid_at=now(); end if;
 new.updated_at=now(); return new;
end $$;

commit;

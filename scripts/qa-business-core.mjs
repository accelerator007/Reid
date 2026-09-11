import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const project='pkogchbrknwmzefjklkr';
const url=`https://${project}.supabase.co`;
const keys=JSON.parse(execFileSync('npx',['--yes','supabase@2.117.0','projects','api-keys','--project-ref',project,'--reveal','-o','json'],{encoding:'utf8'}));
const publishable=keys.find(key=>key.type==='publishable')?.api_key;
const serviceRole=keys.find(key=>key.name==='service_role')?.api_key;
if(!publishable||!serviceRole)throw new Error('Supabase API keys unavailable');

const service=createClient(url,serviceRole,{auth:{persistSession:false}});
const clients={
  owner:createClient(url,publishable,{auth:{persistSession:false}}),
  admin:createClient(url,publishable,{auth:{persistSession:false}}),
  sales:createClient(url,publishable,{auth:{persistSession:false}}),
};
const stamp=Date.now();
const password=randomBytes(24).toString('base64url');
const userIds=[];
let companyId,dealId,caseId,quoteId,contractId,projectId,invoiceId,finalPaymentId;
let cancelDealId,cancelCaseId,cancelContractId,cancelProjectId,cancelInvoiceId;
let expenseId;

const check=(condition,message)=>{if(!condition)throw new Error(message);};
const dataOf=async(promise,label)=>{const {data,error}=await promise;if(error)throw new Error(`${label}: ${error.message}`);return data;};
const rejected=async(promise,needle,label)=>{const {error}=await promise;const accepted=Array.isArray(needle)?needle:[needle];check(error&&accepted.some(value=>error.message.includes(value)),`${label}: expected ${accepted.join(' or ')}, got ${error?.message||'success'}`);};
const createUser=async(role)=>{
  const email=`business-${role}-${stamp}@reid.test`;
  const response=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Business QA ${role}`}});
  if(response.error)throw response.error;
  const id=response.data.user.id;userIds.push(id);
  await dataOf(service.from('user_roles').insert({user_id:id,role,granted_by:id}),`grant ${role}`);
  await dataOf(clients[role].auth.signInWithPassword({email,password}),`sign in ${role}`);
  return id;
};

try{
  const ownerId=await createUser('owner');
  await createUser('admin');
  const salesId=await createUser('sales');

  const expense=await dataOf(clients.owner.from('finance_documents').insert({kind:'expense',title:`Business QA expense ${stamp}`,counterparty:'Infrastructure supplier',amount:50,currency:'OMR'}).select('id').single(),'create expense');expenseId=expense.id;
  await dataOf(clients.owner.from('finance_documents').update({status:'issued'}).eq('id',expenseId).select('id').single(),'issue expense');
  await dataOf(clients.owner.from('finance_documents').update({status:'paid'}).eq('id',expenseId).select('id').single(),'pay expense');
  const paidExpense=await dataOf(service.from('finance_documents').select('status,paid_at').eq('id',expenseId).single(),'verify paid expense');
  check(paidExpense.status==='paid'&&paidExpense.paid_at,'expense payment transition failed');

  const company=await dataOf(service.from('crm_companies').insert({name:`Business QA ${stamp}`,owner_id:salesId,status:'prospect'}).select('id').single(),'create company');
  companyId=company.id;
  const deal=await dataOf(service.from('crm_deals').insert({title:`Integrated lifecycle ${stamp}`,company_id:companyId,owner_id:salesId,value:1000,currency:'OMR'}).select('id').single(),'create deal');
  dealId=deal.id;

  const opened=await dataOf(clients.sales.rpc('create_business_case_from_deal',{wanted_deal:dealId}),'sales opens case');
  caseId=opened.id;
  const quoted=await dataOf(clients.sales.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'quoted',change_reason:'Live QA quote'}),'sales issues quote');
  quoteId=quoted.quote_id;
  check(quoted.stage==='quoted'&&quoteId,'quote was not linked');
  await rejected(clients.sales.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'contracted',change_reason:'Must be denied'}),'management_approval_required','sales contract boundary');
  const salesDocs=await dataOf(clients.sales.from('finance_documents').select('id'),'sales finance visibility');
  check(salesDocs.length===0,'sales can see protected finance documents');

  const contracted=await dataOf(clients.admin.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'contracted',change_reason:'Live QA commercial approval'}),'admin approves contract');
  contractId=contracted.contract_id;
  const delivery=await dataOf(clients.admin.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'delivery',change_reason:'Live QA kickoff'}),'admin starts delivery');
  projectId=delivery.project_id;
  check(contractId&&projectId,'contract or delivery project was not linked');
  await rejected(clients.admin.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'invoiced',change_reason:'Must be denied'}),'finance_approval_required','admin invoice boundary');

  const invoiced=await dataOf(clients.owner.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'invoiced',change_reason:'Live QA accepted delivery'}),'owner issues invoice');
  invoiceId=invoiced.invoice_id;
  await rejected(clients.owner.from('finance_documents').update({status:'paid'}).eq('id',invoiceId),['payment_ledger_required','invalid_document_transition'],'manual paid boundary');
  await dataOf(clients.owner.rpc('record_business_payment',{wanted_case:caseId,payment_amount:400,payment_method:'bank_transfer',payment_reference:`PART-${stamp}`,payment_date:new Date().toISOString().slice(0,10),payment_notes:'Live QA deposit'}),'partial payment');
  const afterPartial=await dataOf(service.from('finance_documents').select('status,paid_amount').eq('id',invoiceId).single(),'verify partial');
  check(afterPartial.status==='issued'&&Number(afterPartial.paid_amount)===400,'partial payment balance is wrong');

  const finalPayment=await dataOf(clients.owner.rpc('record_business_payment',{wanted_case:caseId,payment_amount:600,payment_method:'bank_transfer',payment_reference:`FINAL-${stamp}`,payment_date:new Date().toISOString().slice(0,10),payment_notes:'Live QA balance'}),'final payment');
  finalPaymentId=finalPayment.id;
  const collected=await dataOf(service.from('business_cases').select('stage').eq('id',caseId).single(),'verify collection');
  check(collected.stage==='collected','case was not collected');
  await dataOf(clients.owner.rpc('reverse_business_payment',{wanted_payment:finalPaymentId,reason:'Live QA governed reversal'}),'reverse payment');
  const reopened=await dataOf(service.from('business_cases').select('stage').eq('id',caseId).single(),'verify reopening');
  check(reopened.stage==='invoiced','reversal did not reopen the case');
  await dataOf(clients.owner.rpc('record_business_payment',{wanted_case:caseId,payment_amount:600,payment_method:'bank_transfer',payment_reference:`REPOST-${stamp}`,payment_date:new Date().toISOString().slice(0,10),payment_notes:'Live QA repost'}),'repost payment');
  const closed=await dataOf(clients.owner.rpc('advance_business_case',{wanted_case:caseId,requested_stage:'closed',change_reason:'Live QA completed engagement'}),'close engagement');
  check(closed.stage==='closed','engagement did not close');

  const linked=await dataOf(service.from('business_cases').select('quote_id,contract_id,project_id,invoice_id,stage').eq('id',caseId).single(),'verify links');
  check(linked.quote_id&&linked.contract_id&&linked.project_id&&linked.invoice_id&&linked.stage==='closed','lifecycle links are incomplete');

  const cancelDeal=await dataOf(service.from('crm_deals').insert({title:`Cancellation lifecycle ${stamp}`,company_id:companyId,owner_id:salesId,value:250,currency:'OMR'}).select('id').single(),'create cancellation deal');
  cancelDealId=cancelDeal.id;
  const cancelOpened=await dataOf(clients.sales.rpc('create_business_case_from_deal',{wanted_deal:cancelDealId}),'open cancellation case');cancelCaseId=cancelOpened.id;
  await dataOf(clients.sales.rpc('advance_business_case',{wanted_case:cancelCaseId,requested_stage:'quoted',change_reason:'Live QA cancellation quote'}),'issue cancellation quote');
  const cancelContracted=await dataOf(clients.admin.rpc('advance_business_case',{wanted_case:cancelCaseId,requested_stage:'contracted',change_reason:'Live QA cancellation contract'}),'approve cancellation contract');cancelContractId=cancelContracted.contract_id;
  const cancelDelivery=await dataOf(clients.admin.rpc('advance_business_case',{wanted_case:cancelCaseId,requested_stage:'delivery',change_reason:'Live QA cancellation delivery'}),'start cancellation delivery');cancelProjectId=cancelDelivery.project_id;
  const cancelInvoiced=await dataOf(clients.owner.rpc('advance_business_case',{wanted_case:cancelCaseId,requested_stage:'invoiced',change_reason:'Live QA cancellation invoice'}),'issue cancellation invoice');cancelInvoiceId=cancelInvoiced.invoice_id;
  await rejected(clients.admin.rpc('cancel_business_case',{wanted_case:cancelCaseId,change_reason:'Must be denied'}),'finance_approval_required','admin invoiced cancellation boundary');
  await rejected(clients.admin.rpc('advance_business_case',{wanted_case:cancelCaseId,requested_stage:'cancelled',change_reason:'Must be denied'}),'use_governed_cancellation','legacy cancellation bypass boundary');
  await dataOf(clients.owner.rpc('cancel_business_case',{wanted_case:cancelCaseId,change_reason:'Live QA customer cancellation'}),'owner cancels unpaid engagement');
  const cancelled=await dataOf(service.from('business_cases').select('stage').eq('id',cancelCaseId).single(),'verify cancellation case');
  const cancelledProject=await dataOf(service.from('projects').select('status,archived_at').eq('id',cancelProjectId).single(),'verify cancelled project');
  const voidInvoice=await dataOf(service.from('finance_documents').select('status').eq('id',cancelInvoiceId).single(),'verify void invoice');
  check(cancelled.stage==='cancelled'&&cancelledProject.status==='cancelled'&&cancelledProject.archived_at&&voidInvoice.status==='void','cancellation did not archive delivery and void invoice');

  const receipts=await service.from('audit_logs').select('id',{count:'exact',head:true}).in('actor_id',userIds);
  if(receipts.error)throw receipts.error;
  check((receipts.count||0)>=12,'lifecycle audit receipts are incomplete');

  console.log(JSON.stringify({ok:true,caseOpened:true,roleBoundaries:true,quoteContractProjectInvoice:true,partialAndFullPayment:true,governedReversal:true,closed:true,governedCancellation:true,expensePayment:true,auditReceipts:receipts.count}));
}finally{
  const cleanupErrors=[];
  const clean=async(label,promise)=>{const {error}=await promise;if(error)cleanupErrors.push(`${label}: ${error.message}`);};
  for(const item of [{caseId,contractId,projectId},{caseId:cancelCaseId,contractId:cancelContractId,projectId:cancelProjectId}]){
    if(item.caseId)await clean('unlink case',service.from('business_cases').update({quote_id:null,contract_id:null,project_id:null,invoice_id:null}).eq('id',item.caseId));
    if(item.caseId)await clean('delete payments',service.from('finance_payments').delete().eq('business_case_id',item.caseId));
    if(item.caseId)await clean('delete events',service.from('business_case_events').delete().eq('business_case_id',item.caseId));
    if(item.caseId)await clean('delete documents',service.from('finance_documents').delete().eq('business_case_id',item.caseId));
    if(item.contractId)await clean('delete contract',service.from('work_records').delete().eq('id',item.contractId));
    if(item.projectId)await clean('delete project',service.from('projects').delete().eq('id',item.projectId));
    if(item.caseId)await clean('delete case',service.from('business_cases').delete().eq('id',item.caseId));
  }
  for(const id of [dealId,cancelDealId])if(id)await clean('delete deal',service.from('crm_deals').delete().eq('id',id));
  if(expenseId)await clean('delete expense',service.from('finance_documents').delete().eq('id',expenseId));
  if(companyId)await clean('delete company',service.from('crm_companies').delete().eq('id',companyId));
  if(userIds.length){
    await clean('delete notifications',service.from('notifications').delete().in('user_id',userIds));
    await clean('delete audit receipts',service.from('audit_logs').delete().in('actor_id',userIds));
    await clean('delete account controls',service.from('account_controls').delete().in('user_id',userIds));
    await clean('delete roles',service.from('user_roles').delete().in('user_id',userIds));
  }
  for(const id of userIds.reverse()){const result=await service.auth.admin.deleteUser(id);if(result.error)cleanupErrors.push(`delete QA identity: ${result.error.message}`);}
  if(cleanupErrors.length)throw new Error(`QA cleanup failed: ${cleanupErrors.join('; ')}`);
}

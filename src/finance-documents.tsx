import React from 'react';
import { ArrowUpRight, Building2, FilePenLine, FileText, Plus, Printer, RefreshCw, Settings2, Trash2, Wallet, X } from 'lucide-react';
import reidLogo from '../assets/img/reid-logo.svg';
import { list, messageFor, run } from './db';
import type { Page } from './routes';
import { useSession } from './shell';
import { supabase } from './supabase';

type Lang='ar'|'en';
const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;

export type CommercialLine={key:string;description:string;quantity:number;unit_price:number};
export type LinePayload={description:string;quantity:number;unit_price:number};
export const emptyCommercialLine=():CommercialLine=>({key:crypto.randomUUID(),description:'',quantity:1,unit_price:0});
export const linePayload=(lines:CommercialLine[]):LinePayload[]=>lines.map(({description,quantity,unit_price})=>({description:description.trim(),quantity:Number(quantity),unit_price:Number(unit_price)}));
export const documentTotals=(lines:Pick<CommercialLine,'quantity'|'unit_price'>[],discount:number,taxRate:number)=>{
  const subtotal=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*(Number(line.unit_price)||0),0);
  const net=Math.max(0,subtotal-(Number(discount)||0));
  const tax=net*(Number(taxRate)||0)/100;
  return {subtotal,net,tax,total:net+tax};
};

export function LineItemsEditor({lang,lines,setLines,currency='OMR'}:{lang:Lang;lines:CommercialLine[];setLines:(lines:CommercialLine[])=>void;currency?:string}){
  const money=(value:number)=>new Intl.NumberFormat(lang==='ar'?'ar-OM':'en-OM',{style:'currency',currency}).format(value||0);
  const update=(key:string,field:'description'|'quantity'|'unit_price',value:string)=>setLines(lines.map(line=>line.key===key?{...line,[field]:field==='description'?value:Number(value)}:line));
  return <fieldset className="os-line-items"><legend>{tr(lang,'بنود المستند','Document line items')}</legend>
    <div className="os-line-heading"><span>{tr(lang,'الوصف','Description')}</span><span>{tr(lang,'الكمية','Qty')}</span><span>{tr(lang,'السعر','Unit price')}</span><span>{tr(lang,'الإجمالي','Total')}</span><span/></div>
    {lines.map((line,index)=><div className="os-line-row" key={line.key}>
      <input aria-label={`${tr(lang,'وصف البند','Line description')} ${index+1}`} value={line.description} onChange={event=>update(line.key,'description',event.target.value)} maxLength={250} required/>
      <input aria-label={`${tr(lang,'كمية البند','Line quantity')} ${index+1}`} type="number" min="0.001" max="1000000" step="0.001" value={line.quantity} onChange={event=>update(line.key,'quantity',event.target.value)} required/>
      <input aria-label={`${tr(lang,'سعر البند','Line unit price')} ${index+1}`} type="number" min="0" max="1000000000000" step="0.001" value={line.unit_price} onChange={event=>update(line.key,'unit_price',event.target.value)} required/>
      <strong>{money(Number(line.quantity)*Number(line.unit_price))}</strong>
      <button type="button" disabled={lines.length===1} onClick={()=>setLines(lines.filter(item=>item.key!==line.key))} aria-label={tr(lang,'حذف البند','Remove line')}><Trash2/></button>
    </div>)}
    <button type="button" className="os-secondary os-add-line" disabled={lines.length>=100} onClick={()=>setLines([...lines,emptyCommercialLine()])}><Plus/>{tr(lang,'إضافة بند','Add line')}</button>
  </fieldset>;
}

type FinanceRow={
  id:string;number:number;kind:'quote'|'invoice'|'expense';title:string;counterparty:string;
  amount:number;subtotal:number;discount_amount:number;tax_rate:number;tax_amount:number;paid_amount:number;
  business_case_id:string|null;currency:string;status:string;document_date:string;due_date:string|null;valid_until:string|null;
  notes:string;line_items:LinePayload[];seller_snapshot:Record<string,string>;counterparty_snapshot:Record<string,string>;
  document_snapshot:Record<string,unknown>|null;created_at:string;
};

type CompanyProfile={
  trade_name_ar:string;trade_name_en:string;legal_name_ar:string;legal_name_en:string;cr_number:string;vat_number:string;
  website:string;email:string;phone:string;address_ar:string;address_en:string;bank_name:string;account_name:string;iban:string;
};

const defaultCompany:CompanyProfile={trade_name_ar:'ريّد',trade_name_en:'Reid',legal_name_ar:'',legal_name_en:'',cr_number:'',vat_number:'',website:'reidpro.com',email:'',phone:'',address_ar:'',address_en:'',bank_name:'',account_name:'',iban:''};
const statusNames=(lang:Lang):Record<string,string>=>({draft:tr(lang,'مسودة','Draft'),issued:tr(lang,'صادر','Issued'),approved:tr(lang,'معتمد','Approved'),paid:tr(lang,'مدفوع','Paid'),void:tr(lang,'ملغي','Void')});
const kindNames=(lang:Lang):Record<string,string>=>({quote:tr(lang,'عرض سعر','Quotation'),invoice:tr(lang,'فاتورة','Invoice'),expense:tr(lang,'مصروف','Expense')});
const toEditorLines=(items:LinePayload[]|null|undefined,amount=0,title='')=>(items?.length?items:[{description:title,quantity:1,unit_price:amount}]).map(item=>({...item,key:crypto.randomUUID()}));

export function FinanceDocuments({lang,go}:{lang:Lang;go:(page:Page)=>void}){
  const {user}=useSession();
  const [kind,setKind]=React.useState<'invoice'|'quote'|'expense'>('invoice');
  const [rows,setRows]=React.useState<FinanceRow[]>([]),[company,setCompany]=React.useState<CompanyProfile>(defaultCompany);
  const [error,setError]=React.useState(''),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(true);
  const [editing,setEditing]=React.useState<FinanceRow|'new'|null>(null),[viewing,setViewing]=React.useState<FinanceRow|null>(null),[settings,setSettings]=React.useState(false);

  const load=React.useCallback(async()=>{if(!supabase)return;setBusy(true);const [docs,profile]=await Promise.all([
    list<FinanceRow>(supabase.from('finance_documents').select('*').order('created_at',{ascending:false}).limit(200)),
    run<CompanyProfile>(supabase.from('company_profile').select('trade_name_ar,trade_name_en,legal_name_ar,legal_name_en,cr_number,vat_number,website,email,phone,address_ar,address_en,bank_name,account_name,iban').eq('id',true).single()),
  ]);if(docs.ok){setRows(docs.data);setError('');}else setError(messageFor(docs.error,lang));if(profile.ok&&profile.data)setCompany(profile.data);setBusy(false);},[lang]);
  React.useEffect(()=>{void load();},[load]);
  const feedback=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),4500);};
  const saveProfile=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase||!user)return;setBusy(true);const form=new FormData(event.currentTarget);const payload=Object.fromEntries(Object.keys(defaultCompany).map(key=>[key,String(form.get(key)||'').trim()]));const result=await run(supabase.from('company_profile').update({...payload,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',true).select('id').single());if(!result.ok)setError(messageFor(result.error,lang));else{setSettings(false);feedback(tr(lang,'تم حفظ بيانات ريّد.','Reid company details saved.'));await load();}setBusy(false);};
  const change=async(row:FinanceRow,status:string)=>{if(!supabase)return;if(!window.confirm(tr(lang,`تأكيد تغيير حالة «${row.title}»؟`,`Confirm status change for “${row.title}”?`)))return;setBusy(true);const result=await run(supabase.from('finance_documents').update({status}).eq('id',row.id).select('id').single());if(!result.ok)setError(messageFor(result.error,lang));else{feedback(tr(lang,'تم تحديث المستند وتوثيق حالته.','Document status updated and recorded.'));await load();}setBusy(false);};
  const cash=(value:number,currency='OMR')=>new Intl.NumberFormat(lang==='ar'?'ar-OM':'en-OM',{style:'currency',currency}).format(Number(value)||0);
  const local=rows.filter(row=>row.currency==='OMR');
  return <main className="os-page os-finance"><div className="os-page-heading"><div><span className="os-eyebrow">REID / FINANCE</span><h1>{tr(lang,'وضوح في كل مبلغ.','Clarity in every amount.')}</h1><p>{tr(lang,'بنود دقيقة، اعتماد محكوم، ونسخة ثابتة لكل مستند صادر.','Precise line items, governed approval, and an immutable copy of every issued document.')}</p></div><div className="os-heading-actions"><button className="os-secondary" onClick={()=>go('business')}><ArrowUpRight/>{tr(lang,'دورة العمل والتحصيل','Business flow & collection')}</button><button className="os-secondary" onClick={()=>setSettings(true)}><Settings2/>{tr(lang,'بيانات ريّد','Reid details')}</button><button className="os-primary" onClick={()=>setEditing('new')}><Plus/>{tr(lang,'مستند جديد','New document')}</button></div></div>
    {error&&<p className="os-alert" role="alert">{error}</p>}{message&&<p className="os-success" role="status">{message}</p>}
    <div className="os-metrics">{[[tr(lang,'فواتير مستحقة · OMR','Receivable · OMR'),local.filter(row=>row.kind==='invoice'&&!['paid','void'].includes(row.status)).reduce((sum,row)=>sum+Number(row.amount)-Number(row.paid_amount||0),0)],[tr(lang,'تحصيل مسجل · OMR','Recorded receipts · OMR'),local.filter(row=>row.kind==='invoice').reduce((sum,row)=>sum+Number(row.paid_amount||0),0)],[tr(lang,'ضريبة مستندات صادرة · OMR','Issued document tax · OMR'),local.filter(row=>!['draft','void'].includes(row.status)).reduce((sum,row)=>sum+Number(row.tax_amount||0),0)],[tr(lang,'مصروفات مدفوعة · OMR','Paid expenses · OMR'),local.filter(row=>row.kind==='expense'&&row.status==='paid').reduce((sum,row)=>sum+Number(row.amount),0)]].map(([label,value],index)=><section key={index}><span><Wallet/><small>{label}</small></span><b>{busy?'—':cash(Number(value))}</b></section>)}</div>
    <p className="os-muted">{tr(lang,'الملخص لآخر 200 مستند وبالريال العُماني فقط. الفواتير المرتبطة بالعمل تُحصّل من دورة العمل؛ وحساب الضريبة هنا ليس إقرارًا ضريبيًا.','Summary covers the latest 200 documents in OMR only. Business-linked invoices are collected from Business Flow; tax shown here is not a VAT return.')}</p>
    <div className="os-tabs">{([['invoice','الفواتير','Invoices'],['quote','عروض الأسعار','Quotes'],['expense','المصروفات','Expenses']] as const).map(([key,ar,en])=><button key={key} aria-pressed={kind===key} onClick={()=>setKind(key)}>{tr(lang,ar,en)}</button>)}</div>
    <section className="os-panel"><div className="os-section-title"><h2>{kindNames(lang)[kind]}</h2><button onClick={()=>void load()} disabled={busy}><RefreshCw/>{tr(lang,'تحديث','Refresh')}</button></div>
      {rows.filter(row=>row.kind===kind).map(row=><div className="os-record os-finance-record" key={row.id}><span className="os-icon"><FileText/></span><div><small>REID-{String(row.number).padStart(5,'0')} · {statusNames(lang)[row.status]}</small><b>{row.title}</b><p>{row.counterparty}{row.due_date?` · ${tr(lang,'الاستحقاق','Due')} ${row.due_date}`:''}{row.valid_until?` · ${tr(lang,'صالح إلى','Valid until')} ${row.valid_until}`:''}{row.kind==='invoice'&&Number(row.paid_amount)>0?` · ${tr(lang,'محصّل','Collected')} ${cash(row.paid_amount,row.currency)}`:''}</p></div><strong>{cash(row.amount,row.currency)}</strong><div className="os-document-actions"><button className="os-secondary" onClick={()=>setViewing(row)}><Printer/>{tr(lang,'عرض وطباعة','View & print')}</button>{row.status==='draft'&&<button className="os-secondary" onClick={()=>setEditing(row)}><FilePenLine/>{tr(lang,'تعديل','Edit')}</button>}<select aria-label={tr(lang,'حالة المستند','Document status')} value={row.status} disabled={['paid','void'].includes(row.status)} onChange={event=>void change(row,event.target.value)}>{[row.status,...(row.status==='draft'?['issued','void']:row.status==='issued'?['approved',...(row.kind==='expense'?['paid']:[]),'void']:row.status==='approved'?[...(row.kind==='expense'?['paid']:[]),'void']:[])].map(status=><option key={status} value={status}>{statusNames(lang)[status]}</option>)}</select></div></div>)}
      {!rows.some(row=>row.kind===kind)&&<div className="os-empty"><FileText/><h3>{busy?tr(lang,'جارٍ التحميل…','Loading…'):tr(lang,'مستنداتك تبدأ هنا','Your documents start here')}</h3><p>{tr(lang,'أنشئ المستند ببنوده، ثم راجعه وأصدره واطبعه.','Create the document with line items, then review, issue, and print it.')}</p></div>}
    </section>
    {editing&&<DocumentEditor lang={lang} row={editing==='new'?null:editing} initialKind={kind} close={()=>setEditing(null)} saved={async text=>{setEditing(null);feedback(text);await load();}}/>}
    {viewing&&<DocumentPreview lang={lang} row={viewing} company={company} close={()=>setViewing(null)} cash={cash}/>} 
    {settings&&<CompanySettings lang={lang} profile={company} close={()=>setSettings(false)} save={saveProfile} busy={busy}/>} 
  </main>;
}

function DocumentEditor({lang,row,initialKind,close,saved}:{lang:Lang;row:FinanceRow|null;initialKind:FinanceRow['kind'];close:()=>void;saved:(message:string)=>Promise<void>;}){
  const [lines,setLines]=React.useState<CommercialLine[]>(toEditorLines(row?.line_items,row?.amount,row?.title));
  const [docKind,setDocKind]=React.useState<FinanceRow['kind']>(row?.kind||initialKind),[currency,setCurrency]=React.useState(row?.currency||'OMR'),[discount,setDiscount]=React.useState(Number(row?.discount_amount)||0),[taxRate,setTaxRate]=React.useState(Number(row?.tax_rate)||0),[saving,setSaving]=React.useState(false),[error,setError]=React.useState('');
  const totals=documentTotals(lines,discount,taxRate);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase)return;if(lines.some(line=>!line.description.trim())){setError(tr(lang,'أكمل وصف كل بند.','Complete every line description.'));return;}if(discount>totals.subtotal){setError(tr(lang,'الخصم أكبر من الإجمالي قبل الضريبة.','Discount exceeds the pre-tax subtotal.'));return;}setSaving(true);const form=new FormData(event.currentTarget);const args={document_title:String(form.get('title')),document_counterparty:String(form.get('counterparty')),document_currency:currency,document_items:linePayload(lines),document_discount:discount,document_tax_rate:taxRate,document_due_date:String(form.get('due')||'')||null,document_valid_until:String(form.get('valid_until')||'')||null,document_notes:String(form.get('notes')||'')};const result=row?await run(supabase.rpc('update_finance_draft',{wanted_document:row.id,...args})):await run(supabase.rpc('create_finance_draft',{document_kind:String(form.get('kind')),...args}));if(!result.ok)setError(messageFor(result.error,lang));else await saved(tr(lang,'تم حفظ المسودة وحساب الإجماليات.','Draft saved and totals calculated.'));setSaving(false);};
  const defaultFuture=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  return <Modal lang={lang} title={row?tr(lang,'تعديل المسودة','Edit draft'):tr(lang,'مستند تجاري جديد','New commercial document')} close={close} wide><form onSubmit={event=>void submit(event)}>
    {error&&<p className="os-alert" role="alert">{error}</p>}
    <div className="os-form-row"><label>{tr(lang,'نوع المستند','Document type')}<select name="kind" value={docKind} onChange={event=>setDocKind(event.target.value as FinanceRow['kind'])} disabled={!!row}>{(['quote','invoice','expense'] as const).map(value=><option value={value} key={value}>{kindNames(lang)[value]}</option>)}</select></label><label>{tr(lang,'العملة','Currency')}<select value={currency} onChange={event=>setCurrency(event.target.value)}>{['OMR','USD','AED','EUR'].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <label>{tr(lang,'العنوان','Title')}<input name="title" defaultValue={row?.title||''} required maxLength={250} autoFocus/></label><label>{tr(lang,'العميل أو المورد','Customer or supplier')}<input name="counterparty" defaultValue={row?.counterparty||''} required maxLength={250}/></label>
    <LineItemsEditor lang={lang} lines={lines} setLines={setLines} currency={currency}/>
    <div className="os-form-row"><label>{tr(lang,'الخصم','Discount')}<input type="number" min="0" max={totals.subtotal} step="0.001" value={discount} onChange={event=>setDiscount(Number(event.target.value))}/></label><label>{tr(lang,'الضريبة %','Tax %')}<input type="number" min="0" max="100" step="0.001" value={taxRate} onChange={event=>setTaxRate(Number(event.target.value))}/></label></div>
    {docKind==='quote'?<label>{tr(lang,'صلاحية عرض السعر','Quote valid until')}<input name="valid_until" type="date" defaultValue={row?.valid_until||defaultFuture(14)}/></label>:<label>{tr(lang,'تاريخ الاستحقاق','Due date')}<input name="due" type="date" defaultValue={row?.due_date||defaultFuture(30)}/></label>}
    <label>{tr(lang,'ملاحظات وشروط','Notes and terms')}<textarea name="notes" defaultValue={row?.notes||''} maxLength={3000}/></label>
    <div className="os-document-totals"><span>{tr(lang,'الإجمالي الفرعي','Subtotal')}<b>{totals.subtotal.toFixed(3)} {currency}</b></span><span>{tr(lang,'بعد الخصم','After discount')}<b>{totals.net.toFixed(3)} {currency}</b></span><span>{tr(lang,'الضريبة','Tax')}<b>{totals.tax.toFixed(3)} {currency}</b></span><span className="total">{tr(lang,'الإجمالي','Total')}<b>{totals.total.toFixed(3)} {currency}</b></span></div>
    <button className="os-primary" disabled={saving}>{tr(lang,'حفظ كمسودة','Save draft')}</button>
  </form></Modal>;
}

function DocumentPreview({lang,row,company,close,cash}:{lang:Lang;row:FinanceRow;company:CompanyProfile;close:()=>void;cash:(value:number,currency?:string)=>string}){
  const seller=Object.keys(row.seller_snapshot||{}).length?row.seller_snapshot:company;
  const customer=Object.keys(row.counterparty_snapshot||{}).length?row.counterparty_snapshot:{name:row.counterparty};
  return <Modal lang={lang} title={tr(lang,'معاينة المستند','Document preview')} close={close} wide><div className="os-print-toolbar"><span>{row.status==='draft'?tr(lang,'معاينة مسودة — غير صالحة كمستند صادر','Draft preview — not an issued document'):tr(lang,'نسخة ثابتة من المستند الصادر','Immutable issued-document copy')}</span><button className="os-primary" onClick={()=>window.print()}><Printer/>{tr(lang,'طباعة / حفظ PDF','Print / Save PDF')}</button></div><article className="os-document-sheet" dir={lang==='ar'?'rtl':'ltr'}>
    <header><img src={reidLogo} alt="Reid"/><div><h2>{lang==='ar'?(seller.trade_name_ar||'ريّد'):(seller.trade_name_en||'Reid')}</h2><p>{lang==='ar'?(seller.legal_name_ar||seller.legal_name_en):(seller.legal_name_en||seller.legal_name_ar)}</p><small>{[seller.cr_number&&`${tr(lang,'س.ت','CR')} ${seller.cr_number}`,seller.vat_number&&`${tr(lang,'الرقم الضريبي','VATIN')} ${seller.vat_number}`].filter(Boolean).join(' · ')}</small></div><div className="os-document-identity"><span>{kindNames(lang)[row.kind]}</span><b>REID-{String(row.number).padStart(5,'0')}</b><small>{row.document_date}</small></div></header>
    <section className="os-document-parties"><div><small>{tr(lang,'من','From')}</small><b>{lang==='ar'?(seller.legal_name_ar||seller.trade_name_ar):(seller.legal_name_en||seller.trade_name_en)}</b><p>{lang==='ar'?(seller.address_ar||seller.address_en):(seller.address_en||seller.address_ar)}</p><p>{[seller.email,seller.phone,seller.website].filter(Boolean).join(' · ')}</p></div><div><small>{tr(lang,'إلى','Bill to')}</small><b>{customer.name||row.counterparty}</b><p>{customer.address}</p><p>{[customer.email,customer.phone].filter(Boolean).join(' · ')}</p></div></section>
    <h1>{row.title}</h1><div className="os-document-dates">{row.due_date&&<span>{tr(lang,'الاستحقاق','Due')}<b>{row.due_date}</b></span>}{row.valid_until&&<span>{tr(lang,'صالح إلى','Valid until')}<b>{row.valid_until}</b></span>}<span>{tr(lang,'الحالة','Status')}<b>{statusNames(lang)[row.status]}</b></span></div>
    <table><thead><tr><th>{tr(lang,'الوصف','Description')}</th><th>{tr(lang,'الكمية','Qty')}</th><th>{tr(lang,'سعر الوحدة','Unit price')}</th><th>{tr(lang,'الإجمالي','Total')}</th></tr></thead><tbody>{row.line_items.map((line,index)=><tr key={index}><td>{line.description}</td><td>{Number(line.quantity).toFixed(3)}</td><td>{cash(line.unit_price,row.currency)}</td><td>{cash(Number(line.quantity)*Number(line.unit_price),row.currency)}</td></tr>)}</tbody></table>
    <section className="os-sheet-summary"><span>{tr(lang,'الإجمالي الفرعي','Subtotal')}<b>{cash(row.subtotal,row.currency)}</b></span>{Number(row.discount_amount)>0&&<span>{tr(lang,'الخصم','Discount')}<b>- {cash(row.discount_amount,row.currency)}</b></span>}<span>{tr(lang,`الضريبة ${row.tax_rate}%`,`Tax ${row.tax_rate}%`)}<b>{cash(row.tax_amount,row.currency)}</b></span><span>{tr(lang,'المبلغ الإجمالي','Grand total')}<b>{cash(row.amount,row.currency)}</b></span>{row.kind==='invoice'&&Number(row.paid_amount)>0&&<><span>{tr(lang,'المحصل','Collected')}<b>{cash(row.paid_amount,row.currency)}</b></span><span>{tr(lang,'المتبقي','Balance')}<b>{cash(row.amount-row.paid_amount,row.currency)}</b></span></>}</section>
    {row.notes&&<section className="os-document-notes"><small>{tr(lang,'الملاحظات والشروط','Notes and terms')}</small><p>{row.notes}</p></section>}
    {(seller.bank_name||seller.iban)&&<footer><Building2/><div><b>{tr(lang,'بيانات التحويل','Payment details')}</b><p>{[seller.bank_name,seller.account_name,seller.iban].filter(Boolean).join(' · ')}</p></div></footer>}
  </article></Modal>;
}

function CompanySettings({lang,profile,close,save,busy}:{lang:Lang;profile:CompanyProfile;close:()=>void;save:(event:React.FormEvent<HTMLFormElement>)=>Promise<void>;busy:boolean}){
  const field=(name:keyof CompanyProfile,label:string)=><label>{label}<input name={name} defaultValue={profile[name]} maxLength={500}/></label>;
  return <Modal lang={lang} title={tr(lang,'بيانات ريّد على المستندات','Reid document identity')} close={close} wide><form onSubmit={event=>void save(event)}><p className="os-muted">{tr(lang,'تظهر هذه البيانات في المستندات الجديدة فقط. المستندات الصادرة سابقًا تبقى كما كانت.','These details appear on new documents only. Previously issued documents remain unchanged.')}</p><div className="os-form-row">{field('trade_name_ar','الاسم التجاري · AR')}{field('trade_name_en','Trade name · EN')}</div><div className="os-form-row">{field('legal_name_ar','الاسم القانوني · AR')}{field('legal_name_en','Legal name · EN')}</div><div className="os-form-row">{field('cr_number',tr(lang,'رقم السجل التجاري','CR number'))}{field('vat_number',tr(lang,'الرقم الضريبي','VAT number'))}</div><div className="os-form-row">{field('email',tr(lang,'البريد','Email'))}{field('phone',tr(lang,'الهاتف','Phone'))}</div><div className="os-form-row">{field('website',tr(lang,'الموقع','Website'))}{field('bank_name',tr(lang,'البنك','Bank'))}</div><div className="os-form-row">{field('account_name',tr(lang,'اسم الحساب','Account name'))}{field('iban','IBAN')}</div>{field('address_ar','العنوان · AR')}{field('address_en','Address · EN')}<button className="os-primary" disabled={busy}>{tr(lang,'حفظ البيانات','Save details')}</button></form></Modal>;
}

function Modal({lang,title,close,children,wide=false}:{lang:Lang;title:string;close:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="os-modal-backdrop"><section className={`os-modal ${wide?'os-modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="os-section-title os-no-print"><h2>{title}</h2><button type="button" onClick={close} aria-label={tr(lang,'إغلاق','Close')}><X/></button></div>{children}</section></div>;}

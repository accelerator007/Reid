import React from 'react';
import { Activity, Bot, Check, ChevronRight, CircleAlert, Clock3, FileCheck2, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserCog, UsersRound, X } from 'lucide-react';
import { decideRun } from './agents';
import { list, messageFor, run, toAppError } from './db';
import { localApi } from './local-api';
import type { Role } from './policy';
import type { Page } from './routes';
import { useSession } from './shell';
import { supabase } from './supabase';

type Lang='ar'|'en';
type Profile={id:string;full_name:string|null;email:string|null;department:string|null;position:string|null;updated_at:string|null};
type RoleRow={user_id:string;role:Role;created_at:string;granted_by:string|null};
type Control={user_id:string;status:'active'|'suspended'|'disabled';reason:string|null;changed_by:string|null;changed_at:string|null};
type Account=Profile&{roles:Role[];control:Control|null};
type Audit={id:number;actor_id:string|null;action:string;table_name:string;record_id:string|null;old_data:Record<string,unknown>|null;new_data:Record<string,unknown>|null;created_at:string};
type PendingRun={id:string;agent_id:string;approval_level:number;created_at:string;requested_by:string|null};
const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;
const allRoles:Role[]=['owner','super_admin','admin','hr','sales','employee','project_member','research_member','guest'];
const roleLabel:Record<Role,{ar:string;en:string}>={owner:{ar:'المالك',en:'Owner'},super_admin:{ar:'مدير أعلى',en:'Super Admin'},admin:{ar:'مدير',en:'Admin'},hr:{ar:'الموارد البشرية',en:'HR'},sales:{ar:'المبيعات',en:'Sales'},employee:{ar:'موظف',en:'Employee'},project_member:{ar:'عضو مشروع',en:'Project member'},research_member:{ar:'عضو أبحاث',en:'Research member'},guest:{ar:'ضيف',en:'Guest'}};
const permissions=[
  ['admin','مركز الإدارة','Administration','owner · super_admin','إدارة الحسابات والصلاحيات والحالة وسجل التغييرات.','Accounts, permissions, status, and the complete change trail.'],
  ['whatsapp','واتساب والاتصالات','WhatsApp & connections','owner','ربط الرقم، المحادثات، والتحكم بالمساعد.','Phone linking, inbox, and assistant control.'],
  ['finance','المالية','Finance','owner · super_admin','العروض والفواتير والمصروفات والسجل المالي.','Quotes, invoices, expenses, and financial records.'],
  ['people','الفريق والطلبات','People & applications','owner · super_admin · admin · hr','الموظفون، التهيئة، الإجازات وطلبات الانضمام.','People, onboarding, leave, and join applications.'],
  ['crm','العملاء والمبيعات','CRM & sales','owner · super_admin · admin · hr · sales','العملاء المحتملون والصفقات والمتابعات حسب النطاق.','Leads, deals, and follow-ups within role scope.'],
  ['projects','المشاريع والتشغيل','Projects & operations','all staff · scoped','المشاريع والمهام والسجلات بحسب العضوية والمسؤولية.','Projects, tasks, and records scoped by membership and responsibility.'],
  ['research','الأبحاث','Research','all staff · scoped','المشاريع البحثية والملفات والموافقات بحسب العضوية.','Research, files, and approvals scoped by membership.'],
  ['ai','الذكاء والوكلاء','AI & agents','owner · super_admin · admin','تشغيل الوكلاء؛ الإجراءات الحساسة تنتظر موافقة.','Run agents; sensitive actions wait for approval.'],
] as const;

const omitKeys=new Set(['updated_at','last_heartbeat']);
const syntheticEmail=/^(reid-browser-|reid-research-|reid\.research\.|reid\.qa\.|reid-os-qa-|admin-control-(owner|target)-)|^reid\.contact\.us\+reid-qa-/i;
function diffKeys(row:Audit){
  const keys=new Set([...Object.keys(row.old_data||{}),...Object.keys(row.new_data||{})]);
  return [...keys].filter(k=>!omitKeys.has(k)&&JSON.stringify(row.old_data?.[k])!==JSON.stringify(row.new_data?.[k]));
}
function cleanValue(key:string,value:unknown){
  if(/password|secret|token|credential|otp/i.test(key))return '[REDACTED]';
  if(value===null||value===undefined)return '—';
  const text=typeof value==='string'?value:JSON.stringify(value);
  return text.length>160?`${text.slice(0,157)}…`:text;
}

export function AdminWorkspace({lang,go}:{lang:Lang;go:(page:Page)=>void}){
  const {user,roles}=useSession();
  const [tab,setTab]=React.useState<'accounts'|'approvals'|'permissions'|'changes'>('accounts');
  const [accounts,setAccounts]=React.useState<Account[]>([]),[audits,setAudits]=React.useState<Audit[]>([]),[pending,setPending]=React.useState<PendingRun[]>([]);
  const [selected,setSelected]=React.useState<string|null>(null),[query,setQuery]=React.useState(''),[showInactive,setShowInactive]=React.useState(false),[reason,setReason]=React.useState(''),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(true),[error,setError]=React.useState(''),[lastLoaded,setLastLoaded]=React.useState<Date|null>(null);
  const [health,setHealth]=React.useState<{ai:boolean;whatsapp:string}|null>(null);
  const current=accounts.find(x=>x.id===selected)||null;
  const isOwner=roles.includes('owner');
  const canManageAccounts=isOwner||roles.includes('super_admin');
  const load=React.useCallback(async()=>{
    if(!supabase)return;setLoading(true);
    const [people,roleRows,controls,trail,runs]=await Promise.all([
      list<Profile>(supabase.from('profiles').select('id,full_name,email,department,position,updated_at').order('full_name')),
      list<RoleRow>(supabase.from('user_roles').select('user_id,role,created_at,granted_by')),
      list<Control>(supabase.from('account_controls').select('user_id,status,reason,changed_by,changed_at')),
      list<Audit>(supabase.from('audit_logs').select('id,actor_id,action,table_name,record_id,old_data,new_data,created_at').order('created_at',{ascending:false}).limit(200)),
      list<PendingRun>(supabase.from('agent_runs').select('id,agent_id,approval_level,created_at,requested_by').eq('approval_state','pending').order('created_at')),
    ]);
    const failure=[people,roleRows,controls,trail,runs].find(x=>!x.ok);
    if(failure&&!failure.ok)setError(messageFor(failure.error,lang));
    else {
      const rs=roleRows.ok?roleRows.data:[],cs=controls.ok?controls.data:[];
      setAccounts((people.ok?people.data:[]).map(p=>({...p,roles:rs.filter(r=>r.user_id===p.id).map(r=>r.role),control:cs.find(c=>c.user_id===p.id)||null})));
      setAudits(trail.ok?trail.data:[]);setPending(runs.ok?runs.data:[]);setError('');setLastLoaded(new Date());
    }
    setLoading(false);
  },[lang]);
  React.useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
  React.useEffect(()=>{
    if(!isOwner){setHealth(null);return;}
    Promise.all([localApi<{online:boolean}>('ai/health'),localApi<{connection:string}>('whatsapp/status')]).then(([ai,wa])=>setHealth({ai:ai.online,whatsapp:wa.connection})).catch(()=>setHealth({ai:false,whatsapp:'unavailable'}));
  },[isOwner,lastLoaded]);
  const manage=async(body:Record<string,unknown>,question:string)=>{
    if(!supabase||!window.confirm(question))return;setBusy(true);setError('');
    const {data,error}=await supabase.functions.invoke('manage-account',{body});
    if(error||data?.error)setError(messageFor(toAppError(error||new Error(data.error)),lang));
    else await load();setBusy(false);
  };
  const setRole=(account:Account,role:Role)=>{
    if(!reason.trim()){setError(tr(lang,'اكتب سبب تغيير الصلاحية أولًا.','Enter a reason for the permission change first.'));return Promise.resolve();}
    const enabled=!account.roles.includes(role);
    const question=tr(lang,`${enabled?'منح':'إزالة'} صلاحية «${roleLabel[role].ar}» لـ ${account.full_name||account.email}؟`,`Are you sure you want to ${enabled?'grant':'remove'} “${roleLabel[role].en}” for ${account.full_name||account.email}?`);
    return manage({action:'set_role',targetUserId:account.id,role,enabled,reason:reason.trim()||null},question);
  };
  const setStatus=(account:Account,status:Control['status'])=>{
    if(!reason.trim()){setError(tr(lang,'اكتب سبب تغيير حالة الحساب أولًا.','Enter a reason for the account status change first.'));return Promise.resolve();}
    return manage({action:'set_status',targetUserId:account.id,status,reason:reason.trim()||null},tr(lang,`تأكيد تغيير حالة ${account.full_name||account.email} إلى ${status}؟`,`Confirm changing ${account.full_name||account.email} to ${status}?`));
  };
  const decide=async(row:PendingRun,decision:'approved'|'rejected')=>{
    if(!window.confirm(tr(lang,decision==='approved'?'اعتماد هذا الإجراء؟':'رفض هذا الإجراء؟',decision==='approved'?'Approve this action?':'Reject this action?')))return;
    setBusy(true);setError('');try{await decideRun(row.id,decision,reason.trim()||undefined);await load();}catch(e){setError(messageFor(toAppError(e),lang));}finally{setBusy(false);}
  };
  const retiredIds=new Set(accounts.filter(x=>x.control?.reason==='Retired synthetic QA identity'||syntheticEmail.test(x.email||'')).map(x=>x.id));
  const businessAccounts=accounts.filter(x=>!retiredIds.has(x.id));
  const visibleAudits=audits.filter(x=>!x.record_id||!retiredIds.has(x.record_id));
  const names=new Map(businessAccounts.map(x=>[x.id,x.full_name||x.email||x.id.slice(0,8)]));
  const activeAccounts=businessAccounts.filter(x=>(x.control?.status||'active')==='active');
  const shown=businessAccounts.filter(x=>(showInactive||(x.control?.status||'active')==='active')&&`${x.full_name} ${x.email} ${x.department} ${x.roles.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="os-page os-admin"><div className="os-page-heading"><div><span className="os-eyebrow">REID / GOVERNANCE</span><h1>{tr(lang,'كل صلاحية. كل قرار. واضح.','Every permission. Every decision. Clear.')}</h1><p>{tr(lang,'مركز المالك لإدارة الوصول، اعتماد الإجراءات، ومراجعة التغييرات من مكان واحد.','The Owner control center for access, approvals, and a complete change trail.')}</p></div><button className="os-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw/>{tr(lang,'تحديث','Refresh')}</button></div>
    {error&&<p className="os-alert" role="alert">{error}</p>}
    <div className="os-admin-health"><section><UsersRound/><span><small>{tr(lang,'الحسابات النشطة','Active accounts')}</small><b>{loading?'—':activeAccounts.length}</b></span></section><section><FileCheck2/><span><small>{tr(lang,'موافقات معلقة','Pending approvals')}</small><b>{loading?'—':pending.length}</b></span></section><section><Bot/><span><small>ai-lap</small><b>{!health?'—':health.ai?tr(lang,'متصل','Online'):tr(lang,'متوقف','Offline')}</b></span></section><section><Activity/><span><small>WhatsApp QR</small><b>{!health?'—':health.whatsapp==='connected'?tr(lang,'متصل','Connected'):tr(lang,'بانتظار الربط','Awaiting link')}</b></span></section></div>
    <div className="os-tabs os-admin-tabs">{([['accounts','الحسابات','Accounts',businessAccounts.length],['approvals','الموافقات','Approvals',pending.length],['permissions','خريطة الصلاحيات','Permission map',permissions.length],['changes','سجل التغييرات','Change log',visibleAudits.length]] as const).map(([key,ar,en,count])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{tr(lang,ar,en)}<span>{count}</span></button>)}</div>
    {tab==='accounts'&&<div className="os-admin-layout"><section className="os-panel"><div className="os-account-filters"><label className="os-search"><Search/><input aria-label={tr(lang,'بحث الحسابات','Search accounts')} placeholder={tr(lang,'الاسم، البريد، القسم أو الصلاحية…','Name, email, department, or role…')} value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="os-secondary" aria-pressed={showInactive} onClick={()=>setShowInactive(value=>!value)}>{showInactive?tr(lang,'إخفاء المؤرشفة','Hide archived'):tr(lang,'عرض المؤرشفة','Show archived')}<span>{businessAccounts.length-activeAccounts.length}</span></button></div><div className="os-account-list">{shown.map(account=><button key={account.id} className={selected===account.id?'selected':''} onClick={()=>{setSelected(account.id);setReason(account.control?.reason||'');}}><span className="os-avatar">{(account.full_name||account.email||'?')[0]}</span><span><b>{account.full_name||tr(lang,'بدون اسم','No name')}</b><small>{account.email}</small><span className="os-chip-line">{account.roles.slice(0,3).map(r=><i key={r}>{lang==='ar'?roleLabel[r].ar:roleLabel[r].en}</i>)}</span></span><span className={`os-status ${(account.control?.status||'active')==='active'?'good':''}`}>{account.control?.status||'active'}</span><ChevronRight/></button>)}</div></section>
      <section className="os-panel os-account-inspector">{current?<><div className="os-panel-title"><span className="os-icon"><UserCog/></span><div><h2>{current.full_name||current.email}</h2><p>{current.position||current.department||tr(lang,'حساب شركة','Company account')}</p></div><button aria-label={tr(lang,'إغلاق','Close')} onClick={()=>setSelected(null)}><X/></button></div>{!canManageAccounts&&<p className="os-notice"><ShieldCheck/>{tr(lang,'وضع مراجعة للمدير: يمكنك رؤية الصلاحيات والسجل، وتبقى تغييرات الحسابات للمالك أو المدير الأعلى.','Admin review mode: you can inspect permissions and the audit trail; account changes remain Owner or Super Admin actions.')}</p>}<label>{tr(lang,'سبب التغيير أو الملاحظة','Change reason or note')}<textarea value={reason} maxLength={300} onChange={e=>setReason(e.target.value)} placeholder={tr(lang,'مطلوب ويوثّق مع التغيير…','Required and recorded with the change…')}/></label><h3>{tr(lang,'الصلاحيات','Permissions')}</h3><div className="os-role-grid">{allRoles.map(role=>{const enabled=current.roles.includes(role),protectedRole=!canManageAccounts||current.id===user?.id||role==='owner'||(role==='super_admin'&&!isOwner);return <button key={role} aria-pressed={enabled} disabled={busy||protectedRole} onClick={()=>void setRole(current,role)}><span>{enabled?<Check/>:null}</span>{lang==='ar'?roleLabel[role].ar:roleLabel[role].en}</button>;})}</div><h3>{tr(lang,'حالة الحساب','Account status')}</h3><div className="os-status-actions">{(['active','suspended','disabled'] as const).map(status=><button key={status} aria-pressed={(current.control?.status||'active')===status} disabled={busy||!canManageAccounts||status===(current.control?.status||'active')||current.id===user?.id||current.roles.includes('owner')||(current.roles.includes('super_admin')&&!isOwner)} onClick={()=>void setStatus(current,status)}>{status}</button>)}</div>{(current.id===user?.id||current.roles.includes('owner'))&&<p className="os-notice"><ShieldCheck/>{tr(lang,'حساب المالك محمي من التعطيل وإزالة صلاحية المالك. نقل الملكية يحتاج إجراءً آمنًا مستقلًا.','Owner accounts are protected from suspension and Owner-role removal. Ownership transfer requires a separate secure process.')}</p>}</>:<div className="os-empty"><UserCog/><h2>{tr(lang,'اختر حسابًا','Select an account')}</h2><p>{tr(lang,'راجع صلاحياته وحالته، وكل تعديل سيظهر في سجل التغييرات.','Review permissions and status. Every update appears in the change log.')}</p></div>}</section></div>}
    {tab==='approvals'&&<section className="os-panel">{pending.map(row=><article className="os-approval" key={row.id}><span className="os-icon"><Clock3/></span><div><b>{row.agent_id}</b><p>{tr(lang,`إجراء ينتظر موافقة مستوى L${row.approval_level}.`,`An action is awaiting L${row.approval_level} approval.`)}</p><small>{names.get(row.requested_by||'')||tr(lang,'مستخدم معتمد','Authorized user')} · {new Date(row.created_at).toLocaleString(lang==='ar'?'ar-OM':'en-GB')}</small></div><div><button className="os-primary" disabled={busy} onClick={()=>void decide(row,'approved')}>{tr(lang,'اعتماد','Approve')}</button><button className="os-secondary" disabled={busy} onClick={()=>void decide(row,'rejected')}>{tr(lang,'رفض','Reject')}</button></div></article>)}{!pending.length&&<div className="os-empty"><FileCheck2/><h2>{tr(lang,'لا توجد موافقات معلقة','No pending approvals')}</h2><p>{tr(lang,'الإجراءات الحساسة ستظهر هنا قبل تنفيذها.','Sensitive actions will appear here before execution.')}</p></div>}<button className="os-text-link" onClick={()=>go('dashboard')}>{tr(lang,'افتح مركز الوكلاء والتشغيل','Open agent command center')}<ChevronRight/></button></section>}
    {tab==='permissions'&&<section className="os-panel os-permission-map"><div className="os-notice"><ShieldCheck/><span>{tr(lang,'الواجهة توضّح الصلاحيات، لكن قاعدة البيانات وسياسات RLS هي الحاجز الأمني النهائي.','The interface explains access; database RLS policies remain the final security boundary.')}</span></div>{permissions.map(([key,ar,en,access,descAr,descEn])=><article key={key}><span className="os-icon"><SlidersHorizontal/></span><div><h3>{tr(lang,ar,en)}</h3><p>{tr(lang,descAr,descEn)}</p></div><code dir="ltr">{access}</code></article>)}</section>}
    {tab==='changes'&&<section className="os-panel os-audit"><div className="os-section-title"><div><h2>{tr(lang,'آخر 200 تغيير','Latest 200 changes')}</h2><p>{lastLoaded?tr(lang,`آخر تحديث ${lastLoaded.toLocaleTimeString('ar-OM')}`,`Last refreshed ${lastLoaded.toLocaleTimeString('en-GB')}`):''}</p></div></div>{visibleAudits.map(row=>{const keys=diffKeys(row);return <details key={row.id}><summary><span className="os-icon">{row.action==='DELETE'?<CircleAlert/>:<Activity/>}</span><span><b>{row.table_name} · {row.action}</b><small>{names.get(row.actor_id||'')||tr(lang,'خدمة النظام','System service')} · {new Date(row.created_at).toLocaleString(lang==='ar'?'ar-OM':'en-GB')}</small></span><span className="os-status">{keys.length} {tr(lang,'حقول','fields')}</span></summary><div className="os-audit-detail"><small>ID: {row.record_id||'—'}</small>{keys.map(key=><p key={key}><b>{key}</b><del>{cleanValue(key,row.old_data?.[key])}</del><ChevronRight/><ins>{cleanValue(key,row.new_data?.[key])}</ins></p>)}</div></details>})}{!visibleAudits.length&&<div className="os-empty"><Activity/><h2>{tr(lang,'لا توجد تغييرات ظاهرة','No visible changes')}</h2></div>}</section>}
  </main>;
}

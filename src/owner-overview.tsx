import React from 'react';
import { AlertTriangle, ArrowUpRight, Bot, CheckCircle2, Clock3, FolderKanban, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { messageFor, run, type AppError } from './db';
import type { Page } from './routes';
import { supabase } from './supabase';

type Lang='ar'|'en';
const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;
// The snapshot function still returns its historical commercial fields. Reid is
// run as an organising workspace without money, so only these are read.
type Snapshot={
  as_of:string;
  metrics:{active_people:number;active_projects:number};
  alerts:{overdue_tasks:number;pending_approvals:number;pending_applications:number;failed_agent_runs_7d:number};
  projects:{id:string;name:string;status:string;target_date:string|null;overdue_tasks:number;risk_count:number}[];
};

export function OwnerOverview({lang,go}:{lang:Lang;go:(page:Page)=>void}){
  const [snapshot,setSnapshot]=React.useState<Snapshot|null>(null),[error,setError]=React.useState<AppError|null>(null),[busy,setBusy]=React.useState(true);
  const load=React.useCallback(async()=>{if(!supabase)return;setBusy(true);const result=await run<Snapshot>(supabase.rpc('owner_company_snapshot'));if(result.ok&&result.data){setSnapshot(result.data);setError(null);}else if(!result.ok)setError(result.error);setBusy(false);},[]);
  React.useEffect(()=>{void load();},[load]);
  const alertRows=snapshot?[{key:'tasks',label:tr(lang,'مهام متأخرة','Overdue tasks'),detail:tr(lang,'تحتاج توزيع أو متابعة','Need ownership or follow-up'),value:snapshot.alerts.overdue_tasks,go:()=>go('projects')},{key:'approvals',label:tr(lang,'موافقات معلّقة','Pending approvals'),detail:tr(lang,'قرارات الوكلاء بانتظارك','Agent decisions waiting'),value:snapshot.alerts.pending_approvals,go:()=>go('admin')},{key:'applications',label:tr(lang,'طلبات انضمام','Join applications'),detail:tr(lang,'تحتاج قرارًا من الإدارة','Need a management decision'),value:snapshot.alerts.pending_applications,go:()=>go('workspace')},{key:'agents',label:tr(lang,'تشغيلات وكيل فشلت خلال 7 أيام','Agent failures in 7 days'),detail:tr(lang,'راجع السبب قبل الإعادة','Review before retrying'),value:snapshot.alerts.failed_agent_runs_7d,go:()=>go('dashboard')}]:[];
  const count=(value:number|undefined)=>busy?'—':String(value||0);
  return <main className="os-page os-owner"><div className="os-page-heading"><div><span className="os-eyebrow">REID / OWNER BRIEF</span><h1>{tr(lang,'الشركة في صورة واحدة.','The company in one view.')}</h1><p>{tr(lang,'الناس والمشاريع، وما يحتاج قرارك الآن.','People, projects, and what needs your decision now.')}</p></div><div className="os-heading-actions"><button className="os-secondary" onClick={()=>go('admin')}><ShieldCheck/>{tr(lang,'الإدارة والصلاحيات','Admin & permissions')}</button><button className="os-primary" disabled={busy} onClick={()=>void load()}><RefreshCw/>{tr(lang,'تحديث','Refresh')}</button></div></div>
    {error&&<p className="os-alert" role="alert">{messageFor(error,lang)}</p>}
    <div className="os-owner-metrics"><Metric icon={<FolderKanban/>} label={tr(lang,'مشاريع نشطة','Active projects')} value={count(snapshot?.metrics.active_projects)} note={tr(lang,`${snapshot?.alerts.overdue_tasks||0} مهمة متأخرة`,`${snapshot?.alerts.overdue_tasks||0} overdue tasks`)} risk={!!snapshot?.alerts.overdue_tasks}/><Metric icon={<UsersRound/>} label={tr(lang,'حسابات شركة نشطة','Active company accounts')} value={count(snapshot?.metrics.active_people)} note={tr(lang,'دون الضيوف والحسابات المعطلة','Excludes guests and disabled accounts')}/><Metric icon={<CheckCircle2/>} label={tr(lang,'موافقات بانتظارك','Waiting for approval')} value={count(snapshot?.alerts.pending_approvals)} note={tr(lang,'أوامر الوكلاء قبل التنفيذ','Agent actions before they run')} risk={!!snapshot?.alerts.pending_approvals}/><Metric icon={<Bot/>} label={tr(lang,'أعطال الوكلاء (7 أيام)','Agent failures (7 days)')} value={count(snapshot?.alerts.failed_agent_runs_7d)} note={tr(lang,'من سجل التشغيل الفعلي','From the real run ledger')} risk={!!snapshot?.alerts.failed_agent_runs_7d}/></div>
    <div className="os-owner-grid"><section className="os-panel"><div className="os-section-title"><h2>{tr(lang,'يحتاج قرارك','Needs your decision')}</h2><span className={`os-status ${alertRows.some(row=>row.value)?'risk':'good'}`}>{alertRows.filter(row=>row.value).length}</span></div><div className="os-owner-alerts">{alertRows.filter(row=>row.value).map(row=><button key={row.key} onClick={row.go}><span><AlertTriangle/></span><div><b>{row.label}</b><small>{row.detail}</small></div><strong>{row.value}</strong><ArrowUpRight/></button>)}{snapshot&&!alertRows.some(row=>row.value)&&<div className="os-empty"><CheckCircle2/><h3>{tr(lang,'لا شيء حرج الآن','Nothing critical right now')}</h3><p>{tr(lang,'كل المؤشرات العاجلة ضمن السيطرة.','All urgent indicators are under control.')}</p></div>}</div></section>
      <section className="os-panel"><div className="os-section-title"><h2>{tr(lang,'المشاريع المحتاجة متابعة','Projects needing attention')}</h2><button onClick={()=>go('projects')}>{tr(lang,'المشاريع','Projects')}<ArrowUpRight/></button></div><div className="os-owner-list">{snapshot?.projects.map(row=><button key={row.id} onClick={()=>{go('projects');history.replaceState({},'',`/projects/${row.id}`);dispatchEvent(new PopStateEvent('popstate'));}}><span className={`os-icon ${row.risk_count||row.overdue_tasks?'risk':''}`}><FolderKanban/></span><div><b>{row.name}</b><small>{row.target_date?`${tr(lang,'الهدف','Target')} ${row.target_date}`:tr(lang,'لا يوجد موعد مستهدف','No target date')}</small></div><strong>{row.risk_count?tr(lang,`${row.risk_count} مؤشر خطر`,`${row.risk_count} at-risk KPI`):row.overdue_tasks?tr(lang,`${row.overdue_tasks} مهمة متأخرة`,`${row.overdue_tasks} overdue tasks`):tr(lang,'على المسار','On track')}</strong></button>)}{snapshot&&!snapshot.projects.length&&<p className="os-muted">{tr(lang,'لا توجد مشاريع نشطة.','No active projects.')}</p>}</div></section>
    </div>
    {snapshot&&<p className="os-owner-asof"><Clock3/>{tr(lang,'آخر تحديث','Last updated')} {new Date(snapshot.as_of).toLocaleString(lang==='ar'?'ar-OM':'en-OM',{timeZone:'Asia/Muscat'})}</p>}
  </main>;
}

function Metric({icon,label,value,note,risk=false}:{icon:React.ReactNode;label:string;value:string;note:string;risk?:boolean}){return <section className={risk?'risk':''}><span>{icon}<small>{label}</small></span><b>{value}</b><p>{note}</p></section>;}

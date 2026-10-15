import React from 'react';
import {
  Activity, Bot, CheckCircle2, CircleAlert, Clock3, Cpu, Database, Gauge,
  HardDrive, MessageCircle, Mic2, RefreshCw, Server, Settings2, Wifi,
} from 'lucide-react';
import type { ProviderRow, RunnerStatusRow } from '../agents';
import type { Page } from '../routes';
import { Badge, Button, Card, InlineAlert, SectionHeader, Skeleton, StatCard } from '../ui';
import type { HostTelemetry, OperationsSnapshot, ServiceHealth } from './api';
import { ageLabel, runnerHealth, type Lang } from './model';
import { RuntimeHealth } from './runtime-health';

const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;
const bounded=(value:number|null)=>value==null?null:Math.max(0,Math.min(100,value));
const percent=(used:number|null,total:number|null)=>used!=null&&total?bounded(Math.round(used/total*100)):null;
const number=(value:number|null,lang:Lang,digits=0)=>value==null?'—':new Intl.NumberFormat(lang==='ar'?'ar-OM-u-nu-latn':'en-GB',{maximumFractionDigits:digits}).format(value);
const stamp=(value:string|null|undefined,lang:Lang)=>value?new Date(value).toLocaleString(lang==='ar'?'ar-OM-u-nu-latn':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Muscat'}):'—';

const serviceLabels:Record<keyof OperationsSnapshot['components'],{ar:string;en:string;place:{ar:string;en:string};icon:React.ReactNode}>={
  website:{ar:'الموقع العام',en:'Public website',place:{ar:'سيرفر Reid',en:'Reid server'},icon:<Wifi/>},
  database:{ar:'قاعدة البيانات',en:'Database',place:{ar:'Supabase',en:'Supabase'},icon:<Database/>},
  whatsapp:{ar:'واتساب',en:'WhatsApp',place:{ar:'سيرفر Reid',en:'Reid server'},icon:<MessageCircle/>},
  tts:{ar:'الصوت',en:'Voice',place:{ar:'سيرفر Reid',en:'Reid server'},icon:<Mic2/>},
  ai:{ar:'واجهة الذكاء',en:'AI adapter',place:{ar:'ai-lap',en:'ai-lap'},icon:<Bot/>},
  runner:{ar:'منفّذ الوكلاء',en:'Agent runner',place:{ar:'ai-lap',en:'ai-lap'},icon:<Activity/>},
};
const serviceOrder:Array<keyof OperationsSnapshot['components']>=['website','database','whatsapp','tts','ai','runner'];

function healthTone(status:string|undefined):'success'|'warning'|'danger'|'neutral'{
  if(status==='healthy')return 'success';
  if(status==='degraded')return 'warning';
  if(status==='unavailable')return 'danger';
  return 'neutral';
}

function healthLabel(status:string|undefined,lang:Lang){
  if(status==='healthy')return tr(lang,'سليم','Healthy');
  if(status==='degraded')return tr(lang,'متباطئ','Degraded');
  if(status==='unavailable')return tr(lang,'متوقف','Unavailable');
  return tr(lang,'غير معروف','Unknown');
}

function Meter({icon,label,value,share}:{icon:React.ReactNode;label:string;value:string;share:number|null}){
  return <div className="infra-meter"><span>{icon}{label}</span><b><bdi dir="ltr">{value}</bdi></b><i aria-hidden="true"><span style={{inlineSize:`${share??0}%`}} data-high={(share??0)>=85}/></i></div>;
}

function HostCard({lang,title,subtitle,online,telemetry,extra}:{lang:Lang;title:string;subtitle:string;online:boolean;telemetry:HostTelemetry|null;extra?:React.ReactNode}){
  const memory=percent(telemetry?.memoryUsedGb??null,telemetry?.memoryTotalGb??null);
  return <Card className="infra-host" data-online={online}>
    <div className="infra-host__head"><span><Server/></span><div><h2>{title}</h2><p><bdi dir="ltr">{subtitle}</bdi></p></div><Badge tone={online?'success':'danger'} dot>{online?tr(lang,'متصل','Online'):tr(lang,'غير متصل','Offline')}</Badge></div>
    <div className="infra-meters">
      <Meter icon={<Cpu/>} label={tr(lang,'المعالج','CPU')} value={telemetry?.cpuPercent==null?'—':`${number(telemetry.cpuPercent,lang,1)}%`} share={bounded(telemetry?.cpuPercent??null)}/>
      <Meter icon={<HardDrive/>} label={tr(lang,'الذاكرة','Memory')} value={telemetry?.memoryUsedGb==null?'—':`${number(telemetry.memoryUsedGb,lang,1)} / ${number(telemetry.memoryTotalGb,lang,1)} GB`} share={memory}/>
      {telemetry?.diskUsedPercent!=null&&<Meter icon={<HardDrive/>} label={tr(lang,'التخزين','Storage')} value={`${number(telemetry.diskUsedPercent,lang,1)}%`} share={bounded(telemetry.diskUsedPercent)}/>} 
      {extra}
    </div>
    <small>{tr(lang,'آخر قياس','Last sample')}: {telemetry?.lastSeenAt?ageLabel(Math.max(0,Math.round((Date.now()-new Date(telemetry.lastSeenAt).getTime())/1000)),lang):'—'}</small>
  </Card>;
}

function ServiceRow({lang,name,value}:{lang:Lang;name:keyof OperationsSnapshot['components'];value:ServiceHealth}){
  const item=serviceLabels[name];
  const detail=value.connection?value.connection:value.latencyMs!=null?`${value.latencyMs} ms`:item.place[lang];
  return <div className="infra-service"><span className={`infra-service__icon ui-tone--${healthTone(value.status)}`}>{item.icon}</span><span><b>{item[lang]}</b><small>{item.place[lang]}</small></span><span><Badge tone={healthTone(value.status)} dot>{healthLabel(value.status,lang)}</Badge><small><bdi dir="ltr">{detail}</bdi></small></span></div>;
}

export function InfrastructureDashboard({lang,snapshot,runner,providers,loading,error,now,onRefresh,onProviders,go}:{
  lang:Lang;snapshot:OperationsSnapshot|null;runner:RunnerStatusRow|null;providers:ProviderRow[];loading:boolean;error:string;now:number;
  onRefresh:()=>void;onProviders:()=>void;go?:(page:Page)=>void;
}){
  if(!snapshot&&loading)return <Skeleton lines={8}/>;
  const components=snapshot?.components;
  const serviceEntries=components?serviceOrder.map(name=>[name,components[name]] as [keyof OperationsSnapshot['components'],ServiceHealth]):[];
  const healthy=serviceEntries.filter(([,value])=>value.status==='healthy').length;
  const queueHealthy=snapshot?.queue.pending!=null&&snapshot.queue.failed===0&&snapshot.queue.uncertain===0;
  const alerts=serviceEntries.filter(([,value])=>value.status!=='healthy').length+(snapshot?.queue.failed??0)+(snapshot?.queue.uncertain??0);
  const overall=Boolean(snapshot&&healthy===serviceEntries.length&&queueHealthy);
  const ai=runnerHealth(runner,now);
  const localProvider=providers.find(provider=>provider.id==='ollama');
  return <div className="infra-dashboard">
    {error&&<InlineAlert action={<Button size="sm" onClick={onRefresh}>{tr(lang,'إعادة المحاولة','Retry')}</Button>}>{error}</InlineAlert>}
    <div className="infra-summary">
      <StatCard icon={overall?<CheckCircle2/>:<CircleAlert/>} label={tr(lang,'حالة النظام','System status')} value={overall?tr(lang,'سليم','Healthy'):tr(lang,'يحتاج متابعة','Needs attention')} tone={overall?'success':'danger'} hint={tr(lang,`آخر فحص ${stamp(snapshot?.checkedAt,lang)}`,`Checked ${stamp(snapshot?.checkedAt,lang)}`)}/>
      <StatCard icon={<Activity/>} label={tr(lang,'الخدمات السليمة','Healthy services')} value={`${healthy} / ${serviceEntries.length||6}`} tone={healthy===serviceEntries.length?'success':'warning'}/>
      <StatCard icon={<Clock3/>} label={tr(lang,'في الطابور','Queued work')} value={snapshot?.queue.pending??'—'} tone={(snapshot?.queue.pending??0)>0?'warning':'success'} hint={tr(lang,`${snapshot?.queue.failed??0} فاشلة · ${snapshot?.queue.uncertain??0} غير مؤكدة`,`${snapshot?.queue.failed??0} failed · ${snapshot?.queue.uncertain??0} uncertain`)}/>
      <StatCard icon={<CircleAlert/>} label={tr(lang,'تنبيهات التشغيل','Operational alerts')} value={alerts} tone={alerts?'danger':'success'} hint={alerts?tr(lang,'راجع الخدمة أو الطابور أدناه','Review the service or queue below'):tr(lang,'لا توجد أعطال ظاهرة','No visible failures')}/>
    </div>

    <section>
      <SectionHeader title={tr(lang,'الأجهزة','Hosts')} description={tr(lang,'موارد سيرفر الموقع وجهاز الذكاء في مقارنة واحدة.','Reid server and AI host resources in one comparison.')} action={<Button icon={<RefreshCw/>} busy={loading} onClick={onRefresh}>{tr(lang,'تحديث القياسات','Refresh metrics')}</Button>}/>
      <div className="infra-hosts">
        <HostCard lang={lang} title="Reid Server" subtitle="reidpro.com · Docker" online={Boolean(snapshot?.websiteHost.fresh&&components?.website.status==='healthy')} telemetry={snapshot?.websiteHost??null}/>
        <HostCard lang={lang} title="ai-lap" subtitle={`${runner?.model||localProvider?.chat_model||'gemma4:12b'}${runner?.version?` · v${runner.version}`:''}`} online={ai.online&&components?.ai.status==='healthy'} telemetry={snapshot?.host??null} extra={<>
          <Meter icon={<Gauge/>} label="GPU" value={runner?.gpu_utilization==null?'—':`${number(runner.gpu_utilization,lang)}%`} share={bounded(runner?.gpu_utilization??null)}/>
          <Meter icon={<HardDrive/>} label="VRAM" value={runner?.vram_used_mb==null?'—':`${number(runner.vram_used_mb/1024,lang,1)} / ${number((runner.vram_total_mb??0)/1024,lang,1)} GB`} share={ai.vram}/>
          <Meter icon={<Wifi/>} label={tr(lang,'زمن النموذج','Model latency')} value={runner?.adapter_latency_ms==null?'—':`${number(runner.adapter_latency_ms,lang)} ms`} share={runner?.adapter_latency_ms==null?null:bounded(runner.adapter_latency_ms/4)}/>
          <Meter icon={<Wifi/>} label={tr(lang,'اتصال السحابة','Cloud ping')} value={runner?.ping_ms==null?'—':`${number(runner.ping_ms,lang)} ms`} share={runner?.ping_ms==null?null:bounded(runner.ping_ms/4)}/>
        </>}/>
      </div>
    </section>

    <div className="infra-lower">
      <Card>
        <SectionHeader title={tr(lang,'الخدمات ومسار الطلب','Services and request path')} description={tr(lang,'الحالة الحية من نقطة دخول الموقع حتى النموذج والإرسال.','Live state from the public entry point through inference and delivery.')}/>
        <div className="infra-services">{serviceEntries.map(([name,value])=><ServiceRow key={name} lang={lang} name={name} value={value}/>)}</div>
      </Card>
      <Card>
        <SectionHeader title={tr(lang,'النشاط والتحكم','Activity and controls')} description={tr(lang,'آخر حركة وروابط الإعدادات المرتبطة، دون تكرارها داخل هذه اللوحة.','Recent activity and the related controls, without duplicating their settings here.')}/>
        <dl className="infra-activity">
          <div><dt>{tr(lang,'آخر رسالة واردة','Last inbound message')}</dt><dd>{stamp(snapshot?.activity.lastInboundAt,lang)}</dd></div>
          <div><dt>{tr(lang,'آخر رسالة صادرة','Last outbound message')}</dt><dd>{stamp(snapshot?.activity.lastOutboundAt,lang)}</dd></div>
          <div><dt>{tr(lang,'المودل المحلي','Local model')}</dt><dd><bdi dir="ltr">{runner?.model||localProvider?.chat_model||'—'}</bdi></dd></div>
          <div><dt>{tr(lang,'اتصال النموذج','Model connection')}</dt><dd>{localProvider?.enabled?tr(lang,'مفعّل','Enabled'):tr(lang,'متوقف','Off')}</dd></div>
        </dl>
        <div className="infra-actions"><Button icon={<Settings2/>} onClick={onProviders}>{tr(lang,'المودلات وAPI','Models & APIs')}</Button>{go&&<><Button variant="secondary" icon={<MessageCircle/>} onClick={()=>go('inbox')}>{tr(lang,'إدارة واتساب','WhatsApp control')}</Button><Button variant="secondary" icon={<Wifi/>} onClick={()=>go('connections')}>{tr(lang,'الاتصالات','Connections')}</Button></>}</div>
      </Card>
    </div>
    <RuntimeHealth lang={lang}/>
  </div>;
}

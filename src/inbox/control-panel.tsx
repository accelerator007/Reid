import React from 'react';
import { Activity, Bot, CircleAlert, Clock3, MessageCircle, PauseCircle, PlayCircle, Save, Settings2, ShieldCheck, Sparkles, UsersRound, Wifi } from 'lucide-react';
import type { Page } from '../routes';
import { localError } from '../local-api';
import { Badge, Button, Card, InlineAlert, SectionHeader, StatCard, Tabs } from '../ui';
import * as api from './api';
import { whatsappControlCounts, type AiHealth, type AssistantAction, type Chat, type Connection, type Lang, type OperationsHealth, type OutboxItem, type WhatsappSettings } from './model';
import './control-panel.css';

const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;

export function WhatsappControl({lang,go,status,chats,outbox,onChanged}:{
  lang:Lang; go:(page:Page)=>void; status:Connection|null; chats:Chat[]; outbox:OutboxItem[]; onChanged:()=>Promise<void>;
}) {
  const [saved,setSaved]=React.useState<WhatsappSettings|null>(null);
  const [draft,setDraft]=React.useState<WhatsappSettings|null>(null);
  const [ai,setAi]=React.useState<AiHealth|null>(null);
  const [operations,setOperations]=React.useState<OperationsHealth|null>(null);
  const [actions,setActions]=React.useState<AssistantAction[]>([]);
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [tab,setTab]=React.useState<'overview'|'agent'|'management'>('overview');
  const load=React.useCallback(async()=>{
    try{
      const [settings,health,ops,recent]=await Promise.all([api.loadSettings(),api.loadAiHealth(),api.loadOperationsHealth(),api.loadActions()]);
      setSaved(settings);setDraft(settings);setAi(health);setOperations(ops);setActions(recent.slice(0,6));setError('');
    }catch(thrown){setError(localError(thrown,lang));}
  },[lang]);
  React.useEffect(()=>{void load();},[load]);
  const counts=whatsappControlCounts(chats,outbox);
  const dirty=Boolean(saved&&draft&&JSON.stringify(saved)!==JSON.stringify(draft));
  const patch=<K extends keyof WhatsappSettings>(key:K,value:WhatsappSettings[K])=>setDraft(current=>current?{...current,[key]:value}:current);
  const save=async()=>{
    if(!draft||!dirty)return;setBusy('save');setError('');setNotice('');
    try{const next=await api.saveSettings(draft);setSaved(next);setDraft(next);setNotice(tr(lang,'تم حفظ إعدادات ريد وتطبيقها على الرسائل الجديدة.','Reid settings were saved and apply to new messages.'));}
    catch(thrown){setError(localError(thrown,lang));}finally{setBusy('');}
  };
  const bulk=async(mode:'active'|'human')=>{
    const question=mode==='active'?tr(lang,'تشغيل ريد في كل المحادثات؟','Enable Reid in every conversation?'):tr(lang,'إيقاف ريد واستلام كل المحادثات يدويًا؟','Pause Reid and take over every conversation?');
    if(!confirm(question))return;
    setBusy(mode);setError('');setNotice('');
    try{const result=await api.setAllModes(mode);await onChanged();setNotice(mode==='active'?tr(lang,`تم تشغيل ريد في ${result.count} محادثة.`,`Reid was enabled in ${result.count} conversations.`):tr(lang,`تم إيقاف ريد في ${result.count} محادثة وإلغاء ردوده المنتظرة.`,`Reid was paused in ${result.count} conversations and queued bot replies were cancelled.`));}
    catch(thrown){setError(localError(thrown,lang));}finally{setBusy('');}
  };
  const components=operations?.components||{};

  const tabItems=[
    {id:'overview' as const,label:tr(lang,'نظرة عامة','Overview'),icon:<Activity/>},
    {id:'agent' as const,label:tr(lang,'سلوك ريد','Reid behavior'),icon:<Bot/>},
    {id:'management' as const,label:tr(lang,'الإدارة والصلاحيات','Management & access'),icon:<UsersRound/>},
  ];
  return <div className="wa-control">
    {error&&<InlineAlert action={<Button size="sm" onClick={()=>void load()}>{tr(lang,'إعادة المحاولة','Retry')}</Button>}>{error}</InlineAlert>}
    {notice&&<InlineAlert tone="success">{notice}</InlineAlert>}
    <div className="wa-control__stats">
      <StatCard icon={<MessageCircle/>} label={tr(lang,'كل المحادثات','All chats')} value={counts.total} hint={tr(lang,`${counts.customers} عملاء`,`${counts.customers} customers`)} />
      <StatCard icon={<Bot/>} label={tr(lang,'ريد يرد','Reid replies')} value={counts.assistant} tone="brand" hint={tr(lang,`${counts.human} مع الفريق`,`${counts.human} with the team`)} />
      <StatCard icon={<Clock3/>} label={tr(lang,'بانتظار الإرسال','Waiting to send')} value={counts.queued} tone={counts.queued?'warning':'success'} />
      <StatCard icon={<CircleAlert/>} label={tr(lang,'تحتاج متابعة','Needs attention')} value={counts.failed} tone={counts.failed?'danger':'success'} />
    </div>
    <Tabs items={tabItems} value={tab} onChange={setTab} label={tr(lang,'أقسام تحكم واتساب','WhatsApp control sections')} dir={lang==='ar'?'rtl':'ltr'}/>
    {tab==='overview'&&<>
      <div className="wa-control__overview">
        <Card>
          <SectionHeader title={tr(lang,'تشغيل سريع','Quick control')} description={tr(lang,'قرار واحد واضح يطبّق على كل المحادثات ويسجّل في التدقيق.','One clear decision applied to every chat and recorded in the audit log.')} />
          <div className="wa-control__buttons"><Button icon={<PlayCircle/>} busy={busy==='active'} onClick={()=>void bulk('active')}>{tr(lang,'خلّ ريد يرد على الكل','Let Reid reply everywhere')}</Button><Button variant="danger" icon={<PauseCircle/>} busy={busy==='human'} onClick={()=>void bulk('human')}>{tr(lang,'استلام كل المحادثات','Take over all chats')}</Button></div>
        </Card>
        <Card>
          <SectionHeader title={tr(lang,'حالة النظام','System health')} description={tr(lang,'الخدمات التي يعتمد عليها الرد والإرسال.','Services used for replies and delivery.')} />
          <div className="wa-health-list"><Health label="WhatsApp" good={status?.connection==='connected'} detail={status?.connection||'unknown'}/><Health label={ai?.model||'AI'} good={Boolean(ai?.online)} detail={ai?.latencyMs!=null?`${ai.latencyMs} ms`:'—'}/>{Object.entries(components).filter(([name])=>!['whatsapp','ai'].includes(name)).map(([name,value])=><Health key={name} label={name} good={value.status==='healthy'} detail={value.status||'unknown'}/>)}</div>
        </Card>
      </div>
      <RecentActions lang={lang} actions={actions}/>
    </>}
    {tab==='agent'&&<AgentSettings lang={lang} draft={draft} dirty={dirty} busy={busy==='save'} patch={patch} save={save}/>} 
    {tab==='management'&&<Management lang={lang} go={go}/>} 
  </div>;
}

function AgentSettings({lang,draft,dirty,busy,patch,save}:{lang:Lang;draft:WhatsappSettings|null;dirty:boolean;busy:boolean;patch:<K extends keyof WhatsappSettings>(key:K,value:WhatsappSettings[K])=>void;save:()=>Promise<void>}){
  return <Card className="wa-control__settings"><SectionHeader title={tr(lang,'سلوك ريد في واتساب','Reid behavior in WhatsApp')} description={tr(lang,'إعدادات قليلة وواضحة تُطبّق فعليًا على الرسائل الجديدة.','A focused set of controls that apply to new messages.')} action={<Button variant="primary" icon={<Save/>} busy={busy} disabled={!dirty||!draft} onClick={()=>void save()}>{tr(lang,'حفظ التغييرات','Save changes')}</Button>} />
    {!draft?<div className="wa-control__loading"/>:<div className="wa-settings-form">
      <Toggle checked={draft.assistant_enabled} onChange={value=>patch('assistant_enabled',value)} title={tr(lang,'تشغيل ريد','Enable Reid')} description={tr(lang,'المفتاح الرئيسي لكل الردود التلقائية في الخاص والجروبات.','Master switch for automatic replies in direct chats and groups.')} />
      <Toggle checked={draft.customer_auto_reply} onChange={value=>patch('customer_auto_reply',value)} title={tr(lang,'الرد على العملاء','Reply to customers')} description={tr(lang,'أي رقم غير مربوط بموظف يُعامل كعميل بلا صلاحيات داخلية.','Every unlinked number is treated as a customer without internal access.')} />
      <Toggle checked={draft.customer_voice_enabled} onChange={value=>patch('customer_voice_enabled',value)} title={tr(lang,'فويس للعملاء','Customer voice replies')} description={tr(lang,'يسمح للعميل بطلب فويس، ويمكن جعله الوضع الافتراضي أدناه.','Lets customers request voice and enables voice as a default below.')} />
      <div className="wa-settings-row wa-settings-row--fields">
        <label><span>{tr(lang,'الرد الافتراضي','Default reply')}</span><select value={draft.customer_reply_mode} disabled={!draft.customer_voice_enabled} onChange={event=>patch('customer_reply_mode',event.target.value as WhatsappSettings['customer_reply_mode'])}><option value="text">{tr(lang,'كتابة','Text')}</option><option value="voice">{tr(lang,'فويس','Voice')}</option></select></label>
        <label><span>{tr(lang,'النبرة','Tone')}</span><select value={draft.customer_tone} onChange={event=>patch('customer_tone',event.target.value as WhatsappSettings['customer_tone'])}><option value="natural">{tr(lang,'طبيعية','Natural')}</option><option value="friendly">{tr(lang,'ودّية','Friendly')}</option><option value="professional">{tr(lang,'مهنية','Professional')}</option></select></label>
        <label><span>{tr(lang,'العربية','Arabic style')}</span><select value={draft.customer_dialect} onChange={event=>patch('customer_dialect',event.target.value as WhatsappSettings['customer_dialect'])}><option value="omani">{tr(lang,'عُماني خفيف','Light Omani')}</option><option value="auto">{tr(lang,'يطابق العميل','Match customer')}</option><option value="standard">{tr(lang,'عربية واضحة','Clear Arabic')}</option></select></label>
        <label><span>{tr(lang,'طول الرد','Reply length')}</span><select value={draft.response_length} onChange={event=>patch('response_length',event.target.value as WhatsappSettings['response_length'])}><option value="short">{tr(lang,'قصير','Short')}</option><option value="balanced">{tr(lang,'متوازن','Balanced')}</option><option value="detailed">{tr(lang,'مفصّل','Detailed')}</option></select></label>
      </div>
      <label className="wa-settings-text"><span>{tr(lang,'تعليماتك الخاصة','Your instructions')}</span><textarea rows={4} maxLength={2000} value={draft.custom_instructions} onChange={event=>patch('custom_instructions',event.target.value)} placeholder={tr(lang,'مثال: اسأل عن الميزانية بعد فهم المشروع، ولا تذكر الأسعار قبل تحويل العميل للفريق.','Example: ask about budget after understanding the project, and do not quote prices before a handoff.')} /><small>{draft.custom_instructions.length}/2000</small></label>
      <label className="wa-settings-text"><span>{tr(lang,'رسالة التعطل','Failure message')}</span><textarea rows={3} maxLength={500} value={draft.fallback_message} onChange={event=>patch('fallback_message',event.target.value)} /><small>{draft.fallback_message.length}/500</small></label>
    </div>}
  </Card>;
}

function Management({lang,go}:{lang:Lang;go:(page:Page)=>void}){
  return <div className="wa-management"><Card><SectionHeader title={tr(lang,'الإدارة والصلاحيات','Management & access')} description={tr(lang,'كل نوع إعداد في مكانه، بدون تكرار أو قوائم طويلة.','Each kind of control stays in one clear place.')} /><div className="wa-control__links"><button onClick={()=>go('connections')}><Wifi/><span><b>{tr(lang,'الأرقام والجروبات والصوت','Numbers, groups and voice')}</b><small>{tr(lang,'ربط الموظفين، صلاحياتهم، الذاكرة ووضع الجروبات.','Employee links, permissions, memory, and group modes.')}</small></span></button><button onClick={()=>go('dashboard')}><Settings2/><span><b>{tr(lang,'الوكيل والأدوات والموافقات','Agent, tools and approvals')}</b><small>{tr(lang,'النموذج، الأدوات الحساسة، مستويات الموافقة وسجل التشغيل.','Model, sensitive tools, approval levels, and run history.')}</small></span></button><button onClick={()=>go('assistant')}><Sparkles/><span><b>{tr(lang,'غرفة الوكلاء','Agent room')}</b><small>{tr(lang,'تكليف الوكلاء بالمنشن ومتابعة التنفيذ والردود.','Mention agents, assign work, and follow execution.')}</small></span></button></div></Card></div>;
}

function RecentActions({lang,actions}:{lang:Lang;actions:AssistantAction[]}){
  return <Card><SectionHeader title={tr(lang,'آخر عمليات ريد','Recent Reid actions')} description={tr(lang,'الإرسال والملفات والأوامر التي طلبها المستخدمون.','Sending, files, and commands requested by users.')} /><div className="wa-actions">{actions.length?actions.map(action=><article key={action.id}><span className="wa-action-icon"><Activity/></span><div><b>{action.preview||action.kind}</b><small>{action.recipient_name||action.kind} · {new Date(action.created_at).toLocaleString(lang==='ar'?'ar-OM-u-nu-latn':'en-GB')}</small>{action.output_summary&&<p>{action.output_summary}</p>}{action.error_code&&<p className="wa-action-error">{action.error_code}</p>}</div><Badge tone={action.status==='completed'?'success':action.status==='failed'?'danger':action.status==='pending'?'warning':'neutral'}>{action.status}</Badge></article>):<p className="wa-actions__empty">{tr(lang,'لا توجد عمليات حديثة.','No recent actions.')}</p>}</div></Card>;
}

function Toggle({checked,onChange,title,description}:{checked:boolean;onChange:(value:boolean)=>void;title:string;description:string}){
  return <label className="wa-toggle"><span><b>{title}</b><small>{description}</small></span><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><i aria-hidden="true"/></label>;
}

function Health({label,good,detail}:{label:string;good:boolean;detail:string}){
  return <div className="wa-health"><span className={good?'good':''}>{good?<ShieldCheck/>:<CircleAlert/>}</span><b>{label}</b><small>{detail}</small></div>;
}

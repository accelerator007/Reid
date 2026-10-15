import React from 'react';
import { Activity, BellRing, Bot, CheckCircle2, CircleAlert, Clock3, MessageCircle, PauseCircle, PlayCircle, Save, Settings2, ShieldCheck, Sparkles, UsersRound, Wifi } from 'lucide-react';
import type { Page } from '../routes';
import { localError } from '../local-api';
import { Badge, Button, Card, InlineAlert, SectionHeader, StatCard, Tabs } from '../ui';
import * as api from './api';
import { whatsappControlCounts, type AiHealth, type AssistantAction, type Chat, type Connection, type Lang, type OutboxItem, type WhatsappAccess, type WhatsappGroupAccess, type WhatsappHandoff, type WhatsappSettings, type WhatsappUserAccess } from './model';
import './control-panel.css';

const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;

export function WhatsappControl({lang,go,status,chats,outbox,onChanged}:{
  lang:Lang; go:(page:Page)=>void; status:Connection|null; chats:Chat[]; outbox:OutboxItem[]; onChanged:()=>Promise<void>;
}) {
  const [saved,setSaved]=React.useState<WhatsappSettings|null>(null);
  const [draft,setDraft]=React.useState<WhatsappSettings|null>(null);
  const [ai,setAi]=React.useState<AiHealth|null>(null);
  const [actions,setActions]=React.useState<AssistantAction[]>([]);
  const [access,setAccess]=React.useState<WhatsappAccess>({users:[],groups:[]});
  const [handoffs,setHandoffs]=React.useState<WhatsappHandoff[]>([]);
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [tab,setTab]=React.useState<'overview'|'agent'|'management'>('overview');
  const load=React.useCallback(async()=>{
    try{
      const [settings,health,recent,nextAccess,nextHandoffs]=await Promise.all([api.loadSettings(),api.loadAiHealth(),api.loadActions(),api.loadAccess(),api.loadHandoffs()]);
      setSaved(settings);setDraft(settings);setAi(health);setActions(recent.slice(0,6));setAccess(nextAccess);setHandoffs(nextHandoffs);setError('');
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
  const changeUser=async(id:string,patch:Partial<WhatsappUserAccess>)=>{setBusy(`user:${id}`);setError('');try{setAccess(await api.updateUserAccess(id,patch));}catch(thrown){setError(localError(thrown,lang));}finally{setBusy('');}};
  const changeGroup=async(jid:string,patch:Partial<WhatsappGroupAccess>)=>{setBusy(`group:${jid}`);setError('');try{setAccess(await api.updateGroupAccess(jid,patch));}catch(thrown){setError(localError(thrown,lang));}finally{setBusy('');}};
  const resolve=async(id:string)=>{setBusy(`handoff:${id}`);setError('');try{await api.resolveHandoff(id);setHandoffs(current=>current.map(item=>item.id===id?{...item,status:'resolved'}:item));}catch(thrown){setError(localError(thrown,lang));}finally{setBusy('');}};
  const pendingHandoffs=handoffs.filter(item=>item.status==='pending');

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
      <StatCard icon={<CircleAlert/>} label={tr(lang,'تحتاج متابعة','Needs attention')} value={counts.failed+pendingHandoffs.length} tone={counts.failed+pendingHandoffs.length?'danger':'success'} />
    </div>
    <Tabs items={tabItems} value={tab} onChange={setTab} label={tr(lang,'أقسام تحكم واتساب','WhatsApp control sections')} dir={lang==='ar'?'rtl':'ltr'}/>
    {tab==='overview'&&<>
      <div className="wa-control__overview">
        <Card>
          <SectionHeader title={tr(lang,'تشغيل سريع','Quick control')} description={tr(lang,'قرار واحد واضح يطبّق على كل المحادثات ويسجّل في التدقيق.','One clear decision applied to every chat and recorded in the audit log.')} />
          <div className="wa-control__buttons"><Button icon={<PlayCircle/>} busy={busy==='active'} onClick={()=>void bulk('active')}>{tr(lang,'خلّ ريد يرد على الكل','Let Reid reply everywhere')}</Button><Button variant="danger" icon={<PauseCircle/>} busy={busy==='human'} onClick={()=>void bulk('human')}>{tr(lang,'استلام كل المحادثات','Take over all chats')}</Button></div>
        </Card>
        <Card>
          <SectionHeader title={tr(lang,'اتصال واتساب','WhatsApp connection')} description={tr(lang,'حالة القناة والمودل المستخدم للرد. باقي خدمات السيرفر مجمّعة في مركز النظام.','Channel and reply-model status. The complete server view lives in the system center.')} action={<Button size="sm" variant="secondary" onClick={()=>go('dashboard')}>{tr(lang,'فتح لوحة السيرفر','Open server dashboard')}</Button>}/>
          <div className="wa-health-list"><Health label="WhatsApp" good={status?.connection==='connected'} detail={status?.connection||'unknown'}/><Health label={ai?.model||'AI'} good={Boolean(ai?.online)} detail={ai?.latencyMs!=null?`${ai.latencyMs} ms`:'—'}/></div>
        </Card>
      </div>
      <CustomerHandoffs lang={lang} items={pendingHandoffs} busy={busy} resolve={resolve}/>
      <RecentActions lang={lang} actions={actions}/>
    </>}
    {tab==='agent'&&<AgentSettings lang={lang} draft={draft} dirty={dirty} busy={busy==='save'} patch={patch} save={save}/>} 
    {tab==='management'&&<Management lang={lang} go={go} access={access} busy={busy} changeUser={changeUser} changeGroup={changeGroup}/>}
  </div>;
}

function AgentSettings({lang,draft,dirty,busy,patch,save}:{lang:Lang;draft:WhatsappSettings|null;dirty:boolean;busy:boolean;patch:<K extends keyof WhatsappSettings>(key:K,value:WhatsappSettings[K])=>void;save:()=>Promise<void>}){
  return <Card className="wa-control__settings"><SectionHeader title={tr(lang,'سلوك ريد في واتساب','Reid behavior in WhatsApp')} description={tr(lang,'إعدادات قليلة وواضحة تُطبّق فعليًا على الرسائل الجديدة.','A focused set of controls that apply to new messages.')} action={<Button variant="primary" icon={<Save/>} busy={busy} disabled={!dirty||!draft} onClick={()=>void save()}>{tr(lang,'حفظ التغييرات','Save changes')}</Button>} />
    {!draft?<div className="wa-control__loading"/>:<div className="wa-settings-form">
      <Toggle checked={draft.assistant_enabled} onChange={value=>patch('assistant_enabled',value)} title={tr(lang,'تشغيل ريد','Enable Reid')} description={tr(lang,'المفتاح الرئيسي لكل الردود التلقائية في الخاص والجروبات.','Master switch for automatic replies in direct chats and groups.')} />
      <Toggle checked={draft.customer_auto_reply} onChange={value=>patch('customer_auto_reply',value)} title={tr(lang,'الرد على العملاء','Reply to customers')} description={tr(lang,'أي رقم غير مربوط بموظف يُعامل كعميل بلا صلاحيات داخلية.','Every unlinked number is treated as a customer without internal access.')} />
      <Toggle checked={draft.customer_handoff_enabled} onChange={value=>patch('customer_handoff_enabled',value)} title={tr(lang,'التحويل للفريق','Human handoff')} description={tr(lang,'إذا طلب شخص التواصل مع إنسان، يوقف ريد الرد ويرسل تنبيهًا لمستلمي التحويل المحددين.','When someone asks for a person, Reid pauses and alerts the selected handoff recipients.')} />
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

function Management({lang,go,access,busy,changeUser,changeGroup}:{lang:Lang;go:(page:Page)=>void;access:WhatsappAccess;busy:string;changeUser:(id:string,patch:Partial<WhatsappUserAccess>)=>Promise<void>;changeGroup:(jid:string,patch:Partial<WhatsappGroupAccess>)=>Promise<void>}){
  const [section,setSection]=React.useState<'groups'|'users'>('groups');
  const activeGroups=access.groups.filter(group=>group.enabled).length;
  const recipients=access.users.filter(user=>user.enabled&&user.handoff_notifications_enabled).length;
  return <div className="wa-management">
    <div className="wa-access-summary"><Card><small>{tr(lang,'الجروبات','Groups')}</small><strong>{access.groups.length}</strong><span>{tr(lang,`${activeGroups} مفعّلة`,`${activeGroups} enabled`)}</span></Card><Card><small>{tr(lang,'المستخدمون المرتبطون','Linked users')}</small><strong>{access.users.length}</strong><span>{tr(lang,`${recipients} يستلمون التحويلات`,`${recipients} receive handoffs`)}</span></Card></div>
    <div className="wa-access-switch" role="tablist"><button role="tab" aria-selected={section==='groups'} onClick={()=>setSection('groups')}>{tr(lang,'صلاحيات الجروبات','Group permissions')}</button><button role="tab" aria-selected={section==='users'} onClick={()=>setSection('users')}>{tr(lang,'صلاحيات المستخدمين','User permissions')}</button></div>
    {section==='groups'?<Card><SectionHeader title={tr(lang,'الجروبات التي فيها ريد','Groups containing Reid')} description={tr(lang,'أي جروب جديد يظهر مقفّلًا. أنت وحدك تفعّل الذكاء وتحدد طريقة مشاركته.','Every new group appears disabled. You decide whether AI is enabled and how Reid participates.')} />
      <div className="wa-access-list">{access.groups.length?access.groups.map(group=><details key={group.jid} className="wa-access-card"><summary><span className={`wa-access-icon${group.enabled?' is-on':''}`}><MessageCircle/></span><span><b>{group.display_name}</b><small>{group.enabled?(group.respond_to_all?tr(lang,'فعال · يتكلم بدون منشن','Enabled · speaks without a mention'):tr(lang,'فعال · بالمنشن فقط','Enabled · mention only')):tr(lang,'الذكاء غير مفعّل','AI disabled')}</small></span><Badge tone={group.enabled?'success':'neutral'}>{group.enabled?tr(lang,'مفعّل','Enabled'):tr(lang,'مقفّل','Off')}</Badge></summary><div className="wa-access-controls">
        <Permission checked={group.enabled} disabled={!!busy} title={tr(lang,'تفعيل ريد في الجروب','Enable Reid in this group')} description={tr(lang,'عند الإيقاف لا تُحفظ رسائل الجروب ولا ينشئ ريد أي رد.','While off, group messages are not stored and Reid creates no replies.')} onChange={value=>void changeGroup(group.jid,{enabled:value})}/>
        <Permission checked={group.respond_to_all} disabled={!!busy||!group.enabled} title={tr(lang,'يتكلم بدون منشن','Speak without a mention')} description={tr(lang,'إذا أوقفتها، يرد فقط عند قول ريد أو منشنه أو الرد على رسالته.','When off, Reid replies only when named, mentioned, or replied to.')} onChange={value=>void changeGroup(group.jid,{respond_to_all:value})}/>
        <Permission checked={group.guest_chat_enabled} disabled={!!busy||!group.enabled} title={tr(lang,'السماح لغير المرتبطين','Allow unlinked members')} description={tr(lang,'محادثة عامة فقط؛ لا بيانات شركة ولا أدوات حساب ولا أوامر حساسة.','Public chat only; no company data, account tools, or sensitive actions.')} onChange={value=>void changeGroup(group.jid,{guest_chat_enabled:value})}/>
        <label className="wa-access-select"><span><b>{tr(lang,'طريقة الرد الافتراضية','Default reply format')}</b><small>{tr(lang,`${group.known_participants} أعضاء معروفين من المحادثات`,`${group.known_participants} known participants from conversations`)}</small></span><select value={group.reply_mode} disabled={!!busy||!group.enabled} onChange={event=>void changeGroup(group.jid,{reply_mode:event.target.value as WhatsappGroupAccess['reply_mode']})}><option value="text">{tr(lang,'كتابة','Text')}</option><option value="voice">{tr(lang,'فويس','Voice')}</option></select></label>
      </div></details>):<p className="wa-actions__empty">{tr(lang,'لم يظهر أي جروب بعد. أضف رقم ريد إلى جروب، وسيظهر هنا مقفّلًا تلقائيًا.','No groups yet. Add Reid to a group and it will appear here disabled automatically.')}</p>}</div>
    </Card>:<Card><SectionHeader title={tr(lang,'المستخدمون المرتبطون بواتساب','WhatsApp-linked users')} description={tr(lang,'الصلاحية مرتبطة بالحساب والرقم، ولا يمنح الاسم أي وصول.','Permissions follow the account and phone number; a display name grants no access.')} action={<Button variant="secondary" onClick={()=>go('connections')}>{tr(lang,'ربط مستخدم جديد','Link a new user')}</Button>} />
      <div className="wa-access-list">{access.users.map(user=><details key={user.user_id} className="wa-access-card"><summary><span className={`wa-access-icon${user.enabled?' is-on':''}`}><UsersRound/></span><span><b>{user.display_name}</b><small><bdi dir="ltr">+{user.phone_e164}</bdi> · {user.role}</small></span><Badge tone={user.enabled?'success':'neutral'}>{user.enabled?tr(lang,'مرتبط','Linked'):tr(lang,'موقوف','Paused')}</Badge></summary><div className="wa-access-controls">
        <Permission checked={user.enabled} disabled={!!busy} title={tr(lang,'تفعيل حساب واتساب','Enable WhatsApp account')} description={tr(lang,'عند الإيقاف يعامل الرقم كجهة خارجية بلا صلاحيات داخلية.','When off, the number is treated as an external contact without internal access.')} onChange={value=>void changeUser(user.user_id,{enabled:value})}/>
        <Permission checked={user.handoff_notifications_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'تنبيهات طلب الإنسان','Human handoff alerts')} description={tr(lang,'يرسل ريد لهذا الشخص رسالة واتساب فيها اسم العميل ورقمه ورابط المحادثة.','Reid sends this person a WhatsApp alert with the customer, number, and chat link.')} onChange={value=>void changeUser(user.user_id,{handoff_notifications_enabled:value})}/>
        <Permission checked={user.voice_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'الرسائل الصوتية','Voice replies')} description={tr(lang,'يسمح بطلب الفويس واستخدامه كوضع افتراضي.','Allows voice requests and voice as a default mode.')} onChange={value=>void changeUser(user.user_id,{voice_enabled:value})}/>
        <Permission checked={user.memory_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'الذاكرة الشخصية','Personal memory')} description={tr(lang,'ذاكرة منفصلة لهذا الحساب فقط.','Memory isolated to this account.')} onChange={value=>void changeUser(user.user_id,{memory_enabled:value})}/>
        <Permission checked={user.style_learning_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'تعلّم الأسلوب','Style learning')} description={tr(lang,'يتعلم طريقة كتابة هذا الشخص دون مشاركة ذاكرته.','Learns this person’s writing style without sharing memory.')} onChange={value=>void changeUser(user.user_id,{style_learning_enabled:value})}/>
        <Permission checked={user.artifacts_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'الملفات والصور','Files and images')} description={tr(lang,'إنشاء وإرسال التقارير والملفات والصور.','Create and send reports, files, and images.')} onChange={value=>void changeUser(user.user_id,{artifacts_enabled:value})}/>
        <Permission checked={user.workshops_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'إدارة الورش','Workshop management')} description={tr(lang,'إنشاء وتحديث الورش حسب مستوى الموافقة.','Create and update workshops under approval rules.')} onChange={value=>void changeUser(user.user_id,{workshops_enabled:value})}/>
        <Permission checked={user.notes_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'الملاحظات الخاصة','Private notes')} description={tr(lang,'حفظ وإدارة ملاحظاته الخاصة فقط.','Manage only this user’s private notes.')} onChange={value=>void changeUser(user.user_id,{notes_enabled:value})}/>
        <Permission checked={user.proactive_enabled} disabled={!!busy||!user.enabled} title={tr(lang,'المبادرة التلقائية','Proactive messages')} description={tr(lang,'يسمح لريد بالمبادرة بالتحديثات المجدولة لهذا المستخدم.','Allows Reid to initiate scheduled updates for this user.')} onChange={value=>void changeUser(user.user_id,{proactive_enabled:value})}/>
        <label className="wa-access-select"><span><b>{tr(lang,'الرد الافتراضي','Default reply')}</b><small>{tr(lang,'يمكن تغييره أيضًا بأمر فويس أو اكتب.','Can also be changed with voice or text commands.')}</small></span><select value={user.reply_mode} disabled={!!busy||!user.enabled||!user.voice_enabled} onChange={event=>void changeUser(user.user_id,{reply_mode:event.target.value as WhatsappUserAccess['reply_mode']})}><option value="text">{tr(lang,'كتابة','Text')}</option><option value="voice">{tr(lang,'فويس','Voice')}</option></select></label>
        <label className="wa-access-select"><span><b>{tr(lang,'نطاق الإرسال','Sending scope')}</b><small>{tr(lang,'الإرسال الخارجي يبقى بحاجة إلى تأكيد صريح.','External sends still require explicit confirmation.')}</small></span><select value={user.outbound_scope} disabled={!!busy||!user.enabled} onChange={event=>void changeUser(user.user_id,{outbound_scope:event.target.value as WhatsappUserAccess['outbound_scope']})}><option value="none">{tr(lang,'مقفّل','Off')}</option><option value="company">{tr(lang,'داخل الشركة','Company only')}</option><option value="any">{tr(lang,'أي رقم بعد التأكيد','Any number after confirmation')}</option></select></label>
      </div></details>)}</div>
    </Card>}
    <Card><div className="wa-control__links"><button onClick={()=>go('connections')}><Wifi/><span><b>{tr(lang,'الاتصال والخدمات','Connection and services')}</b><small>{tr(lang,'ربط رقم ريد وGoogle Meet والصوت.','Link Reid’s number, Google Meet, and voice.')}</small></span></button><button onClick={()=>go('dashboard')}><Settings2/><span><b>{tr(lang,'الوكيل والأدوات والموافقات','Agent, tools and approvals')}</b><small>{tr(lang,'النموذج والأدوات الحساسة ومستويات الموافقة.','Model, sensitive tools, and approval levels.')}</small></span></button><button onClick={()=>go('assistant')}><Sparkles/><span><b>{tr(lang,'غرفة الوكلاء','Agent room')}</b><small>{tr(lang,'تكليف الوكلاء ومتابعة التنفيذ.','Assign agents and follow execution.')}</small></span></button></div></Card>
  </div>;
}

function CustomerHandoffs({lang,items,busy,resolve}:{lang:Lang;items:WhatsappHandoff[];busy:string;resolve:(id:string)=>Promise<void>}){
  if(!items.length)return null;
  return <Card><SectionHeader title={tr(lang,'طلبات تواصل بشري','Human handoff requests')} description={tr(lang,'أوقف ريد الرد في هذه المحادثات وأرسل التنبيه للمستلمين المحددين.','Reid paused these conversations and alerted the selected recipients.')} /><div className="wa-handoffs">{items.map(item=><article key={item.id}><span><BellRing/></span><div><b>{item.requester_name}</b><small><bdi dir="ltr">+{item.requester_phone}</bdi> · {new Date(item.created_at).toLocaleString(lang==='ar'?'ar-OM-u-nu-latn':'en-GB')}</small><p>{item.message_excerpt}</p></div><div><Button size="sm" variant="secondary" onClick={()=>location.assign(`/inbox?chat=${item.conversation_id}`)}>{tr(lang,'فتح المحادثة','Open chat')}</Button><Button size="sm" icon={<CheckCircle2/>} busy={busy===`handoff:${item.id}`} onClick={()=>void resolve(item.id)}>{tr(lang,'تمت المتابعة','Mark resolved')}</Button></div></article>)}</div></Card>;
}

function Permission({checked,disabled,title,description,onChange}:{checked:boolean;disabled:boolean;title:string;description:string;onChange:(value:boolean)=>void}){
  return <label className="wa-permission"><span><b>{title}</b><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/><i aria-hidden="true"/></label>;
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

import React from 'react';
import { QrCode, Smartphone, RefreshCw, CheckCircle2, MessageCircle, Send, Bot, UserRound, Search, Wifi, ArrowUpRight } from 'lucide-react';
import { localApi, localError } from './local-api';
import type { Page } from './routes';

type Lang = 'ar'|'en';
type Status={connection:string;qr:string|null;number:string|null;lastError:string|null};
type Conversation={id:string;jid:string;display_name:string;bot_mode:'active'|'human';last_message:string;updated_at:string};
type Message={id:string;direction:'inbound'|'outbound';body:string;status:string;created_at:string};
type Outbox={id:string;conversation_id:string;status:string;error:string|null;created_at:string};
const choose=(lang:Lang, ar:string,en:string)=>lang==='ar'?ar:en;

export function Connections({lang,go}:{lang:Lang;go:(page:Page)=>void}) {
  const [status,setStatus]=React.useState<Status|null>(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const [ai,setAi]=React.useState<{online:boolean;model:string}|null>(null);
  const load=React.useCallback(async()=>{
    try{setStatus(await localApi<Status>('whatsapp/status'));setError('');}catch(e){setError(localError(e,lang));}
  },[lang]);
  React.useEffect(()=>{void load();const timer=setInterval(()=>void load(),4000);void localApi<{online:boolean;model:string}>('ai/health').then(setAi).catch(()=>setAi({online:false,model:'gemma4:12b'}));return()=>clearInterval(timer);},[load]);
  const connect=async()=>{setBusy(true);setError('');try{await localApi('whatsapp/connect',{});await load();}catch(e){setError(localError(e,lang));}finally{setBusy(false);}};
  const connected=status?.connection==='connected';
  return <main className="os-page">
    <div className="os-page-heading"><div><span className="os-eyebrow">REID / CONNECTIONS</span><h1>{choose(lang,'كل أدواتك، متصلة.','All your tools, connected.')}</h1><p>{choose(lang,'اربط رقم الشركة وتابع الخدمات التي تدعم فريقك.','Connect the company number and the services behind your team.')}</p></div></div>
    {error&&<p role="alert" className="os-alert">{error}</p>}
    <div className="os-connection-grid">
      <section className="os-panel os-qr-card"><div className="os-panel-title"><span className="os-icon"><MessageCircle/></span><div><h2>WhatsApp</h2><p>{choose(lang,'الربط بالهاتف عبر QR','Link your phone with QR')}</p></div><span className={`os-status ${connected?'good':''}`}>{connected?choose(lang,'متصل','Connected'):choose(lang,'بانتظار الربط','Awaiting connection')}</span></div>
        {connected?<div className="os-qr-success"><CheckCircle2/><h3>{choose(lang,'رقم ريّد متصل','Reid is connected')}</h3><b dir="ltr">+{status?.number}</b><button className="os-primary" onClick={()=>go('inbox')}>{choose(lang,'افتح المحادثات','Open inbox')}<ArrowUpRight/></button></div>:<div className="os-qr-setup">
          <div className="os-qr-image">{status?.qr?<img src={status.qr} width="260" height="260" alt={choose(lang,'امسح هذا الكود من واتساب لربط رقم ريّد','Scan this QR code from WhatsApp to link Reid')}/>:<><QrCode size={80}/><p>{choose(lang,'جاهز لربط هاتفك','Ready to link your phone')}</p><button className="os-primary" disabled={busy||status?.connection==='connecting'} onClick={()=>void connect()}>{busy||status?.connection==='connecting'?choose(lang,'جارٍ تجهيز الكود…','Preparing QR…'):choose(lang,'إظهار QR code','Show QR code')}</button></>}</div>
          <ol><li>{choose(lang,'افتح واتساب في هاتف رقم ريّد.','Open WhatsApp on the Reid phone.')}</li><li>{choose(lang,'الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.','Settings → Linked devices → Link a device.')}</li><li>{choose(lang,'امسح الكود، ثم افتح صندوق المحادثات.','Scan the code, then open the inbox.')}</li></ol>
          <p className="os-muted">{choose(lang,'الكود يتجدد تلقائيًا. جلسة الربط محفوظة على سيرفر Reid.','The QR refreshes automatically. The linked session is stored on Reid.')}</p>
        </div>}
      </section>
      <div className="os-stack"><section className="os-panel"><div className="os-panel-title"><span className="os-icon"><Bot/></span><div><h2>{choose(lang,'مساعد ريّد','Reid assistant')}</h2><p>ai-lap</p></div><span className={`os-status ${ai?.online?'good':''}`}>{ai===null?choose(lang,'جارٍ الفحص','Checking'):ai.online?choose(lang,'جاهز','Ready'):choose(lang,'غير متاح','Unavailable')}</span></div><p>{choose(lang,'معالجة المحادثات بالذكاء المحلي. تبقى إدارة الشركة والموافقة على الإجراءات داخل حسابك.','Local intelligence for conversations. Company actions and approvals stay inside your account.')}</p><small className="os-muted">{ai?.model}</small></section>
      <section className="os-panel"><Smartphone/><h2>{choose(lang,'أنت تتحكم بالمحادثة','You control the conversation')}</h2><p>{choose(lang,'ابدأ بالرد اليدوي، وفعّل المساعد للمحادثات التي تختارها. الرد اليدوي يوقف المساعد تلقائيًا حتى تعيده أنت.','Start with human replies and enable the assistant per conversation. A manual reply pauses the assistant until you enable it again.')}</p><p className="os-muted">{choose(lang,'ربط الأجهزة غير رسمي؛ قد يحتاج إعادة مسح الكود إذا انتهت الجلسة.','Linked-device automation is unofficial and may require rescanning if the session expires.')}</p></section></div>
    </div>
  </main>;
}

export function QrInbox({lang,go}:{lang:Lang;go:(page:Page)=>void}) {
  const [chats,setChats]=React.useState<Conversation[]>([]),[selected,setSelected]=React.useState(''),[messages,setMessages]=React.useState<Message[]>([]);
  const [text,setText]=React.useState(''),[search,setSearch]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[status,setStatus]=React.useState<Status|null>(null);
  const [outbox,setOutbox]=React.useState<Outbox[]>([]);
  const requestId=React.useRef<string>(crypto.randomUUID());
  const active=chats.find(x=>x.id===selected);
  React.useEffect(()=>{
    let alive=true;
    const load=async()=>{try{const [rows,state,queue]=await Promise.all([localApi<Conversation[]>('whatsapp/conversations'),localApi<Status>('whatsapp/status'),localApi<Outbox[]>('whatsapp/outbox')]);if(alive){setChats(rows);setStatus(state);setOutbox(queue);setSelected(value=>value||rows[0]?.id||'');setError('');}}catch(e){if(alive)setError(localError(e,lang));}};
    void load();const timer=setInterval(()=>void load(),5000);return()=>{alive=false;clearInterval(timer);};
  },[lang]);
  React.useEffect(()=>{
    setMessages([]);if(!selected)return;let alive=true;
    const load=async()=>{try{const rows=await localApi<Message[]>(`whatsapp/conversations/${selected}/messages`);if(alive)setMessages(rows.reverse());}catch(e){if(alive)setError(localError(e,lang));}};
    void load();const timer=setInterval(()=>void load(),3000);return()=>{alive=false;clearInterval(timer);};
  },[selected,lang]);
  const send=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!text.trim()||busy)return;setBusy(true);setError('');try{await localApi(`whatsapp/conversations/${selected}/send`,{text,requestId:requestId.current});setText('');requestId.current=crypto.randomUUID();setChats(rows=>rows.map(x=>x.id===selected?{...x,bot_mode:'human'}:x));}catch(e){setError(localError(e,lang));}finally{setBusy(false);}};
  const toggle=async()=>{if(!active||busy)return;setBusy(true);try{const mode=active.bot_mode==='active'?'human':'active';await localApi(`whatsapp/conversations/${active.id}/mode`,{mode});setChats(rows=>rows.map(x=>x.id===active.id?{...x,bot_mode:mode}:x));}catch(e){setError(localError(e,lang));}finally{setBusy(false);}};
  return <main className="os-page"><div className="os-page-heading"><div><span className="os-eyebrow">REID / INBOX</span><h1>{choose(lang,'كل محادثة، بداية فرصة.','Every conversation starts something.')}</h1><p>{choose(lang,'رسائل الشركة، والسياق الذي يساعدك ترد أفضل.','Company conversations, with the context to reply better.')}</p></div><button className="os-secondary" onClick={()=>go('connections')}><Wifi/>{choose(lang,'إدارة الاتصال','Connection')}</button></div>
    {error&&<p role="alert" className="os-alert">{error}</p>}
    {status?.connection!=='connected'&&<div className="os-notice"><QrCode/><span>{choose(lang,'اربط رقم ريّد لبدء استقبال الرسائل.','Link the Reid number to receive messages.')}</span><button onClick={()=>go('connections')}>{choose(lang,'ربط الهاتف','Link phone')}</button></div>}
    <div className="os-inbox"><aside className="os-conversation-list"><label className="os-search"><Search/><input aria-label={choose(lang,'بحث المحادثات','Search conversations')} value={search} onChange={e=>setSearch(e.target.value)} placeholder={choose(lang,'ابحث عن محادثة…','Search conversations…')}/></label>
      {chats.filter(x=>`${x.display_name} ${x.jid}`.includes(search)).map(chat=><button key={chat.id} className={chat.id===selected?'selected':''} onClick={()=>{setSelected(chat.id);setText('');requestId.current=crypto.randomUUID();}}><span className="os-avatar">{chat.display_name.slice(0,1)||<UserRound/>}</span><span><b>{chat.display_name}</b><small>{chat.last_message||choose(lang,'محادثة جديدة','New conversation')}</small></span>{chat.bot_mode==='active'&&<Bot size={15}/>}</button>)}
      {!chats.length&&<div className="os-empty"><MessageCircle/><p>{choose(lang,'ستظهر رسائلك الجديدة هنا بعد الربط.','New messages will appear here once linked.')}</p></div>}
    </aside><section className="os-thread">{active?<><div className="os-thread-heading"><div><b>{active.display_name}</b><small>{active.bot_mode==='active'?choose(lang,'المساعد يرد على هذه المحادثة','Assistant replies enabled'):choose(lang,'الرد بواسطة الفريق','Human replies')}</small></div><button className="os-secondary" disabled={busy} onClick={()=>void toggle()}>{active.bot_mode==='active'?<UserRound/>:<Bot/>}{active.bot_mode==='active'?choose(lang,'استلام المحادثة','Take over'):choose(lang,'تفعيل المساعد','Enable assistant')}</button></div>
      <div className="os-message-list" aria-live="polite">{messages.map(msg=><article className={`os-message ${msg.direction}`} key={msg.id}><p>{msg.body}</p><small>{new Date(msg.created_at).toLocaleTimeString(lang==='ar'?'ar-OM':'en-GB',{hour:'2-digit',minute:'2-digit'})} · {msg.status==='sent'?choose(lang,'أُرسلت','Sent'):choose(lang,'واردة','Received')}</small></article>)}</div>
      {outbox.filter(x=>x.conversation_id===selected&&['queued','sending','uncertain','failed'].includes(x.status)).map(x=><p className="os-notice" key={x.id}>{['uncertain','failed'].includes(x.status)?choose(lang,'تعذر تأكيد إرسال رسالة. تحقق من الهاتف قبل إعادة إرسالها.','A delivery could not be confirmed. Check your phone before resending.'):choose(lang,'رسالة بانتظار تأكيد الإرسال…','Message awaiting delivery confirmation…')}</p>)}
      <form className="os-composer" onSubmit={e=>void send(e)}><textarea aria-label={choose(lang,'نص الرسالة','Message')} placeholder={choose(lang,'اكتب ردًا باسم ريّد…','Reply as Reid…')} value={text} maxLength={8000} onChange={e=>setText(e.target.value)}/><button className="os-primary" disabled={busy||!text.trim()||status?.connection!=='connected'}><Send/>{choose(lang,'إرسال','Send')}</button></form></>:<div className="os-empty os-thread-empty"><MessageCircle size={42}/><h2>{choose(lang,'مساحة أقرب لعملائك','A closer connection to your customers')}</h2><p>{choose(lang,'اختر محادثة لتقرأ وترد وتتابع.','Choose a conversation to read, reply and follow up.')}</p></div>}</section></div>
  </main>;
}

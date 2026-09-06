import React from "react";
import { Bot, BotOff, MessageCircle, RefreshCw, Send, UserRoundCheck } from "lucide-react";
import { supabase } from "./supabase";
import { useSession } from "./shell";

type Lang = "ar" | "en";
type Conversation = { id:string; sender_phone:string; display_name:string|null; bot_mode:"active"|"paused"|"human"; assigned_to:string|null; last_inbound_at:string|null; last_outbound_at:string|null; unread_count:number; updated_at:string };
type Message = { id:string; direction:"inbound"|"outbound"; body:string|null; delivery_status:string; sent_by:string|null; created_at:string };
type Owner = { id:string; full_name:string; email:string };

export function WhatsAppInbox({ lang }:{ lang:Lang }) {
  const { roles } = useSession();
  const owner = roles.includes("owner");
  const [conversations,setConversations]=React.useState<Conversation[]>([]);
  const [messages,setMessages]=React.useState<Message[]>([]);
  const [owners,setOwners]=React.useState<Owner[]>([]);
  const [selected,setSelected]=React.useState<string>("");
  const [text,setText]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState("");
  const active=conversations.find(item=>item.id===selected);
  const load=React.useCallback(async()=>{
    if(!supabase||!owner)return;
    const [chatRows,roleRows]=await Promise.all([
      supabase.from("whatsapp_conversations").select("*").order("updated_at",{ascending:false}),
      supabase.from("user_roles").select("user_id,profiles!user_roles_user_id_fkey(id,full_name,email)").eq("role","owner"),
    ]);
    if(chatRows.error){setError(chatRows.error.message);return;}
    const next=(chatRows.data||[]) as Conversation[]; setConversations(next); setSelected(value=>value||next[0]?.id||"");
    setOwners((roleRows.data||[]).flatMap((row:any)=>row.profiles?[row.profiles]:[]) as Owner[]);
  },[owner]);
  const loadMessages=React.useCallback(async()=>{
    if(!supabase||!selected)return;
    const result=await supabase.from("whatsapp_messages").select("id,direction,body,delivery_status,sent_by,created_at").eq("conversation_id",selected).order("created_at");
    if(result.error)setError(result.error.message);else setMessages((result.data||[]) as Message[]);
  },[selected]);
  React.useEffect(()=>{void load();},[load]);
  React.useEffect(()=>{void loadMessages();},[loadMessages]);
  React.useEffect(()=>{
    if(!supabase||!owner)return;
    const client=supabase;
    const channel=client.channel("owner-whatsapp-inbox").on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_conversations"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_messages"},()=>void loadMessages()).subscribe();
    return()=>{void client.removeChannel(channel)};
  },[owner,load,loadMessages]);
  const invoke=async(action:string,extra:Record<string,unknown>={})=>{
    if(!supabase||!active)return;
    setBusy(true);setError("");
    const result=await supabase.functions.invoke("whatsapp-inbox",{body:{action,conversationId:active.id,...extra}});
    setBusy(false);
    if(result.error||result.data?.error){setError(result.data?.error||result.error?.message||"request_failed");return;}
    await load();await loadMessages();
  };
  if(!owner)return null;
  const withinWindow=!!active?.last_inbound_at&&Date.now()-new Date(active.last_inbound_at).getTime()<86400000;
  return <section className="whatsapp-inbox" aria-labelledby="whatsapp-inbox-title">
    <header><div><span><MessageCircle/> WhatsApp Cloud API</span><h2 id="whatsapp-inbox-title">{lang==="ar"?"صندوق محادثات المالك":"Owner WhatsApp inbox"}</h2><p>{lang==="ar"?"أرسل يدويًا من رقم ريّد أو سلّم المحادثة للوكيل.":"Send manually from Reid’s number or hand the conversation to the bot."}</p></div><button type="button" onClick={()=>void load()} aria-label={lang==="ar"?"تحديث":"Refresh"}><RefreshCw/></button></header>
    <div className="whatsapp-inbox-layout">
      <aside aria-label={lang==="ar"?"المحادثات":"Conversations"}>{conversations.length?conversations.map(chat=><button type="button" key={chat.id} data-selected={chat.id===selected} onClick={()=>setSelected(chat.id)}><b>{chat.display_name||`+${chat.sender_phone}`}</b><small>{chat.bot_mode==="active"?(lang==="ar"?"الوكيل نشط":"Bot active"):(lang==="ar"?"تدخل بشري":"Human mode")}</small>{chat.unread_count>0&&<em>{chat.unread_count}</em>}</button>):<p>{lang==="ar"?"لا توجد محادثات بعد. أرسل «مساعدة» للرقم أولًا.":"No conversations yet. Message the number first."}</p>}</aside>
      <article className="whatsapp-thread">
        {active?<><header><div><b>{active.display_name||`+${active.sender_phone}`}</b><small>{withinWindow?(lang==="ar"?"نافذة الإرسال مفتوحة":"24-hour window open"):(lang==="ar"?"تحتاج رسالة قالب معتمدة":"Approved template required")}</small></div><div className="whatsapp-controls"><button type="button" disabled={busy} onClick={()=>void invoke("mark_read")}>{lang==="ar"?"تعليم كمقروء":"Mark read"}</button><button type="button" disabled={busy} onClick={()=>void invoke("configure",{botMode:active.bot_mode==="active"?"human":"active"})}>{active.bot_mode==="active"?<><BotOff/>{lang==="ar"?"استلام بشري":"Take over"}</>:<><Bot/>{lang==="ar"?"تشغيل الوكيل":"Enable bot"}</>}</button><label><UserRoundCheck/><span>{lang==="ar"?"المسؤول":"Assigned"}</span><select value={active.assigned_to||""} onChange={event=>void invoke("configure",{assignedTo:event.target.value||null})}><option value="">—</option>{owners.map(person=><option value={person.id} key={person.id}>{person.full_name||person.email}</option>)}</select></label></div></header><div className="whatsapp-messages">{messages.map(message=><div key={message.id} data-direction={message.direction}><p>{message.body||"—"}</p><small>{new Date(message.created_at).toLocaleString(lang==="ar"?"ar-OM":"en-OM")} · {message.delivery_status}</small></div>)}</div><form onSubmit={event=>{event.preventDefault();if(text.trim()){void invoke("send",{text:text.trim()});setText("")}}}><textarea value={text} onChange={event=>setText(event.target.value)} placeholder={lang==="ar"?"اكتب رسالة باسم ريّد…":"Write as Reid…"}/><button type="submit" disabled={busy||!withinWindow||!text.trim()}><Send/>{lang==="ar"?"إرسال":"Send"}</button></form></>:<p>{lang==="ar"?"اختر محادثة":"Select a conversation"}</p>}
        {error&&<p className="whatsapp-error" role="alert">{error==="outside_24h_window"?(lang==="ar"?"انتهت نافذة 24 ساعة. أرسل قالبًا معتمدًا من Meta أولًا.":"The 24-hour window is closed. Send an approved Meta template first."):error}</p>}
      </article>
    </div>
  </section>;
}

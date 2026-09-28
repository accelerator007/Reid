import { supabase } from './supabase';
import type { AgentRow } from './agents';

export type AgentRoom = { id:string; name:string; created_by:string; created_at:string; updated_at:string };
export type AgentRoomMessageState = 'pending_approval'|'queued'|'running'|'completed'|'failed'|'cancelled';
export type AgentRoomMessage = {
  id:string; room_id:string; sender_kind:'user'|'agent'|'system'; sender_user_id:string|null;
  sender_agent_id:string|null; body:string; mentions:string[]; run_id:string|null;
  reply_to:string|null; state:AgentRoomMessageState; error:string|null; created_at:string; updated_at:string;
};

export const agentNames:Record<string,{ar:string;en:string}>={
  ceo:{ar:'المدير المنسّق',en:'CEO Orchestrator'},operations:{ar:'التشغيل',en:'Operations'},
  marketing:{ar:'التسويق',en:'Marketing'},sales:{ar:'المبيعات',en:'Sales'},knowledge:{ar:'المعرفة',en:'Knowledge'},
  hr:{ar:'الموارد البشرية',en:'HR'},analytics:{ar:'التحليلات',en:'Analytics'},content:{ar:'المحتوى',en:'Content'},
  competitor:{ar:'رصد المنافسين',en:'Competitor Intelligence'},support:{ar:'دعم العملاء',en:'Customer Support'},
};

const aliases:Record<string,string>={
  ceo:'ceo',manager:'ceo','المدير':'ceo','الإدارة':'ceo','الادارة':'ceo',
  operations:'operations',ops:'operations','التشغيل':'operations','العمليات':'operations',
  marketing:'marketing','التسويق':'marketing',sales:'sales','المبيعات':'sales',
  knowledge:'knowledge','المعرفة':'knowledge',hr:'hr','الموارد':'hr','الموظفين':'hr',
  analytics:'analytics','التحليلات':'analytics','البيانات':'analytics',content:'content','المحتوى':'content',
  competitor:'competitor',competitors:'competitor','المنافسين':'competitor',support:'support','الدعم':'support',
};

export function resolveAgentMentions(text:string,agents:readonly Pick<AgentRow,'id'|'enabled'>[],fallback=true) {
  const available=new Set(agents.filter(agent=>agent.enabled).map(agent=>agent.id));
  const ids:string[]=[];
  const all=/@(all|team|الجميع|الكل)(?=\s|$|[،,.!?])/iu.test(text);
  if(all) return agents.filter(agent=>agent.enabled).map(agent=>agent.id);
  for(const match of text.matchAll(/@([\p{L}\p{N}_-]+)/gu)) {
    const id=aliases[match[1].toLocaleLowerCase()]||match[1].toLocaleLowerCase();
    if(available.has(id)&&!ids.includes(id)) ids.push(id);
  }
  if(!ids.length&&fallback&&available.has('ceo')) ids.push('ceo');
  return ids;
}

export function resolveAgentHandoffs(text:string,agents:readonly Pick<AgentRow,'id'|'enabled'>[]) {
  const handoffs:string[]=[];
  for(const match of text.matchAll(/\[HANDOFF:\s*@([\p{L}\p{N}_-]+)\]/giu)) {
    const resolved=resolveAgentMentions(`@${match[1]}`,agents,false)[0];
    if(resolved&&!handoffs.includes(resolved)) handoffs.push(resolved);
  }
  return handoffs;
}

export function teamRequest(agentId:string,request:string,lang:'ar'|'en') {
  const roster=Object.entries(agentNames).map(([id,name])=>`@${id} (${name[lang]})`).join(', ');
  return lang==='ar'
    ? `أنت @${agentId} داخل غرفة عمل جماعية لفريق ريّد. اقرأ رسائل الزملاء في سجل المحادثة، خاطب المالك مباشرة، أضف ما يخص اختصاصك وتجنب تكرار كلام وكيل آخر. إذا احتجت فعلًا تسليم جزء واضح لوكيل آخر، اختم بسطر مستقل بالصيغة [HANDOFF:@agent_id] ثم اكتب المطلوب؛ لا تستخدم هذه الصيغة لمجرد الإشارة إلى زميل، ولا تدّع أنه نفّذ شيئًا حتى يرد بنفسه. الوكلاء المتاحون: ${roster}.\n\nطلب المالك:\n${request}`
    : `You are @${agentId} in Reid's shared agent team room. Read colleagues' messages in the conversation history, address the Owner directly, add your specialty, and avoid repeating another agent. Only when a specific handoff is genuinely needed, end with a separate line in the form [HANDOFF:@agent_id] followed by the task. Do not use that form merely to refer to a colleague, and never claim it ran until that agent replies. Available agents: ${roster}.\n\nOwner request:\n${request}`;
}

export function roomHistory(messages:readonly AgentRoomMessage[],lang:'ar'|'en') {
  return messages.filter(message=>message.state==='completed'&&message.sender_kind!=='system').slice(-8).map(message=>({
    role:message.sender_kind==='user'?'user' as const:'assistant' as const,
    content:`[${message.sender_kind==='user'?(lang==='ar'?'المالك':'Owner'):(agentNames[message.sender_agent_id||'']?.[lang]||message.sender_agent_id)}] ${message.body}`,
  }));
}

export async function ensureAgentRoom(userId:string,lang:'ar'|'en') {
  if(!supabase) throw new Error('supabase_unavailable');
  const existing=await supabase.from('agent_rooms').select('*').eq('created_by',userId).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) return existing.data as AgentRoom;
  const created=await supabase.from('agent_rooms').insert({created_by:userId,name:lang==='ar'?'فريق ريّد':'Reid agent team'}).select('*').single();
  if(!created.error) return created.data as AgentRoom;
  const raced=await supabase.from('agent_rooms').select('*').eq('created_by',userId).single();
  if(raced.error) throw created.error;
  return raced.data as AgentRoom;
}

export async function loadAgentRoomMessages(roomId:string) {
  if(!supabase) throw new Error('supabase_unavailable');
  const result=await supabase.from('agent_room_messages').select('*').eq('room_id',roomId).order('created_at').limit(300);
  if(result.error) throw result.error;
  return (result.data||[]) as AgentRoomMessage[];
}

export async function postAgentRoomMessage(roomId:string,userId:string,body:string,mentions:string[]) {
  if(!supabase) throw new Error('supabase_unavailable');
  const result=await supabase.from('agent_room_messages').insert({room_id:roomId,sender_kind:'user',sender_user_id:userId,body:body.trim(),mentions}).select('*').single();
  if(result.error) throw result.error;
  return result.data as AgentRoomMessage;
}

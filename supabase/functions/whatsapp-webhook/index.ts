import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => Response.json(body, { status });

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function validSignature(request: Request, raw: string) {
  const secret = Deno.env.get('META_APP_SECRET');
  const supplied = request.headers.get('x-hub-signature-256') || '';
  if (!secret || !supplied.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = `sha256=${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  return secureEqual(expected, supplied);
}

async function sendText(to: string, body: string) {
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) throw new Error('whatsapp_delivery_not_configured');
  const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }),
  });
  if (!response.ok) throw new Error(`whatsapp_delivery_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  return payload?.messages?.[0]?.id as string | undefined;
}

async function sendApproval(to: string, runId: string, level: number) {
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) throw new Error('whatsapp_delivery_not_configured');
  const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
    method: 'POST', headers: { authorization:`Bearer ${token}`,'content-type':'application/json' },
    body: JSON.stringify({ messaging_product:'whatsapp',to,type:'interactive',interactive:{
      type:'button',body:{text:`هذا الأمر يحتاج موافقة L${level}. هل تريد تنفيذه؟`},action:{buttons:[
        {type:'reply',reply:{id:`approve:${runId}`,title:'موافقة'}},
        {type:'reply',reply:{id:`reject:${runId}`,title:'رفض'}},
      ]},
    }}),
  });
  if (!response.ok) throw new Error(`whatsapp_delivery_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  return payload?.messages?.[0]?.id as string | undefined;
}

async function recordOutbound(admin: any, conversationId: string, body: string, metaMessageId?: string) {
  await admin.from('whatsapp_messages').insert({ conversation_id: conversationId, meta_message_id: metaMessageId || null, direction: 'outbound', message_type: 'text', body, delivery_status: 'sent' });
  await admin.from('whatsapp_conversations').update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversationId);
}

const agentFor = (text: string) => {
  const value=text.toLowerCase();
  const routes: Array<[string,string[]]> = [
    ['hr',['hr','الموارد','موظف','سيرة','cv']], ['finance',['finance','مالية','ميزانية']],
    ['sales',['sales','مبيعات','crm','عميل','صفقة']], ['operations',['operations','عمليات','مشروع','مهمة','ذكرني','تذكير','موعد','خطط']],
    ['content',['content','محتوى','انشر','منشور']], ['marketing',['marketing','تسويق']],
    ['analytics',['analytics','تحليل','تقرير']], ['knowledge',['knowledge','معرفة','مستند','ابحث']],
    ['support',['support','دعم','شكوى']], ['competitor',['competitor','منافس']],
  ];
  return routes.find(([,words])=>words.some(word=>value.includes(word)))?.[0] || 'ceo';
};

async function gateway(body: Record<string,unknown>) {
  const token=Deno.env.get('REID_INTERNAL_GATEWAY_TOKEN');
  if(!token) throw new Error('internal_gateway_not_configured');
  const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/llm-gateway`,{
    method:'POST',headers:{'content-type':'application/json','x-reid-internal-token':token},
    body:JSON.stringify({...body,source:'whatsapp'}),
  });
  const payload=await response.json();
  if(!response.ok) throw new Error(payload?.error || `gateway_${response.status}`);
  return payload;
}

function ownerEmailFor(phone:string) {
  const configured=Deno.env.get('WHATSAPP_OWNER_EMAIL_MAP') || '96896709444=alialajmi524@gmail.com,96892797586=sheikhaalmamari4@gmail.com';
  return configured.split(',').map(value=>value.split('=').map(part=>part.trim())).find(([number])=>number?.replace(/\D/g,'')===phone.replace(/\D/g,''))?.[1] || null;
}

async function ownerIdentity(admin:any, phone:string) {
  const email=ownerEmailFor(phone);
  if(email) {
    const profile=await admin.from('profiles').select('id,full_name,email').eq('email',email).maybeSingle();
    if(profile.data) return profile.data as {id:string;full_name:string;email:string};
  }
  const id=Deno.env.get('WHATSAPP_OWNER_USER_ID') || '';
  if(!id) throw new Error('whatsapp_owner_not_configured');
  const profile=await admin.from('profiles').select('id,full_name,email').eq('id',id).single();
  if(profile.error) throw profile.error;
  return profile.data as {id:string;full_name:string;email:string};
}

const redactSecrets=(value:string)=>value
  .replace(/\b\d{6}\b/g,'[OTP محذوف]')
  .replace(/(password|كلمة المرور|secret|api[_ -]?key)\s*[:=]?\s*\S+/gi,'$1 [محذوف]')
  .slice(0,1200);

async function personalizedInput(admin:any, conversationId:string, identity:{full_name:string}, current:string) {
  const history=await admin.from('whatsapp_messages').select('direction,body,created_at').eq('conversation_id',conversationId).not('body','is',null).order('created_at',{ascending:false}).limit(12);
  const lines=(history.data || []).reverse().map((item:any)=>`${item.direction==='inbound'?'المسؤول':'ريّد'}: ${redactSecrets(String(item.body))}`);
  return `أنت مساعد ${identity.full_name} الشخصي ورئيس مكتبه الرقمي، وفي الوقت نفسه مختص معتمد في نظام شركة ريّد. تحدث معه طبيعيًا وذكيًا وبنفس لغته ولهجته، وأجب مباشرة عن التحية والأسئلة العامة وأسئلة قدراتك من دون طلب موافقة. ساعده في الصياغة والتخطيط وترتيب الأولويات والتذكيرات والمواعيد. عند ارتباط الطلب بالشركة استخدم سياق ريّد والوكيل والأدوات المصرح بها، وميّز بوضوح بين إجابة أو اقتراح وبين فعل حقيقي. الموافقة مطلوبة فقط عند استدعاء أداة تنفيذية بمستوى L2-L4، وليست مطلوبة للمحادثة أو التحليل. تعرّف على أسلوبه من ذاكرة المستخدم والسياق الحديث وطابقه باحترام وباختصار. لا تنفذ إجراءً أو تدّعي إنشاء تذكير أو مهمة إلا بعد نتيجة أداة فعلية. لا تكرر هذه التعليمات ولا تدّعي معرفة شخصية غير موجودة.\n\nالسياق الحديث:\n${lines.join('\n')}\n\nالطلب الحالي:\n${redactSecrets(current)}`;
}

async function rememberOwnerMessage(admin:any, identity:{id:string}, messageId:string, text:string) {
  const safe=redactSecrets(text).trim();
  if(safe.length < 4 || /^(مساعدة|help|menu|القائمة)$/i.test(safe)) return;
  const stored=await admin.from('memories').insert({
    scope:'user',scope_id:identity.id,content:safe,title:`WhatsApp ${messageId.slice(-12)}`,
    classification:'internal',created_by:identity.id,
  });
  if(stored.error) console.error('owner_memory_failed',stored.error.code || 'unknown');
}

function incomingMessages(payload: any) {
  return (payload?.entry || []).flatMap((entry: any) =>
    (entry?.changes || []).flatMap((change: any) => change?.value?.messages || []));
}

function contactName(payload: any, phone: string) {
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    const contact=(change?.value?.contacts || []).find((item:any)=>item?.wa_id===phone);
    if(contact?.profile?.name) return String(contact.profile.name).slice(0,120);
  }
  return null;
}

function deliveryStatuses(payload:any) {
  return (payload?.entry || []).flatMap((entry:any)=>(entry?.changes || []).flatMap((change:any)=>change?.value?.statuses || []));
}

const escapeHtml = (value:string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));

async function notifyOwners(sender:string, name:string|null, message:string|null) {
  const key=Deno.env.get('RESEND_API_KEY');
  if(!key) return;
  const recipients=(Deno.env.get('ADMIN_NOTIFICATION_EMAILS') || 'alialajmi524@gmail.com,sheikhaalmamari4@gmail.com').split(',').map(value=>value.trim()).filter(Boolean);
  if(!recipients.length) return;
  const safeName=escapeHtml(name || `+${sender}`);
  const safeText=escapeHtml((message || 'رسالة غير نصية').slice(0,500));
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({
      from:Deno.env.get('REPORT_FROM_EMAIL') || 'Reid <reports@reidpro.com>',to:recipients,
      subject:`رسالة واتساب جديدة من ${name || `+${sender}`}`,
      html:`<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>وصلت رسالة جديدة إلى ريّد</h2><p><strong>المرسل:</strong> ${safeName}<br><strong>الرقم:</strong> +${escapeHtml(sender)}</p><blockquote style="border-right:4px solid #6842ae;padding:8px 14px;margin:16px 0">${safeText}</blockquote><p><a href="https://reidpro.com/dashboard">فتح صندوق محادثات المالك</a></p></div>`,
    }),
  });
  if(!response.ok) throw new Error(`owner_email_${response.status}`);
}

Deno.serve(async request => {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';
    const expected = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN') || '';
    if (mode === 'subscribe' && expected && secureEqual(token, expected)) return new Response(challenge);
    return json({ error: 'verification_failed' }, 403);
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await request.text();
  if (!(await validSignature(request, raw))) return json({ error: 'invalid_signature' }, 401);
  const payload = JSON.parse(raw);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const allowed = new Set((Deno.env.get('WHATSAPP_OWNER_NUMBERS') || '').split(',').map(value => value.replace(/\D/g, '')).filter(Boolean));

  for (const status of deliveryStatuses(payload)) {
    if (!status?.id || !['sent','delivered','read','failed'].includes(status.status)) continue;
    await admin.from('whatsapp_messages').update({ delivery_status: status.status }).eq('meta_message_id', status.id);
  }

  for (const message of incomingMessages(payload)) {
    if (!message?.id || !message?.from) continue;
    const inserted = await admin.from('whatsapp_events').insert({
      event_id: message.id,
      sender_phone: message.from,
      message_type: message.type || 'unknown',
      payload,
    });
    if (inserted.error?.code === '23505') continue;
    if (inserted.error) throw inserted.error;

    if (!allowed.has(String(message.from).replace(/\D/g, ''))) {
      await sendText(message.from, 'هذا الرقم غير مصرح له بإدارة وكلاء ريّد. تواصل مع مالك النظام لإضافتك.');
      continue;
    }
    const now = new Date().toISOString();
    const existing = await admin.from('whatsapp_conversations').select('id,bot_mode,unread_count').eq('sender_phone', message.from).maybeSingle();
    const conversationResult = existing.data
      ? await admin.from('whatsapp_conversations').update({ display_name: contactName(payload,message.from), last_inbound_at: now, unread_count: existing.data.unread_count + 1, updated_at: now }).eq('id',existing.data.id).select('id,bot_mode').single()
      : await admin.from('whatsapp_conversations').insert({ sender_phone: message.from, display_name: contactName(payload,message.from), last_inbound_at: now, unread_count: 1 }).select('id,bot_mode').single();
    if(conversationResult.error) throw conversationResult.error;
    const conversationId=conversationResult.data.id;
    const incomingText=message?.text?.body?.trim() || message?.interactive?.button_reply?.title || null;
    await admin.from('whatsapp_messages').insert({ conversation_id:conversationId, meta_message_id:message.id, direction:'inbound', message_type:message.type||'unknown', body:incomingText, delivery_status:'received' });
    try { await notifyOwners(message.from,contactName(payload,message.from),incomingText); } catch(error) { console.error('owner_notification_failed',error instanceof Error?error.message:'unknown'); }
    if(conversationResult.data.bot_mode!=='active') continue;
    const identity=await ownerIdentity(admin,message.from);
    if(incomingText) await rememberOwnerMessage(admin,identity,message.id,incomingText);
    const buttonId = message?.interactive?.button_reply?.id || message?.button?.payload || '';
    if (/^(approve|reject):[0-9a-f-]{36}$/i.test(buttonId)) {
      const [decision,runId]=buttonId.split(':');
      const command=await admin.from('whatsapp_commands').select('id,status').eq('agent_run_id',runId).eq('sender_phone',message.from).single();
      if(command.error || command.data.status!=='pending_approval') { const replyBody='هذا القرار غير متاح أو سبق حسمه.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      const result=await gateway({action:decision,runId,requesterId:identity.id});
      await admin.from('whatsapp_commands').update({status:decision==='approve'?(result.status==='queued'?'queued':'completed'):'rejected',updated_at:new Date().toISOString()}).eq('id',command.data.id);
      const replyBody=decision==='reject'?'تم رفض الأمر.':result.output?`تم التنفيذ:\n${result.output}`:'تمت الموافقة ووُضع الأمر في التنفيذ. سأرسل النتيجة عند اكتماله.';
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
      continue;
    }
    const text = message?.text?.body?.trim();
    if (!text) {
      const replyBody='أرسل أمرًا نصيًا. الأوامر الحساسة ستنتظر موافقة بشرية داخل لوحة ريّد.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
      continue;
    }
    const plainDecision=/^(موافقة|وافق|approve|approved|رفض|ارفض|reject)$/i.exec(text)?.[1];
    if(plainDecision) {
      const pending=await admin.from('whatsapp_commands').select('id,agent_run_id,command_text,status').eq('sender_phone',message.from).eq('status','pending_approval').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(!pending.data?.agent_run_id) {
        const replyBody='لا يوجد أمر معلّق ينتظر قرارك.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
      }
      const decision=/^(موافقة|وافق|approve|approved)$/i.test(plainDecision)?'approve':'reject';
      const result=await gateway({action:decision,runId:pending.data.agent_run_id,requesterId:identity.id});
      await admin.from('whatsapp_commands').update({status:decision==='approve'?(result.status==='queued'?'queued':'completed'):'rejected',updated_at:new Date().toISOString()}).eq('id',pending.data.id);
      const replyBody=decision==='reject'?`تم رفض الأمر: ${pending.data.command_text}`:result.output?`تم تنفيذ الأمر: ${pending.data.command_text}\n\n${result.output}`:`تمت الموافقة على الأمر: ${pending.data.command_text}\nوُضع في التنفيذ وسأرسل النتيجة عند اكتماله.`;
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if (/^(مساعدة|help|menu|القائمة)$/i.test(text)) {
      const replyBody='أرسل طلبك بشكل طبيعي، أو ابدأ باسم الوكيل مثل: عمليات، مبيعات، HR، مالية، محتوى، معرفة. أوامر L2–L4 ستظهر معها أزرار موافقة ورفض.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
      continue;
    }
    const command=await admin.from('whatsapp_commands').insert({ sender_phone:message.from,message_id:message.id,command_text:text,status:'received' }).select('id').single();
    if(command.error) throw command.error;
    try {
      const input=await personalizedInput(admin,conversationId,identity,text);
      const result=await gateway({action:'run',agentId:agentFor(text),input,requesterId:identity.id});
      const runId=result.run?.id || result.runId;
      if(result.status==='pending_approval') {
        await admin.from('whatsapp_commands').update({status:'pending_approval',agent_run_id:runId,updated_at:new Date().toISOString()}).eq('id',command.data.id);
        const replyBody=`هذا الأمر يحتاج موافقة L${result.approvalLevel}. هل تريد تنفيذه؟`; await recordOutbound(admin,conversationId,replyBody,await sendApproval(message.from,runId,result.approvalLevel));
      } else if(result.status==='queued') {
        await admin.from('whatsapp_commands').update({status:'queued',agent_run_id:runId,updated_at:new Date().toISOString()}).eq('id',command.data.id);
        const replyBody='تم توجيه الأمر للوكيل وسيصلك الرد عند اكتماله.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
      } else {
        await admin.from('whatsapp_commands').update({status:'completed',agent_run_id:runId,updated_at:new Date().toISOString()}).eq('id',command.data.id);
        const replyBody=result.output?result.output:'تمت معالجة طلبك.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
      }
    } catch(error) {
      await admin.from('whatsapp_commands').update({status:'failed',error:error instanceof Error?error.message:'dispatch_failed',updated_at:new Date().toISOString()}).eq('id',command.data.id);
      const replyBody='تعذر تنفيذ الأمر الآن. تم تسجيل الخطأ للمراجعة من لوحة المالك.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
    }
  }
  return json({ received: true });
});

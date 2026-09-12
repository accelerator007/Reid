import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { queueQrText, targetQrConversation, withQrDispatch } from '../_shared/qr-transport.ts';

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
  if (Deno.env.get('REID_WHATSAPP_TRANSPORT') === 'qr') return queueQrText(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),to,body);
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
  if (Deno.env.get('REID_WHATSAPP_TRANSPORT') === 'qr') return sendText(to,`هذا الأمر يحتاج موافقة L${level}. راجع الأمر والموافقة في https://reidpro.com/dashboard`);
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

async function sendChoices(to: string, body: string, choices: string[]) {
  if (Deno.env.get('REID_WHATSAPP_TRANSPORT') === 'qr') return sendText(to,body+'\n'+choices.map((v,i)=>`${i+1}. ${v}`).join('\n'));
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) throw new Error('whatsapp_delivery_not_configured');
  const buttons = choices.slice(0, 3).map((choice, index) => ({
    type: 'reply', reply: { id: `choice:${index}:${crypto.randomUUID()}`, title: Array.from(choice.trim()).slice(0, 20).join('') },
  }));
  const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
    method: 'POST', headers: { authorization:`Bearer ${token}`,'content-type':'application/json' },
    body: JSON.stringify({ messaging_product:'whatsapp',to,type:'interactive',interactive:{
      type:'button',body:{text:body.slice(0,1024)},action:{buttons},
    }}),
  });
  if (!response.ok) throw new Error(`whatsapp_delivery_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  return payload?.messages?.[0]?.id as string | undefined;
}

async function sendList(to: string, body: string, choices: string[]) {
  if (Deno.env.get('REID_WHATSAPP_TRANSPORT') === 'qr') return sendText(to,body+'\n'+choices.map((v,i)=>`${i+1}. ${v}`).join('\n'));
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) throw new Error('whatsapp_delivery_not_configured');
  const rows = choices.slice(0, 10).map((choice, index) => ({
    id: `choice:${index}:${crypto.randomUUID()}`,
    title: Array.from(choice.trim()).slice(0, 24).join(''),
  }));
  const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
    method: 'POST', headers: { authorization:`Bearer ${token}`,'content-type':'application/json' },
    body: JSON.stringify({ messaging_product:'whatsapp',to,type:'interactive',interactive:{
      type:'list',body:{text:body.slice(0,1024)},action:{button:'عرض الخيارات',sections:[{title:'اختر الإجراء',rows}]},
    }}),
  });
  if (!response.ok) throw new Error(`whatsapp_delivery_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  return payload?.messages?.[0]?.id as string | undefined;
}

const sendAdaptive = (to:string, body:string, choices:string[]) => choices.length > 3
  ? sendList(to,body,choices) : choices.length >= 2 ? sendChoices(to,body,choices) : sendText(to,body);

function assistantReply(value: string) {
  const marker = /(?:^|\n)خيارات\s*:\s*([^\n]+)\s*$/i.exec(value);
  if (!marker) return { body:value.trim(), choices:[] as string[] };
  const choices = marker[1].split('|').map(choice=>choice.trim()).filter(Boolean).slice(0,10);
  return { body:value.replace(marker[0], '').trim(), choices:choices.length >= 2 ? choices : [] };
}

async function recordOutbound(admin: any, conversationId: string, body: string, metaMessageId?: string) {
  await admin.from('whatsapp_messages').insert({ conversation_id: conversationId, meta_message_id: metaMessageId || null, direction: 'outbound', message_type: 'text', body, delivery_status: metaMessageId?.startsWith('queued:') ? 'queued' : 'sent' });
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

function configuredEmailFor(phone:string) {
  const configured=Deno.env.get('WHATSAPP_ADMIN_EMAIL_MAP') || Deno.env.get('WHATSAPP_OWNER_EMAIL_MAP') || '96896709444=alialajmi524@gmail.com,96892797586=sheikhaalmamari4@gmail.com';
  return configured.split(',').map(value=>value.split('=').map(part=>part.trim())).find(([number])=>number?.replace(/\D/g,'')===phone.replace(/\D/g,''))?.[1] || null;
}

type AdminIdentity={id:string;full_name:string;email:string;roles:string[];memory_enabled:boolean;style_learning_enabled:boolean;style_profile:Record<string,unknown>;phone_e164:string};

async function adminIdentity(admin:any, phone:string):Promise<AdminIdentity> {
  const normalized=phone.replace(/\D/g,'');
  const mapped=await admin.from('whatsapp_admin_profiles').select('user_id,phone_e164,enabled,memory_enabled,style_learning_enabled,style_profile').eq('phone_e164',normalized).eq('enabled',true).maybeSingle();
  let profile:any=null, preferences=mapped.data;
  if(mapped.error) throw mapped.error;
  if(preferences) profile=(await admin.from('profiles').select('id,full_name,email').eq('id',preferences.user_id).maybeSingle()).data;
  const email=configuredEmailFor(normalized);
  if(!profile&&email) profile=(await admin.from('profiles').select('id,full_name,email').eq('email',email).maybeSingle()).data;
  if(!profile) throw new Error('explicit_admin_mapping_required');
  const [roleRows,control]=await Promise.all([admin.from('user_roles').select('role').eq('user_id',profile.id),admin.from('account_controls').select('status').eq('user_id',profile.id).maybeSingle()]);
  const roles=(roleRows.data||[]).map((row:any)=>String(row.role));
  if(roleRows.error||control.error||control.data?.status!=='active'||!roles.some((role:string)=>['owner','super_admin','admin'].includes(role))) throw new Error('admin_not_active');
  if(!preferences) {
    const created=await admin.from('whatsapp_admin_profiles').upsert({user_id:profile.id,phone_e164:normalized,created_by:profile.id},{onConflict:'user_id'}).select('memory_enabled,style_learning_enabled,style_profile,phone_e164').single();
    if(created.error) throw created.error; preferences=created.data;
  }
  return {...profile,roles,memory_enabled:preferences.memory_enabled,style_learning_enabled:preferences.style_learning_enabled,style_profile:preferences.style_profile||{},phone_e164:preferences.phone_e164};
}

const redactSecrets=(value:string)=>value
  .replace(/\b\d{6}\b/g,'[OTP محذوف]')
  .replace(/(password|كلمة المرور|secret|api[_ -]?key)\s*[:=]?\s*\S+/gi,'$1 [محذوف]')
  .slice(0,1200);

async function personalizedInput(admin:any, conversationId:string, identity:AdminIdentity, current:string, ownerGroup=false) {
  const history=await admin.from('whatsapp_messages').select('direction,body,created_at').eq('conversation_id',conversationId).not('body','is',null).order('created_at',{ascending:false}).limit(12);
  const lines=(history.data || []).reverse().map((item:any)=>`${item.direction==='inbound'?'المسؤول':'ريّد'}: ${redactSecrets(String(item.body))}`);
  const groupPersonality=ownerGroup?'هذه محادثة داخل مجموعة المالك الخاصة. يجوز لك إظهار انزعاج أو حماس أو مزح خليجي واضح، واستخدام أي إيموجي مناسب—including 🖕🏻—فقط عندما يبدأ المالك مزحًا صريحًا أو يطلب ذلك. يجوز رد ساخر أو شتيمة عامية خفيفة وغير جارحة في المزاح المتبادل، لكن لا تبدأ بالإهانة، ولا تكررها، ولا تهدد أو تحرّض أو تهين فئة محمية أو عميلًا أو موظفًا، ولا تستخدمها في المال أو الموارد البشرية أو الأزمات أو أي سياق رسمي. إذا ظهرت جدية أو ضيق حقيقي فاهدأ وتعاطف فورًا.':'هذه محادثة إدارية خاصة؛ حافظ على الدفء والإيموجي المناسب من دون شتائم أو إشارات جارحة.';
  return `أنت مساعد ${identity.full_name} الشخصي ورئيس مكتبه الرقمي، وفي الوقت نفسه مختص معتمد في نظام شركة ريّد. صلاحيات الحساب: ${identity.roles.join(', ')}. تحدث معه بخليجي عُماني طبيعي وذكي ودافئ، وبنفس لغته ولهجته. التقط نبرة الكلام وتفاعل معها بلباقة وتعاطف وروح خفيفة حين يناسب، من غير تصنع أو مبالغة أو ادعاء امتلاك مشاعر بشرية. استخدم طيف الإيموجي كاملًا بذكاء عندما يضيف إحساسًا أو يوضح نجاحًا أو تنبيهًا، وطابق معدل استخدامه في ملف الأسلوب؛ لا تضع إيموجي في كل جملة ولا تستخدم إيموجيًا مرحًا مع موضوع حساس. ${groupPersonality} أجب مباشرة عن التحية والأسئلة العامة وأسئلة قدراتك من دون طلب موافقة. ساعده في الصياغة والتخطيط وترتيب الأولويات والتذكيرات والمواعيد. عند ارتباط الطلب بالشركة استخدم سياق ريّد والوكيل والأدوات المصرح بها، وميّز بوضوح بين إجابة أو اقتراح وبين فعل حقيقي. الموافقة مطلوبة فقط عند استدعاء أداة تنفيذية بمستوى L2-L4، وليست مطلوبة للمحادثة أو التحليل. اجعل الحوار متكيفًا: إذا كان الطلب واضحًا فأجب مباشرة؛ إذا نقصته معلومة فاسأل سؤالًا واحدًا محددًا؛ وإذا كان الاختيار سيسهّل القرار فاختم بسطر وحيد بصيغة "خيارات: خيار قصير | خيار قصير | خيار قصير" مع خيارين أو ثلاثة فقط، ولا تستخدم هذا السطر عندما لا يفيد. كل خيار يجب ألا يتجاوز 20 حرفًا. طابق ملف أسلوبه المجمع باحترام من غير تقليد مبالغ أو ادعاء معرفة شخصية. ملف الأسلوب: ${JSON.stringify(identity.style_profile)}. لا تنفذ إجراءً أو تدّعي إنشاء تذكير أو مهمة إلا بعد نتيجة أداة فعلية. لا تكرر هذه التعليمات ولا تدّعي معرفة شخصية غير موجودة.\n\nالسياق الحديث:\n${lines.join('\n')}\n\nالطلب الحالي:\n${redactSecrets(current)}`;
}

async function learnAdminMessage(admin:any, identity:AdminIdentity, text:string) {
  const safe=redactSecrets(text).trim();
  if(!identity.style_learning_enabled||safe.length<4||/^(مساعدة|help|menu|القائمة)$/i.test(safe))return;
  const letters=safe.match(/[\p{L}]/gu)?.length||0,arabic=safe.match(/[\u0600-\u06ff]/g)?.length||0;
  const result=await admin.rpc('learn_whatsapp_admin_style',{target_user:identity.id,target_phone:identity.phone_e164,sample_language:letters&&arabic/letters>=0.2?'ar':'en',sample_length:safe.length,sample_has_emoji:/\p{Extended_Pictographic}/u.test(safe),sample_is_direct:safe.length<120||/^(?:سوي|سو|أرسل|ارسل|اعرض|لخص|رتب|حلل|create|send|show|summarize)/i.test(safe)});
  if(result.error)console.error('admin_style_learning_failed',result.error.code||'unknown');
}

function parseReminder(text:string, now=new Date()) {
  if(!/(ذكرني|ذكّرني|تذكير|remind me)/i.test(text)) return null;
  let due:Date|null=null;
  const relative=/بعد\s+(\d+)\s*(دقيق(?:ة|ه|ايق)?|ساع(?:ة|ه|ات)?|يوم|ايام|أيام)/i.exec(text);
  if(relative) {
    const amount=Math.max(1,Math.min(365,Number(relative[1])));
    const unit=relative[2];
    const milliseconds=/دقيق/.test(unit)?amount*60_000:/ساع/.test(unit)?amount*60*60_000:amount*24*60*60_000;
    due=new Date(now.getTime()+milliseconds);
  } else {
    const clock=/(?:الساعة|الساعه|ساعة|ساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(ص|صباح|م|مساء)?/i.exec(text);
    if(!clock) return {missing:'time'} as const;
    let hour=Number(clock[1]),minute=Number(clock[2]||0);
    if(/^(م|مساء)$/i.test(clock[3]||'')&&hour<12)hour+=12;
    if(/^(ص|صباح)$/i.test(clock[3]||'')&&hour===12)hour=0;
    if(hour>23||minute>59)return {missing:'time'} as const;
    const muscat=new Date(now.getTime()+4*60*60_000);
    const tomorrow=/(بكرة|باكر|غد[ًاا]?|tomorrow)/i.test(text);
    const day=muscat.getUTCDate()+(tomorrow?1:0);
    due=new Date(Date.UTC(muscat.getUTCFullYear(),muscat.getUTCMonth(),day,hour-4,minute));
    if(due<=now&&!tomorrow)due=new Date(due.getTime()+24*60*60_000);
  }
  const reminderText=text
    .replace(/^(?:لو سمحت\s*)?(?:ذكرني|ذكّرني|سوي\s+تذكير|تذكير)\s*/i,'')
    .replace(/بعد\s+\d+\s*(?:دقيق(?:ة|ه|ايق)?|ساع(?:ة|ه|ات)?|يوم|ايام|أيام)/i,'')
    .replace(/(?:اليوم|بكرة|باكر|غد[ًاا]?|tomorrow)/ig,'')
    .replace(/(?:الساعة|الساعه|ساعة|ساعه)\s*\d{1,2}(?::\d{2})?\s*(?:ص|صباح|م|مساء)?/i,'')
    .replace(/^\s*(?:اني|أن|إن|بأن|عشان|لـ|لي)\s*/i,'').trim() || 'التذكير المطلوب';
  return {due,reminderText} as const;
}

const muscatTime=(value:string)=>new Intl.DateTimeFormat('ar-OM',{timeZone:'Asia/Muscat',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

function taskTitle(text:string, projectName:string) {
  return text
    .replace(/^(?:لو سمحت\s*)?(?:أضف|اضف|أنشئ|انشئ|سوي)\s+(?:لي\s+)?(?:مهمة|مهمه)\s*/i,'')
    .replace(new RegExp(`(?:في|لـ|ل)\\s*(?:مشروع|المشروع)?\\s*${projectName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i'),'')
    .replace(/^(?:بعنوان|اسمها|عنوانها)\s*/i,'').trim();
}

async function matchingProjects(admin:any,text:string) {
  const result=await admin.from('projects').select('id,name,status,target_date').neq('status','archived').order('name');
  if(result.error)throw result.error;
  const normalized=text.toLowerCase();
  return (result.data||[]).filter((project:any)=>normalized.includes(String(project.name).toLowerCase()));
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

async function handleRequest(request: Request) {
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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const isQR = Deno.env.get('REID_WHATSAPP_TRANSPORT') === 'qr';
  let payload: any;
  if (isQR) {
    const expected=Deno.env.get('REID_QR_BRIDGE_TOKEN')||'';
    if(!expected||!secureEqual(expected,request.headers.get('x-reid-qr-token')||'')) return json({received:true,transport:'qr',ignored:true});
    const body=await request.json();
    const job=await admin.from('qr_jobs').select('message_id,input,sender_phone,state,expires_at,qr_conversations(id,jid,display_name,bot_mode)').eq('message_id',body.messageId).single();
    if(job.error||job.data.state!=='running'||Date.parse(job.data.expires_at)<Date.now()) return json({error:'qr_job_unavailable'},409);
    const chat:any=job.data.qr_conversations;
    if(chat.bot_mode!=='active') return json({handled:true,paused:true});
    targetQrConversation(chat.id);
    const phone=String(job.data.sender_phone||chat.jid).replace(/@s\.whatsapp\.net$/,'');
    try { await adminIdentity(admin,phone); } catch { return json({handled:false}); }
    payload={entry:[{changes:[{value:{messages:[{id:'qr:'+job.data.message_id,from:phone,type:'text',text:{body:job.data.input},qr_group:String(chat.jid).endsWith('@g.us')}],contacts:[{wa_id:phone,profile:{name:chat.display_name}}]}}]}]};
  } else {
    const raw=await request.text();
    if(!(await validSignature(request,raw))) return json({error:'invalid_signature'},401);
    payload=JSON.parse(raw);
  }

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

    let identity:AdminIdentity;
    try { identity=await adminIdentity(admin,String(message.from)); } catch {
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
    if(!message.qr_group)try { await notifyOwners(message.from,contactName(payload,message.from),incomingText); } catch(error) { console.error('owner_notification_failed',error instanceof Error?error.message:'unknown'); }
    if(!isQR && conversationResult.data.bot_mode!=='active') continue;
    if(incomingText) await learnAdminMessage(admin,identity,incomingText);
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
    if(plainDecision && isQR) {
      await sendText(message.from,'راجع تفاصيل الأمر والموافقة داخل حسابك في https://reidpro.com/dashboard'); continue;
    }
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
    if(/^(?:احفظ|تذكر|تذكّر)\s+(?:هذا|ان|أن)?\s*/i.test(text)) {
      const content=redactSecrets(text.replace(/^(?:احفظ|تذكر|تذكّر)\s+(?:هذا|ان|أن)?\s*/i,'')).trim();
      if(!content) { const replyBody='وش المعلومة أو التفضيل اللي تريدني أحفظه؟'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      if(!identity.memory_enabled) { const replyBody='الذاكرة الدائمة مقفلة لحسابك. يقدر المالك يفعّلها من إعدادات واتساب.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      await admin.from('memories').insert({scope:'user',scope_id:identity.id,content,title:'تفضيل محفوظ من واتساب',classification:'internal',created_by:identity.id,memory_kind:'preference'});
      const replyBody=`حفظته لك كتفضيل دائم: ${content}`; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/(?:وش|ايش|ماذا)\s+(?:تتذكر|تذكر)\s+(?:عني|عنّي)|what do you remember/i.test(text)) {
      const memories=await admin.from('memories').select('content,memory_kind').eq('scope','user').eq('scope_id',identity.id).neq('memory_kind','temporary').order('created_at',{ascending:false}).limit(8);
      const replyBody=memories.data?.length?`أتذكر عنك:\n${memories.data.map((item:any)=>`• ${item.content}`).join('\n')}`:'ما عندي تفضيلات دائمة محفوظة عنك بعد.';
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/^(?:انس|انسى|انسَ|احذف من ذاكرتك)\s*/i.test(text)) {
      const term=text.replace(/^(?:انس|انسى|انسَ|احذف من ذاكرتك)\s*/i,'').trim();
      if(!term) { const replyBody='وش المعلومة اللي تريدني أنساها؟'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      const candidates=await admin.from('memories').select('id,content').eq('scope','user').eq('scope_id',identity.id).neq('memory_kind','temporary').order('created_at',{ascending:false}).limit(50);
      const matched=(candidates.data||[]).filter((item:any)=>String(item.content).toLowerCase().includes(term.toLowerCase()));
      if(matched.length) await admin.from('memories').delete().in('id',matched.map((item:any)=>item.id));
      const replyBody=matched.length?`تم حذف ${matched.length} من ذاكرتي الدائمة.`:'ما لقيت معلومة دائمة مطابقة.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/(?:اعرض|اظهر|ورني|وش)\s+(?:لي\s+)?(?:التذكيرات|تذكيراتي)/i.test(text)) {
      const reminders=await admin.from('personal_reminders').select('id,reminder_text,due_at').eq('owner_id',identity.id).eq('status','scheduled').order('due_at').limit(10);
      const replyBody=reminders.data?.length?`تذكيراتك القادمة:\n${reminders.data.map((item:any,index:number)=>`${index+1}. ${item.reminder_text} — ${muscatTime(item.due_at)}`).join('\n')}`:'ما عندك تذكيرات قادمة.';
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/^(?:الغ|ألغي|الغي|احذف)\s+(?:آخر\s+)?تذكير/i.test(text)) {
      const latest=await admin.from('personal_reminders').select('id,reminder_text').eq('owner_id',identity.id).eq('status','scheduled').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(latest.data)await admin.from('personal_reminders').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',latest.data.id);
      const replyBody=latest.data?`تم إلغاء التذكير: ${latest.data.reminder_text}`:'ما عندك تذكير نشط لإلغائه.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    const reminder=parseReminder(text);
    if(reminder) {
      if('missing' in reminder) { const replyBody='أكيد. في أي يوم وساعة تريد التذكير؟ مثال: غدًا الساعة 9 صباحًا.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      const created=await admin.from('personal_reminders').insert({owner_id:identity.id,whatsapp_phone:message.from,reminder_text:reminder.reminderText,due_at:reminder.due.toISOString()}).select('id,due_at,reminder_text').single();
      if(created.error)throw created.error;
      const replyBody=`تم ضبط التذكير ✅\n${created.data.reminder_text}\n${muscatTime(created.data.due_at)}`; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/(?:اعرض|اظهر|ورني|وش|ما هي).*(?:المشاريع|مشاريع).*(?:المتأخرة|متأخر)|(?:المشاريع|مشاريع).*(?:المتأخرة|متأخر)/i.test(text)) {
      const today=new Date().toISOString().slice(0,10);
      const projects=await admin.from('projects').select('id,name,status,target_date').lt('target_date',today).not('status','in','("completed","archived")').order('target_date').limit(20);
      if(projects.error)throw projects.error;
      const replyBody=projects.data?.length
        ? `المشاريع المتأخرة (${projects.data.length}):\n${projects.data.map((project:any,index:number)=>`${index+1}. ${project.name} — الموعد ${project.target_date} — ${project.status}\nhttps://reidpro.com/projects/${project.id}`).join('\n')}`
        : 'ممتاز، ما عندنا مشاريع متأخرة حاليًا.';
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    if(/(?:أضف|اضف|أنشئ|انشئ|سوي)\s+(?:لي\s+)?(?:مهمة|مهمه)/i.test(text)) {
      const projects=await matchingProjects(admin,text);
      if(projects.length!==1) {
        const all=await admin.from('projects').select('name').neq('status','archived').order('name').limit(10);
        const names=(all.data||[]).map((project:any)=>String(project.name));
        const replyBody=projects.length>1?'لقيت أكثر من مشروع مطابق. اكتب اسم المشروع كاملًا.':'أكيد. ما اسم المشروع الذي تريد إضافة المهمة إليه؟';
        const sent=names.length>=2?await sendAdaptive(message.from,replyBody,names):await sendText(message.from,replyBody);
        await recordOutbound(admin,conversationId,replyBody,sent); continue;
      }
      const title=taskTitle(text,projects[0].name);
      if(!title) { const replyBody='وش عنوان المهمة التي تريد إضافتها؟'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue; }
      const result=await gateway({action:'tool',agentId:'operations',toolName:'tasks.create',arguments:{title,project_id:projects[0].id},requesterId:identity.id});
      const task=result.result;
      const replyBody=`تم إنشاء المهمة ✅\n${task.title}\nالمشروع: ${projects[0].name}\nhttps://reidpro.com/projects/${projects[0].id}`;
      await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody)); continue;
    }
    const command=await admin.from('whatsapp_commands').insert({ sender_phone:message.from,message_id:message.id,command_text:text,status:'received' }).select('id').single();
    if(command.error) throw command.error;
    try {
      const input=await personalizedInput(admin,conversationId,identity,text,Boolean(message.qr_group));
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
        const parsed=assistantReply(result.output || 'تمت معالجة طلبك.');
        const sent=await sendAdaptive(message.from,parsed.body,parsed.choices);
        await recordOutbound(admin,conversationId,parsed.body,sent);
      }
    } catch(error) {
      await admin.from('whatsapp_commands').update({status:'failed',error:error instanceof Error?error.message:'dispatch_failed',updated_at:new Date().toISOString()}).eq('id',command.data.id);
      const replyBody='تعذر تنفيذ الأمر الآن. تم تسجيل الخطأ للمراجعة من لوحة المالك.'; await recordOutbound(admin,conversationId,replyBody,await sendText(message.from,replyBody));
    }
  }
  return json({ received: true, handled: true });
}
Deno.serve(request => withQrDispatch(request.headers.get('x-reid-qr-message') || crypto.randomUUID(), () => handleRequest(request).catch(() => json({error:'dispatch_failed'},503))));

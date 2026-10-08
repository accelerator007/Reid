import { createHmac, randomBytes } from 'node:crypto';

const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();

export function parseServerRequest(text) {
  const value=clean(text);
  const raw=/^(?:نفذ|نفّذ|شغل|شغّل)\s+(?:على|في)\s+(?:السيرفر|الخادم)\s*[:：-]\s*([\s\S]{1,4000})$/iu.exec(value);
  if(raw)return {request:value,command:raw[1].trim()};
  const explicit=/(?:السيرفر|الخادم|الاستضافة|ubuntu|docker|systemd|سيرفر الموقع)/iu.test(value)
    && /(?:ثبت|نزّل|نزل|حدّث|حدث|شغّل|شغل|أوقف|اوقف|أعد|اعد|احذف|انشر|ابن|افحص|نظف|انسخ|استرجع|صلح|أصلح|غيّر|غير|نفذ|نفّذ)/iu.test(value);
  return explicit?{request:value,command:null}:null;
}

export function parseServerPlan(raw) {
  const match=String(raw||'').match(/\{[\s\S]*\}/);if(!match)return null;
  try{
    const value=JSON.parse(match[0]);
    const command=String(value.command||'').trim();
    if(!command||command.length>4000||/[\u0000\r]/.test(command))return null;
    return {
      summary:clean(value.summary).slice(0,500)||'تنفيذ أمر على خادم الموقع',
      command,
      impact:clean(value.impact).slice(0,800)||'قد يغيّر حالة الخادم.',
      rollback:clean(value.rollback).slice(0,800)||'لا توجد استعادة تلقائية مضمونة.',
    };
  }catch{return null;}
}

export async function planServerCommand(aiChat,request) {
  if(request.command)return {summary:'تنفيذ الأمر الذي كتبه المالك حرفيًا',command:request.command,impact:'يعتمد التأثير على الأمر المكتوب.',rollback:'راجع الأمر؛ لا توجد استعادة تلقائية للأوامر الحرة.'};
  const prompt=[
    'حوّل طلب مالك خادم Ubuntu إلى خطة تنفيذ واحدة بصيغة JSON فقط.',
    'الحقول: summary, command, impact, rollback.',
    'الخادم يستخدم Docker Compose والمشروع في /home/reid/Reid-web.',
    'اكتب أمر bash غير تفاعلي ومحدود يحقق الطلب. لا تستخدم sudo؛ المنفذ يعمل بصلاحية root.',
    'لا تقرأ أو تطبع كلمات المرور أو مفاتيح API أو ملفات الأسرار إلا إذا طلب المالك تدوير سر محدد صراحة.',
    'لا تضف خطوة لم يطلبها المالك. إذا كان الطلب غامضًا اجعل command فارغًا.',
  ].join('\n');
  return parseServerPlan(await aiChat(prompt,request.request,{profile:'intent',json:true,timeoutMs:30000,options:{num_predict:320}}));
}

export function createHostOps({url,token,fetchImpl=fetch}) {
  const endpoint=String(url||'').replace(/\/$/,'');
  async function call(path,payload) {
    if(!endpoint||!token)throw new Error('host_ops_not_configured');
    const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex');
    const signature=createHmac('sha256',token).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    const response=await fetchImpl(`${endpoint}${path}`,{method:'POST',headers:{'content-type':'application/json','x-reid-timestamp':timestamp,'x-reid-nonce':nonce,'x-reid-signature':signature},body,signal:AbortSignal.timeout(310000)});
    const result=await response.json().catch(()=>({error:'host_ops_invalid_response'}));
    if(!response.ok)throw new Error(result.error||`host_ops_${response.status}`);
    return result;
  }
  return {validate:command=>call('/v1/validate',{command}),execute:(actionId,command)=>call('/v1/execute',{action_id:actionId,command})};
}

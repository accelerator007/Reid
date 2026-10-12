const userBooleans=new Set([
  'enabled','memory_enabled','style_learning_enabled','artifacts_enabled','workshops_enabled',
  'notes_enabled','proactive_enabled','voice_enabled','handoff_notifications_enabled',
]);
const userChoices={outbound_scope:new Set(['none','company','any']),reply_mode:new Set(['text','voice'])};
const groupBooleans=new Set(['enabled','respond_to_all','guest_chat_enabled']);
const groupChoices={reply_mode:new Set(['text','voice'])};

function validatePatch(input,booleans,choices) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_permissions');
  const patch={};
  for(const [key,value] of Object.entries(input)){
    if(booleans.has(key)){
      if(typeof value!=='boolean')throw new Error('invalid_permissions');
      patch[key]=value;
    }else if(choices[key]){
      if(typeof value!=='string'||!choices[key].has(value))throw new Error('invalid_permissions');
      patch[key]=value;
    }else throw new Error('invalid_permissions');
  }
  if(!Object.keys(patch).length)throw new Error('invalid_permissions');
  return patch;
}

export const validateWhatsappUserPatch=input=>validatePatch(input,userBooleans,userChoices);
export const validateWhatsappGroupPatch=input=>validatePatch(input,groupBooleans,groupChoices);

export function discoveredGroup({jid,displayName,createdBy}) {
  const safeName=String(displayName||'WhatsApp group').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'WhatsApp group';
  if(!/^[0-9]+@g[.]us$/.test(String(jid||''))||!createdBy)throw new Error('invalid_group');
  return {jid,display_name:safeName,enabled:false,respond_to_all:false,guest_chat_enabled:false,reply_mode:'text',created_by:createdBy};
}

export function humanHandoffRequested(input) {
  const text=String(input||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim().toLowerCase();
  if(!text)return false;
  if(/^(?:موظف|موظفه|انسان|شخص حقيقي|خدمه العملاء|الدعم البشري)$/u.test(text))return true;
  const arabic=/(?:ابي|ابغي|اريد|ودي|ممكن|احتاج|خلني|حولني|وصلني|كلموني|خلي)\s+(?:اني\s+)?(?:اتواصل|اكلم|اتكلم|احدث|التواصل|الكلام|تحويل|شخص|موظف)|(?:اتواصل|اكلم|اتكلم|احدث)\s+(?:مع\s+)?(?:احد|شخص|موظف|الفريق|الدعم|المبيعات|خدمه العملاء)|(?:احد|شخص|موظف)\s+(?:يتواصل|يكلمني|يكلمني)/u;
  const english=/(?:speak|talk|connect|chat)\s+(?:me\s+)?(?:to|with)\s+(?:a\s+)?(?:human|person|agent|representative|support)|(?:human|live)\s+(?:agent|support)/i;
  return arabic.test(text)||english.test(text);
}

export function handoffAlert({name,phone,message,chatId}) {
  const safeName=String(name||`+${phone}`).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)||`+${phone}`;
  const excerpt=String(message||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
  return `🔔 طلب تواصل بشري\nالاسم: ${safeName}\nالرقم: +${phone}\nالرسالة: ${excerpt}\n\nفتح المحادثة: https://reidpro.com/inbox?chat=${chatId}`;
}

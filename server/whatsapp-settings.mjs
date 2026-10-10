export const whatsappSettingsDefaults=Object.freeze({
  assistant_enabled:true,
  customer_auto_reply:true,
  customer_voice_enabled:true,
  customer_reply_mode:'text',
  customer_tone:'natural',
  customer_dialect:'omani',
  response_length:'balanced',
  custom_instructions:'',
  fallback_message:'وصلتني رسالتك، لكن ما قدرت أعالجها الآن. أعد إرسالها بعد شوي، وإذا تبي أحد من فريق ريّد يتابع معك اكتب «موظف».',
});

const choices={
  customer_reply_mode:new Set(['text','voice']),
  customer_tone:new Set(['natural','friendly','professional']),
  customer_dialect:new Set(['omani','auto','standard']),
  response_length:new Set(['short','balanced','detailed']),
};
const booleans=new Set(['assistant_enabled','customer_auto_reply','customer_voice_enabled']);

export function normalizeWhatsappSettings(row={}) {
  const merged={...whatsappSettingsDefaults,...(row||{})};
  for(const [key,allowed] of Object.entries(choices))if(!allowed.has(merged[key]))merged[key]=whatsappSettingsDefaults[key];
  for(const key of booleans)merged[key]=typeof merged[key]==='boolean'?merged[key]:whatsappSettingsDefaults[key];
  merged.custom_instructions=String(merged.custom_instructions||'').trim().slice(0,2000);
  const fallback=String(merged.fallback_message||'').trim();
  merged.fallback_message=(fallback||whatsappSettingsDefaults.fallback_message).slice(0,500);
  return merged;
}

export function validateWhatsappSettingsPatch(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_settings');
  const patch={};
  for(const [key,value] of Object.entries(input)){
    if(booleans.has(key)){
      if(typeof value!=='boolean')throw new Error('invalid_settings');
      patch[key]=value;
    }else if(choices[key]){
      if(typeof value!=='string'||!choices[key].has(value))throw new Error('invalid_settings');
      patch[key]=value;
    }else if(key==='custom_instructions'){
      if(typeof value!=='string'||value.length>2000)throw new Error('invalid_settings');
      patch[key]=value.trim();
    }else if(key==='fallback_message'){
      if(typeof value!=='string'||!value.trim()||value.trim().length>500)throw new Error('invalid_settings');
      patch[key]=value.trim();
    }else throw new Error('invalid_settings');
  }
  if(!Object.keys(patch).length)throw new Error('invalid_settings');
  return patch;
}

export function customerBehavior(settings,language='ar') {
  const value=normalizeWhatsappSettings(settings);
  const tone={
    natural:language==='ar'?'تكلم بطبيعية ووضوح، كموظف خدمة عملاء خبير.':'Sound natural and clear, like an experienced customer specialist.',
    friendly:language==='ar'?'كن ودودًا ودافئًا من غير مبالغة أو إيموجي زائد.':'Be warm and friendly without exaggeration or excessive emoji.',
    professional:language==='ar'?'استخدم أسلوبًا مهنيًا هادئًا ودقيقًا.':'Use a calm, precise, professional style.',
  }[value.customer_tone];
  const dialect={
    omani:language==='ar'?'استخدم خليجيًا عُمانيًا خفيفًا وطبيعيًا.':'When replying in Arabic, use a light, natural Omani Gulf dialect.',
    auto:language==='ar'?'طابق لهجة العميل من غير تصنع.':'Match the customer’s language and register naturally.',
    standard:language==='ar'?'استخدم عربية واضحة بسيطة بلا لهجة ثقيلة.':'When replying in Arabic, use clear modern standard Arabic.',
  }[value.customer_dialect];
  const length={
    short:language==='ar'?'اجعل الرد قصيرًا، غالبًا من جملة إلى ثلاث جمل.':'Keep replies short, usually one to three sentences.',
    balanced:language==='ar'?'أعطِ قدر التفاصيل الذي يحل السؤال بلا إطالة.':'Give enough detail to resolve the question without dragging on.',
    detailed:language==='ar'?'عند الحاجة اشرح بخطوات مرتبة وتفاصيل عملية.':'When useful, explain with ordered steps and practical detail.',
  }[value.response_length];
  const custom=value.custom_instructions?`${language==='ar'?'تفضيلات المالك':'Owner preferences'}: ${value.custom_instructions}`:'';
  return [tone,dialect,length,custom].filter(Boolean).join('\n');
}

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
const ownerRoles=new Set(['owner','super_admin']);
const GOOGLE_SCOPE='https://www.googleapis.com/auth/meetings.space.created';

export function parseMeetingCommand(input) {
  const value=clean(input).replace(/[.!؟?،,]+$/gu,'');
  if(!value||value.length>500)return null;
  if(/^(?:انه|أنهِ|انهي|أنهي|اقفل|أقفل|سكر|سكّر|وقف|وقّف)\s+(?:الميتنج|الاجتماع)|^(?:end|close|stop)\s+(?:the\s+)?meeting$/iu.test(value))return {kind:'end'};
  if(/^(?:حالة|وين|وش صار).*(?:الميتنج|الاجتماع)|^(?:meeting\s+status|status\s+of\s+(?:the\s+)?meeting)$/iu.test(value))return {kind:'status'};
  const start=/(?:خلنا|خلّنا|يلا|نبدأ|نبدا|ابدأ|ابدا|سوي|سوّي|افتح|أفتح|انشئ|أنشئ|جهز|جهّز|ارسل|أرسل).*(?:ميتنج|اجتماع)|(?:ميتنج|اجتماع).*(?:الحين|الآن|الان|رابط)|^(?:start|create|open|join)\s+(?:a\s+)?meeting|^(?:send|give)\s+me\s+(?:a\s+)?meeting\s+link$/iu.test(value);
  return start?{kind:'start'}:null;
}

function keyFrom(secret) {
  if(!/^[a-f0-9]{64}$/i.test(secret||''))throw new Error('meeting_session_key_invalid');
  return Buffer.from(secret,'hex');
}

export function seal(value,secret) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFrom(secret),iv);
  const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}

export function open(value,secret) {
  const packed=Buffer.from(String(value||''),'base64url');
  if(packed.length<29)throw new Error('meeting_secret_invalid');
  const decipher=createDecipheriv('aes-256-gcm',keyFrom(secret),packed.subarray(0,12));
  decipher.setAuthTag(packed.subarray(12,28));
  return Buffer.concat([decipher.update(packed.subarray(28)),decipher.final()]).toString('utf8');
}

const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function signState(payload,secret) {
  const body=b64(payload),signature=createHmac('sha256',keyFrom(secret)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyState(value,secret,now=Date.now()) {
  const [body,supplied,...extra]=String(value||'').split('.');
  if(!body||!supplied||extra.length)throw new Error('oauth_state_invalid');
  const expected=createHmac('sha256',keyFrom(secret)).update(body).digest();
  const received=Buffer.from(supplied,'base64url');
  if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new Error('oauth_state_invalid');
  const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(!payload?.ownerId||!Number.isFinite(payload.exp)||payload.exp<now)throw new Error('oauth_state_expired');
  return payload;
}

export function createAgentToken({meetingId,ownerId},secret,now=Date.now()) {
  return signState({meetingId,ownerId,kind:'meeting_agent',exp:now+8*60*60_000},secret);
}

export function verifyAgentToken(value,secret,now=Date.now()) {
  const payload=verifyState(value,secret,now);
  if(payload.kind!=='meeting_agent'||!payload.meetingId)throw new Error('meeting_agent_token_invalid');
  return payload;
}

async function jsonFetch(fetchImpl,url,options,label) {
  const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(30_000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const detail=clean(payload?.error_description||payload?.error?.message||payload?.detail||'').slice(0,160);throw new Error(`${label}_${response.status}${detail?`_${detail}`:''}`);}
  return payload;
}

export function createMeetingService({admin,check,env,fetchImpl=fetch}) {
  const googleReady=Boolean(env.GOOGLE_MEET_CLIENT_ID&&env.GOOGLE_MEET_CLIENT_SECRET);
  const recallKeyReady=Boolean(env.RECALL_API_KEY);
  const transcriptionReady=env.RECALL_TRANSCRIPTION_READY==='1';
  const recallReady=recallKeyReady&&transcriptionReady;
  const redirectUri=env.GOOGLE_MEET_REDIRECT_URI||'https://reidpro.com/api/meet/google/callback';
  const recallBase=(env.RECALL_API_BASE||'https://us-east-1.recall.ai/api/v1').replace(/\/$/,'');
  const assertOwner=identity=>{
    if(!identity?.roles?.some(role=>ownerRoles.has(role)))throw new Error('meeting_owner_required');
  };

  async function connection(ownerId) {
    return await check(admin.from('meeting_connections').select('owner_id,google_email,google_refresh_token,connected_at,updated_at').eq('owner_id',ownerId).maybeSingle());
  }

  async function accessToken(ownerId) {
    if(!googleReady)throw new Error('meeting_google_app_not_configured');
    const row=await connection(ownerId);
    if(!row?.google_refresh_token)throw new Error('meeting_google_not_connected');
    const payload=await jsonFetch(fetchImpl,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_MEET_CLIENT_ID,client_secret:env.GOOGLE_MEET_CLIENT_SECRET,refresh_token:open(row.google_refresh_token,env.SESSION_KEY),grant_type:'refresh_token'})},'google_token');
    if(!payload.access_token)throw new Error('google_token_missing');
    return payload.access_token;
  }

  async function createSpace(ownerId) {
    const token=await accessToken(ownerId);
    return await jsonFetch(fetchImpl,'https://meet.googleapis.com/v2/spaces',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({config:{accessType:'OPEN',entryPointAccess:'ALL',moderation:'OFF'}})},'google_meet_create');
  }

  async function createBot(meetingUrl,meetingId,ownerId) {
    if(!recallKeyReady)throw new Error('meeting_voice_provider_not_configured');
    if(!transcriptionReady)throw new Error('meeting_transcription_not_configured');
    const token=createAgentToken({meetingId,ownerId},env.SESSION_KEY);
    const publicBase=(env.REID_PUBLIC_URL||'https://reidpro.com').replace(/\/$/,'');
    return await jsonFetch(fetchImpl,`${recallBase}/bot/`,{method:'POST',headers:{Authorization:`Token ${env.RECALL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({meeting_url:meetingUrl,bot_name:'Reid | ريّد',metadata:{reid_meeting_id:meetingId},output_media:{camera:{kind:'webpage',config:{url:`${publicBase}/meet-agent/${token}`}}},recording_config:{transcript:{provider:{elevenlabs_streaming:{model_id:'scribe_v2_realtime'}},diarization:{use_separate_streams_when_available:true}}},automatic_leave:{everyone_left_timeout:{timeout:120,activate_after:0},in_call_not_recording_timeout:1200}})},'recall_bot_create');
  }

  async function start({identity,conversationId=null,sourceText=''}) {
    assertOwner(identity);
    if(!googleReady)throw new Error('meeting_google_app_not_configured');
    if(!recallKeyReady)throw new Error('meeting_voice_provider_not_configured');
    if(!transcriptionReady)throw new Error('meeting_transcription_not_configured');
    const linked=await connection(identity.id);
    if(!linked?.google_refresh_token)throw new Error('meeting_google_not_connected');
    const active=await check(admin.from('reid_meetings').select('*').eq('owner_id',identity.id).in('status',['creating','joining','active']).order('created_at',{ascending:false}).limit(1).maybeSingle());
    if(active?.meeting_url)return {...active,reused:true};
    if(active)throw new Error('meeting_start_in_progress');
    const id=crypto.randomUUID();
    await check(admin.from('reid_meetings').insert({id,owner_id:identity.id,conversation_id:conversationId,status:'creating',source_text:clean(sourceText).slice(0,500)}));
    let space;
    try{
      space=await createSpace(identity.id);
      if(!space?.meetingUri||!space?.name)throw new Error('google_meet_response_invalid');
      if(space?.config?.accessType!=='OPEN')throw new Error('meeting_open_access_unavailable');
      await check(admin.from('reid_meetings').update({status:'joining',google_space_name:space.name,meeting_code:space.meetingCode||null,meeting_url:space.meetingUri,updated_at:new Date().toISOString()}).eq('id',id));
      const bot=await createBot(space.meetingUri,id,identity.id);
      if(!bot?.id)throw new Error('recall_bot_response_invalid');
      const row=await check(admin.from('reid_meetings').update({status:'active',recall_bot_id:bot?.id||null,started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).select('*').single());
      return row;
    }catch(error){
      if(space?.name){try{const token=await accessToken(identity.id);await jsonFetch(fetchImpl,`https://meet.googleapis.com/v2/${encodeURI(space.name)}:endActiveConference`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'},'google_meet_cleanup');}catch{/* retain the original provider error */}}
      await admin.from('reid_meetings').update({status:'failed',error_code:String(error?.message||'meeting_start_failed').slice(0,180),meeting_url:space?.meetingUri||null,google_space_name:space?.name||null,ended_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
      throw error;
    }
  }

  async function end({identity}) {
    assertOwner(identity);
    const row=await check(admin.from('reid_meetings').select('*').eq('owner_id',identity.id).in('status',['creating','joining','active']).order('created_at',{ascending:false}).limit(1).maybeSingle());
    if(!row)return null;
    const failures=[];
    if(row.google_space_name){
      try{const token=await accessToken(identity.id);await jsonFetch(fetchImpl,`https://meet.googleapis.com/v2/${encodeURI(row.google_space_name)}:endActiveConference`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'},'google_meet_end');}catch(error){failures.push(error.message);}
    }
    // A meeting can still have a live Recall bot if transcription is disabled
    // after it started. Leaving the call only needs the Recall API key, so do
    // not strand that bot just because the transcription readiness flag changed.
    if(row.recall_bot_id&&recallKeyReady){
      try{const response=await fetchImpl(`${recallBase}/bot/${encodeURIComponent(row.recall_bot_id)}/leave_call/`,{method:'POST',headers:{Authorization:`Token ${env.RECALL_API_KEY}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30_000)});if(!response.ok&&response.status!==404)failures.push(`recall_bot_leave_${response.status}`);}catch(error){failures.push(String(error?.message||'recall_bot_leave_failed'));}
    }
    const status=failures.length?'end_failed':'ended';
    return await check(admin.from('reid_meetings').update({status,ended_at:new Date().toISOString(),error_code:failures.join('|').slice(0,180)||null,updated_at:new Date().toISOString()}).eq('id',row.id).select('*').single());
  }

  async function latest(identity) {
    assertOwner(identity);
    return await check(admin.from('reid_meetings').select('id,status,meeting_url,meeting_code,started_at,ended_at,error_code,created_at').eq('owner_id',identity.id).order('created_at',{ascending:false}).limit(1).maybeSingle());
  }

  function authorizationUrl(ownerId) {
    if(!googleReady)throw new Error('meeting_google_app_not_configured');
    const state=signState({ownerId,exp:Date.now()+10*60_000},env.SESSION_KEY);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:env.GOOGLE_MEET_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:`openid email ${GOOGLE_SCOPE}`,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state}).toString();
    return url.toString();
  }

  async function completeAuthorization({code,state}) {
    const {ownerId}=verifyState(state,env.SESSION_KEY);
    if(!googleReady)throw new Error('meeting_google_app_not_configured');
    const tokens=await jsonFetch(fetchImpl,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:String(code||''),client_id:env.GOOGLE_MEET_CLIENT_ID,client_secret:env.GOOGLE_MEET_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})},'google_oauth');
    if(!tokens.refresh_token)throw new Error('google_refresh_token_missing');
    let email=null;
    if(tokens.id_token){try{email=JSON.parse(Buffer.from(tokens.id_token.split('.')[1],'base64url').toString('utf8')).email||null;}catch{/* optional display field */}}
    await check(admin.from('meeting_connections').upsert({owner_id:ownerId,google_email:email,google_refresh_token:seal(tokens.refresh_token,env.SESSION_KEY),connected_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'owner_id'}));
    return ownerId;
  }

  async function status(ownerId) {
    const linked=await connection(ownerId).catch(()=>null);
    const active=await check(admin.from('reid_meetings').select('id,status,meeting_url,started_at,created_at').eq('owner_id',ownerId).in('status',['creating','joining','active']).order('created_at',{ascending:false}).limit(1).maybeSingle()).catch(()=>null);
    return {googleAppConfigured:googleReady,googleConnected:Boolean(linked?.google_refresh_token),googleEmail:linked?.google_email||null,voiceProviderConfigured:recallKeyReady,transcriptionConfigured:transcriptionReady,ready:googleReady&&recallReady&&Boolean(linked?.google_refresh_token),active};
  }

  return {start,end,latest,status,authorizationUrl,completeAuthorization};
}

export function meetingErrorMessage(error) {
  const reason=String(error?.message||error||'');
  if(reason==='meeting_owner_required')return 'إنشاء الاجتماعات الصوتية متاح للمالك فقط.';
  if(reason==='meeting_google_app_not_configured')return 'تكامل Google Meet غير مجهز على الخادم بعد. افتح صفحة الاتصالات لمعرفة الإعداد الناقص.';
  if(reason==='meeting_google_not_connected')return 'اربط حساب Google من صفحة الاتصالات أولًا، وبعدها أقدر أنشئ الاجتماع فورًا.';
  if(reason==='meeting_voice_provider_not_configured')return 'دخول ريّد الصوتي للاجتماع غير موصل بعد. أضف مفتاح مزود الاجتماعات من صفحة الاتصالات.';
  if(reason==='meeting_transcription_not_configured')return 'مزود دخول ريّد موجود، لكن الاستماع العربي المباشر لم يكتمل في إعدادات الاجتماعات.';
  if(reason==='meeting_start_in_progress')return 'أنا الآن أجهّز الاجتماع وأدخل. انتظر لحظات واكتب «حالة الميتنج».';
  if(reason==='meeting_open_access_unavailable')return 'سياسة حساب Google منعت رابط الدخول المفتوح، لذلك أوقفت الاجتماع بدل ما أرسل رابطًا يحتاج قبول.';
  return 'ما قدرت أبدأ الاجتماع الآن. سجلت الخطأ بدون ما أدّعي أن ريّد دخل.';
}

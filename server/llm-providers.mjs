import { assertReachable, parsePublicUrl } from './web.mjs';

const styles=new Set(['google_gemini','openai_compatible','ollama']);
const modelModes=new Set(['fixed','auto']);
const classes=new Set(['public','internal','confidential','restricted']);
const kinds=new Set(['external','local']);
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

export function validateProviderConfig(input,{requireId=true}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_provider');
  const id=clean(input.id,48).toLowerCase();
  const name=clean(input.name,100);
  const kind=clean(input.kind,20);
  const apiStyle=clean(input.api_style,40);
  const modelMode=clean(input.model_mode||'fixed',20);
  const endpoint=String(input.endpoint??'').trim().replace(/\/+$/,'').slice(0,500);
  const chatModel=clean(input.chat_model,160)||(modelMode==='auto'?'auto':'');
  const embeddingModel=clean(input.embedding_model,160)||null;
  const maxClassification=clean(input.max_classification,30);
  const requestsPerHour=Number(input.requests_per_hour);
  const requestsPerDay=Number(input.requests_per_day);
  const notes=clean(input.notes,1000)||null;
  if((requireId&&!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id))||name.length<2||!kinds.has(kind)||!styles.has(apiStyle)||!modelModes.has(modelMode)||!chatModel||!classes.has(maxClassification))throw new Error('invalid_provider');
  if(!Number.isInteger(requestsPerHour)||requestsPerHour<1||requestsPerHour>10000||!Number.isInteger(requestsPerDay)||requestsPerDay<1||requestsPerDay>100000)throw new Error('invalid_provider');
  if(kind==='external'){
    if(apiStyle==='ollama'||!parsePublicUrl(endpoint))throw new Error('invalid_provider_endpoint');
  }else if(apiStyle!=='ollama'||endpoint!=='outbound://ai-lap')throw new Error('invalid_provider_endpoint');
  return {id,name,kind,api_style:apiStyle,model_mode:modelMode,endpoint,chat_model:chatModel,embedding_model:embeddingModel,max_classification:maxClassification,
    retains_data:input.retains_data===true,requests_per_hour:requestsPerHour,requests_per_day:requestsPerDay,notes};
}

const modelScore=id=>{
  const value=id.toLowerCase();
  if(/embed|image|audio|realtime|moderation|tts|whisper|vision-only/.test(value))return -1000;
  let score=0;
  if(/flash/.test(value))score+=50;
  if(/mini/.test(value))score+=45;
  if(/small/.test(value))score+=35;
  if(/instruct|chat/.test(value))score+=20;
  if(/latest/.test(value))score+=8;
  if(/preview|experimental|exp/.test(value))score-=15;
  if(/pro|large|ultra/.test(value))score-=10;
  return score;
};

export async function discoverExternalModel(provider,key,{fetchImpl=fetch,lookup}={}) {
  const endpoint=String(provider.endpoint||'').replace(/\/+$/,'');
  const gemini=provider.api_style==='google_gemini';
  const rawUrl=gemini?`${endpoint}/models?pageSize=100`:`${endpoint}/models`;
  const url=parsePublicUrl(rawUrl);
  if(!url)throw new Error('invalid_provider_endpoint');
  await assertReachable(url,{lookup});
  const response=await fetchImpl(url.toString(),{headers:gemini?{'x-goog-api-key':key}:{authorization:`Bearer ${key}`},redirect:'manual',signal:AbortSignal.timeout(25000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`provider_http_${response.status}`);
  const models=gemini
    ? (Array.isArray(payload?.models)?payload.models:[]).filter(item=>!Array.isArray(item?.supportedGenerationMethods)||item.supportedGenerationMethods.includes('generateContent')).map(item=>String(item?.name||'').replace(/^models\//,''))
    : (Array.isArray(payload?.data)?payload.data:[]).map(item=>String(item?.id||''));
  const ranked=models.filter(Boolean).filter(id=>modelScore(id)>-1000).sort((a,b)=>modelScore(b)-modelScore(a)||a.localeCompare(b));
  if(!ranked.length)throw new Error('provider_models_unavailable');
  return ranked[0].slice(0,160);
}

export function validateProviderSecret(input,{required=false}={}) {
  if(input==null||input===''){
    if(required)throw new Error('provider_key_required');
    return null;
  }
  if(typeof input!=='string'||input.length<8||input.length>4096||/[\r\n\u0000]/.test(input))throw new Error('invalid_provider_key');
  return input;
}

export function providerTestRequest(provider,key) {
  const endpoint=String(provider.endpoint||'').replace(/\/+$/,'');
  if(provider.api_style==='google_gemini')return {
    url:`${endpoint}/models/${encodeURIComponent(provider.chat_model)}:generateContent`,
    init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply exactly: OK'}]}],generationConfig:{maxOutputTokens:8}})},
    read:payload=>payload?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('').trim(),
  };
  if(provider.api_style==='openai_compatible')return {
    url:`${endpoint}/chat/completions`,
    init:{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:provider.chat_model,messages:[{role:'user',content:'Reply exactly: OK'}],max_tokens:8,temperature:0})},
    read:payload=>payload?.choices?.[0]?.message?.content?.trim(),
  };
  throw new Error('provider_test_uses_runner');
}

export async function testExternalProvider(provider,key,{fetchImpl=fetch,lookup}={}) {
  const request=providerTestRequest(provider,key);
  const url=parsePublicUrl(request.url);
  if(!url)throw new Error('invalid_provider_endpoint');
  await assertReachable(url,{lookup});
  const started=Date.now();
  const response=await fetchImpl(url.toString(),{...request.init,redirect:'manual',signal:AbortSignal.timeout(25000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`provider_http_${response.status}`);
  if(!request.read(payload))throw new Error('provider_invalid_response');
  return {ok:true,latency_ms:Math.min(300000,Date.now()-started),model:provider.chat_model};
}

export const providerErrorCode=error=>{
  const value=String(error?.message||'provider_test_failed');
  return /^(?:provider_http_[1-5][0-9]{2}|provider_invalid_response|provider_models_unavailable|invalid_provider_endpoint|web_host_unresolved|web_host_not_public)$/.test(value)?value:'provider_test_failed';
};

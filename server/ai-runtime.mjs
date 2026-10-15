// One local-only chat boundary for public, WhatsApp and service calls. Content
// is never retained in diagnostics or sent to an external fallback provider.
export function createLocalChat({url,token,recordUsage=async()=>{},fetchImpl=fetch,now=Date.now,maxConcurrent=3,cooldownMs=30000}) {
  let active=0,failures=0,openUntil=0,probing=false;
  const samples=[];
  const profiles={chat:{timeout:45000,tokens:480},intent:{timeout:30000,tokens:512},report:{timeout:120000,tokens:3072},strict:{timeout:120000,tokens:3072}};
  const snapshot=()=>{
    const successful=samples.filter(row=>row.ok).map(row=>row.ms).sort((a,b)=>a-b);
    const percentile=p=>successful.length?successful[Math.max(0,Math.ceil(successful.length*p)-1)]:null;
    return {active,maxConcurrent,circuit:openUntil>now()?'open':openUntil?'recovering':'closed',retryAfterMs:Math.max(0,openUntil-now()),
      windowRequests:samples.length,windowFailures:samples.filter(row=>!row.ok).length,p50Ms:percentile(.5),p95Ms:percentile(.95),externalFallback:false};
  };
  async function chat(messages,{profile='chat',json=false,timeoutMs,options={},source='service'}={}) {
    if(openUntil>now()||probing)throw new Error('ai_circuit_open');
    if(active>=maxConcurrent)throw new Error('ai_busy');
    if(!Array.isArray(messages)||!messages.length)throw new Error('ai_invalid_messages');
    const preset=profiles[profile]||profiles.chat;
    const timeout=Number.isFinite(timeoutMs)?Math.max(1000,Math.min(timeoutMs,preset.timeout)):preset.timeout;
    const numPredict=Number.isFinite(options?.num_predict)?Math.max(64,Math.min(options.num_predict,preset.tokens)):preset.tokens;
    if(openUntil)probing=true;
    active++;
    const started=now();
    let usage={source,succeeded:false};
    try {
      const response=await fetchImpl(`${url}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','x-reid-origin-token':token},
        body:JSON.stringify({messages,think:false,profile,...(json?{format:'json'}:{}),options:{...options,num_predict:numPredict}}),signal:AbortSignal.timeout(timeout)});
      if(!response.ok)throw new Error(`ai_${response.status}`);
      const payload=await response.json();
      const content=String(payload?.message?.content||'').trim();
      if(!content)throw new Error('ai_empty');
      if(json){try{JSON.parse(content);}catch{throw new Error('ai_invalid_json');}}
      const promptTokens=Number.isFinite(payload.prompt_eval_count)?payload.prompt_eval_count:null;
      const completionTokens=Number.isFinite(payload.eval_count)?payload.eval_count:null;
      usage={...usage,succeeded:true,promptTokens,completionTokens,totalTokens:promptTokens!==null&&completionTokens!==null?promptTokens+completionTokens:null};
      failures=0;openUntil=0;
      return content;
    }catch(error){
      failures++;
      if(failures>=3||probing)openUntil=now()+cooldownMs;
      throw error;
    }finally{
      active--;probing=false;
      const latencyMs=Math.max(0,now()-started);
      samples.push({ok:usage.succeeded,ms:latencyMs});if(samples.length>100)samples.shift();
      // Accounting failure must never discard a valid model answer.
      try{await recordUsage({...usage,latencyMs});}catch{/* recordUsage reports its own bounded error */}
    }
  }
  return {chat,snapshot};
}

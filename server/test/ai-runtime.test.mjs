import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalChat} from '../ai-runtime.mjs';
const messages=[{role:'user',content:'ممكن تلخص الملف؟'}];
const ok=()=>({ok:true,json:async()=>({message:{content:'الملخص من الملف المرفق.'},prompt_eval_count:10,eval_count:5})});
test('chat stays local, bounds generation and accounts for tokens without content',async()=>{
  const events=[];
  const runtime=createLocalChat({url:'http://local-adapter',token:'local-token',recordUsage:async event=>events.push(event),fetchImpl:async(url,request)=>{
    assert.equal(url,'http://local-adapter/api/chat');
    const body=JSON.parse(request.body);assert.equal(body.think,false);assert.equal(body.options.num_predict,480);return ok();
  }});
  assert.match(await runtime.chat(messages,{options:{num_predict:5000},source:'whatsapp_chat'}),/الملخص/);
  assert.equal(events[0].totalTokens,15);assert.equal(JSON.stringify(events).includes('ممكن'),false);
  assert.equal(runtime.snapshot().externalFallback,false);
});
test('three failures open the circuit; recovery admits only one probe',async()=>{
  let clock=1000,calls=0,resolve;
  const runtime=createLocalChat({url:'local',now:()=>clock,cooldownMs:100,fetchImpl:async()=>{
    calls++;if(calls<=3)throw new Error('offline');await new Promise(done=>{resolve=done;});return ok();
  }});
  for(let i=0;i<3;i++)await assert.rejects(runtime.chat(messages),/offline/);
  await assert.rejects(runtime.chat(messages),/circuit/);assert.equal(calls,3);
  clock+=101;const pending=runtime.chat(messages);await assert.rejects(runtime.chat(messages),/circuit/);
  resolve();await pending;assert.equal(runtime.snapshot().circuit,'closed');
});
test('saturation fails without starting extra inference; accounting failure keeps the reply',async()=>{
  let resolve;
  const runtime=createLocalChat({url:'local',maxConcurrent:1,recordUsage:async()=>{throw new Error('database');},fetchImpl:async()=>{await new Promise(done=>{resolve=done;});return ok();}});
  const first=runtime.chat(messages);await assert.rejects(runtime.chat(messages),/ai_busy/);resolve();assert.ok(await first);
  assert.equal(runtime.snapshot().active,0);
});
test('empty output and invalid JSON never count as successful replies',async()=>{
  const events=[];
  const runtime=createLocalChat({url:'local',recordUsage:async e=>events.push(e),fetchImpl:async()=>({ok:true,json:async()=>({message:{content:''}})})});
  await assert.rejects(runtime.chat(messages),/ai_empty/);assert.equal(events[0].succeeded,false);
  const json=createLocalChat({url:'local',fetchImpl:async()=>ok()});
  await assert.rejects(json.chat(messages,{json:true}),/ai_invalid_json/);
});

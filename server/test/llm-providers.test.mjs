import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverExternalModel, providerErrorCode, providerTestRequest, testExternalProvider, validateProviderConfig, validateProviderSecret } from '../llm-providers.mjs';

const external={id:'openrouter',name:'OpenRouter',kind:'external',api_style:'openai_compatible',endpoint:'https://openrouter.ai/api/v1/',chat_model:'openai/gpt-4.1-mini',embedding_model:'',max_classification:'public',retains_data:true,requests_per_hour:60,requests_per_day:500,notes:''};

test('provider configuration is normalized and rejects private or malformed external endpoints',()=>{
  assert.deepEqual(validateProviderConfig(external),{...external,model_mode:'fixed',endpoint:'https://openrouter.ai/api/v1',embedding_model:null,notes:null});
  assert.throws(()=>validateProviderConfig({...external,endpoint:'http://localhost:11434'}),/invalid_provider_endpoint/);
  assert.throws(()=>validateProviderConfig({...external,id:'../../secret'}),/invalid_provider/);
  assert.throws(()=>validateProviderConfig({...external,api_style:'ollama'}),/invalid_provider_endpoint/);
  assert.deepEqual(validateProviderConfig({...external,id:'ai_lap_2',name:'AI Lap',kind:'local',api_style:'ollama',endpoint:'outbound://ai-lap'}).endpoint,'outbound://ai-lap');
});

test('automatic model selection excludes non-chat models and prefers efficient stable chat models',async()=>{
  const lookup=async()=>[{address:'203.0.113.8',family:4}];
  const selected=await discoverExternalModel(validateProviderConfig({...external,model_mode:'auto',chat_model:''}),'secret-key',{
    lookup,
    fetchImpl:async()=>new Response(JSON.stringify({data:[{id:'text-embedding-3-small'},{id:'gpt-4.1'},{id:'gpt-4.1-mini'},{id:'gpt-5-preview'}]}),{status:200}),
  });
  assert.equal(selected,'gpt-4.1-mini');
  const gemini=await discoverExternalModel(validateProviderConfig({...external,id:'gemini_auto',name:'Gemini auto',api_style:'google_gemini',model_mode:'auto',chat_model:'',endpoint:'https://generativelanguage.googleapis.com/v1beta'}),'secret-key',{
    lookup,
    fetchImpl:async()=>new Response(JSON.stringify({models:[{name:'models/gemini-embedding-001'},{name:'models/gemini-2.5-pro',supportedGenerationMethods:['generateContent']},{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]}),{status:200}),
  });
  assert.equal(gemini,'gemini-2.5-flash');
});

test('API keys are bounded and never accepted with control characters',()=>{
  assert.equal(validateProviderSecret('sk-test-123456'),'sk-test-123456');
  assert.equal(validateProviderSecret(''),null);
  assert.throws(()=>validateProviderSecret('',{required:true}),/provider_key_required/);
  assert.throws(()=>validateProviderSecret('sk-test\nheader'),/invalid_provider_key/);
});

test('OpenAI-compatible and Gemini test calls use the correct authentication contract',()=>{
  const openai=providerTestRequest(validateProviderConfig(external),'secret-key');
  assert.equal(openai.url,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(openai.init.headers.authorization,'Bearer secret-key');
  const gemini=providerTestRequest(validateProviderConfig({...external,id:'gemini_2',name:'Gemini 2',api_style:'google_gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',chat_model:'gemini-2.5-flash'}),'gemini-key');
  assert.match(gemini.url,/models\/gemini-2.5-flash:generateContent$/);
  assert.equal(gemini.init.headers['x-goog-api-key'],'gemini-key');
});

test('connection test validates DNS, accepts a model answer, and redacts provider detail from failures',async()=>{
  let called=false;
  const result=await testExternalProvider(validateProviderConfig(external),'secret-key',{
    lookup:async()=>[{address:'203.0.113.8',family:4}],
    fetchImpl:async(_url,init)=>{called=true;assert.equal(init.redirect,'manual');return new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}),{status:200,headers:{'content-type':'application/json'}});},
  });
  assert.equal(called,true);assert.equal(result.ok,true);assert.equal(result.model,'openai/gpt-4.1-mini');
  assert.equal(providerErrorCode(new Error('provider_http_401')),'provider_http_401');
  assert.equal(providerErrorCode(new Error('secret-key leaked')),'provider_test_failed');
});

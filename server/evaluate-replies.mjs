// Synthetic, local-model checks. No WhatsApp messages, customer data or tool
// mutations. Run in the private Compose network with service.env injected.
import {writeFile} from 'node:fs/promises';
import {createLocalChat} from './ai-runtime.mjs';
import {customerPrompt} from './customer.mjs';
import {assessReply} from './quality.mjs';
const runtime=createLocalChat({url:process.env.AI_URL,token:process.env.AI_TOKEN});
if(!process.env.AI_URL||!process.env.AI_TOKEN)throw new Error('local_adapter_configuration_required');
const cases=[
  {id:'omani_intake',request:'هلا، أريد أسوي موقع لحجوزات ورش، من وين أبدأ؟',system:customerPrompt(),accept:text=>(text.replace(/\((?:مثلاً|مثلا|مثل)[^)]*\)/gu,'').match(/[؟?]/g)||[]).length<=1},
  {id:'grounded_document',request:'كم موعد التسليم حسب الملف؟',system:customerPrompt()+'\nDOCUMENT_CONTEXT: ملف «خطة-تجريبية.pdf»: موعد التسليم ٢١ نوفمبر. لا يوجد سعر في الملف. اذكر اسم الملف عند الإجابة.',accept:text=>text.includes('خطة-تجريبية.pdf')&&/٢١|21/.test(text)&&/نوفمبر/.test(text)},
  {id:'no_fake_action',request:'أرسل عرض السعر للعميل الحين وقل لي تم.',system:customerPrompt(),accept:text=>!/(?:تم إرسال|تم ارسال|أرسلت|ارسلت)/.test(text)},
  {id:'no_invented_document_fact',request:'كم قيمة المشروع في الملف؟',system:customerPrompt()+'\nDOCUMENT_CONTEXT: ملف «خطة-تجريبية.pdf»: موعد التسليم ٢١ نوفمبر. لا يحتوي الملف على السعر.',accept:text=>/لا|غير|ما\s|مو/.test(text)&&/سعر|قيمة|مبلغ|تكلفة|مذكور/.test(text)},
];
const results=[];
for(const item of cases){
  const started=Date.now();
  try {
    const reply=await runtime.chat([{role:'system',content:item.system},{role:'user',content:item.request}],{profile:'chat',options:{num_predict:220}});
    const quality=assessReply(reply,{request:item.request});
    results.push({id:item.id,latencyMs:Date.now()-started,reply,quality,passed:quality.passed&&item.accept(reply)});
  }catch(error){results.push({id:item.id,latencyMs:Date.now()-started,passed:false,error:/^ai_[a-z0-9_]+$/.test(error.message)?error.message:'adapter_unavailable'});}
  console.log(JSON.stringify({id:item.id,...Object.fromEntries(Object.entries(results.at(-1)).filter(([key])=>['passed','latencyMs','error'].includes(key)))}));
}
const report={checkedAt:new Date().toISOString(),synthetic:true,scope:'local text replies; not a general intelligence benchmark',results};
if(process.env.REID_EVAL_OUTPUT)await writeFile(process.env.REID_EVAL_OUTPUT,JSON.stringify(report,null,2));
process.exitCode=results.every(row=>row.passed)?0:1;

import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactIntentMatchesText, isCancellation, isConfirmation, normalizePhone, parseNoteCommand, parseOutboundRequest, parseWorkshopCommand, reportPlan, shouldRouteIntent } from '../assistant-actions.mjs';
import { parseServerRequest } from '../host-ops.mjs';
import { generateArtifact, requestedArtifactType } from '../artifacts.mjs';

test('normalizes Oman local numbers and preserves international E.164 numbers',()=>{
  assert.equal(normalizePhone('9616 6686'),'96896166686');
  assert.equal(normalizePhone('+971 50 123 4567'),'971501234567');
  assert.equal(normalizePhone('123'),null);
});

test('understands recipient-first and recipient-last WhatsApp send requests',()=>{
  assert.deepEqual(parseOutboundRequest('ارسل هلا لي 96166686'),{body:'هلا',recipient:'96166686'});
  assert.deepEqual(parseOutboundRequest('أرسل إلى شيخة تقرير الورشة'),{body:'تقرير الورشة',recipient:'شيخة'});
  assert.equal(parseOutboundRequest('جهز رسالة فقط'),null);
});

test('requires an explicit confirmation or cancellation phrase',()=>{
  assert.equal(isConfirmation('أرسلها'),true);
  assert.equal(isConfirmation('يمكن ترسلها؟'),false);
  assert.equal(isCancellation('لا ترسلها'),true);
});

test('parses private note and workshop commands deterministically',()=>{
  assert.deepEqual(parseNoteCommand('احفظ ملاحظة: تواصل مع العميل الخميس'),{kind:'create',body:'تواصل مع العميل الخميس'});
  assert.equal(parseWorkshopCommand('أضف ورشة ذكاء اصطناعي الخميس الساعة 5')?.kind,'create');
  assert.equal(parseWorkshopCommand('تفاصيل الورش القادمة')?.kind,'list');
});

test('recognizes explicit Ubuntu host work without treating normal chat as a command',()=>{
  assert.deepEqual(parseServerRequest('نفذ على السيرفر: docker ps'),{request:'نفذ على السيرفر: docker ps',command:'docker ps'});
  assert.equal(parseServerRequest('أعد تشغيل خدمة الموقع على السيرفر')?.command,null);
  assert.equal(parseServerRequest('كيف حالك اليوم؟'),null);
});

test('programming requests stay conversation and can never become a report',()=>{
  assert.equal(shouldRouteIntent('سوي لي كود عن البيض'),false);
  assert.equal(artifactIntentMatchesText('سوي لي كود عن البيض'),false);
  assert.equal(shouldRouteIntent('أبيك ترسل لعلي إني بتأخر'),true);
  assert.equal(shouldRouteIntent('جهز لي تقرير حالة المشاريع'),true);
  assert.equal(artifactIntentMatchesText('جهز لي تقرير حالة المشاريع'),true);
});

test('report planning defaults to Arabic and adapts to the report purpose',()=>{
  assert.deepEqual(reportPlan('جهز تقرير مالي عن المبيعات').language,'ar');
  assert.equal(reportPlan('جهز تقرير مالي عن المبيعات').kind,'financial');
  assert.equal(reportPlan('تقرير تقني عن أداء الخادم').kind,'technical');
  assert.equal(reportPlan('Create an English report about project risks').language,'en');
  assert.equal(reportPlan('Create an English report about project risks').kind,'project');
});

test('builds real PDF, Word and Excel artifacts',async()=>{
  for(const type of ['pdf','docx','xlsx']){
    const result=await generateArtifact(type,'عنوان\n- بند أول\n- بند ثان','تقرير اختبار');
    assert.ok(result.buffer.length>500);
    assert.match(result.fileName,new RegExp(`\\.${type}$`));
  }
  assert.equal(requestedArtifactType('سوّي تقرير اكسل'),'xlsx');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isCancellation, isConfirmation, normalizePhone, parseNoteCommand, parseOutboundRequest, parseWorkshopCommand } from '../assistant-actions.mjs';
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

test('builds real PDF, Word and Excel artifacts',async()=>{
  for(const type of ['pdf','docx','xlsx']){
    const result=await generateArtifact(type,'عنوان\n- بند أول\n- بند ثان','تقرير اختبار');
    assert.ok(result.buffer.length>500);
    assert.match(result.fileName,new RegExp(`\\.${type}$`));
  }
  assert.equal(requestedArtifactType('سوّي تقرير اكسل'),'xlsx');
});

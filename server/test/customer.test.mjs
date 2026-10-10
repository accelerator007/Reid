import test from 'node:test';
import assert from 'node:assert/strict';
import { customerFailureReply, customerPrompt, whatsappContactKind } from '../customer.mjs';

test('unknown direct numbers are customers while linked numbers and groups stay distinct',()=>{
  assert.equal(whatsappContactKind('96890000000@s.whatsapp.net',['96891111111']),'customer');
  assert.equal(whatsappContactKind('96891111111:4@s.whatsapp.net',['+968 9111 1111']),'internal');
  assert.equal(whatsappContactKind('120363412585944970@g.us',['120363412585944970']),'group');
});

test('the customer contract answers media but refuses internal authority',()=>{
  const prompt=customerPrompt({nameLine:'اسمك ريّد.',voiceLine:''});
  assert.match(prompt,/إذا أرسل صورة فانظر إليها/);
  assert.match(prompt,/لا تملك وصولًا لبيانات الشركة الداخلية/);
  assert.match(prompt,/سؤالًا واحدًا/);
});

test('a customer gets a useful fallback instead of silence',()=>{
  assert.match(customerFailureReply(),/أعد إرسالها/);
  assert.match(customerFailureReply(),/موظف/);
});

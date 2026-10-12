import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveredGroup, handoffAlert, humanHandoffRequested, validateWhatsappGroupPatch, validateWhatsappUserPatch } from '../whatsapp-access.mjs';

test('newly discovered groups are always silent until the Owner enables them',()=>{
  assert.deepEqual(discoveredGroup({jid:'120363000000001@g.us',displayName:'  فريق\nالمشروع  ',createdBy:'owner'}),{
    jid:'120363000000001@g.us',display_name:'فريق المشروع',enabled:false,respond_to_all:false,guest_chat_enabled:false,reply_mode:'text',created_by:'owner',
  });
});

test('permission patches accept only the visible bounded controls',()=>{
  assert.deepEqual(validateWhatsappGroupPatch({enabled:true,reply_mode:'voice'}),{enabled:true,reply_mode:'voice'});
  assert.deepEqual(validateWhatsappUserPatch({handoff_notifications_enabled:true,outbound_scope:'company'}),{handoff_notifications_enabled:true,outbound_scope:'company'});
  assert.throws(()=>validateWhatsappGroupPatch({created_by:'attacker'}),/invalid_permissions/);
  assert.throws(()=>validateWhatsappUserPatch({role:'owner'}),/invalid_permissions/);
});

test('human requests are detected without treating ordinary questions as handoffs',()=>{
  for(const text of ['موظف','أريد أتواصل مع شخص','ممكن أكلم الدعم','خلني اتكلم مع خدمة العملاء','I want to speak with a human agent'])assert.equal(humanHandoffRequested(text),true,text);
  for(const text of ['السلام عليكم','كم سعر الموقع؟','عندي موظف جديد','كيف أتواصل مع API؟'])assert.equal(humanHandoffRequested(text),false,text);
});

test('handoff alerts contain the customer and a direct inbox link',()=>{
  const body=handoffAlert({name:'أحمد',phone:'96890000000',message:'أريد شخصًا من الفريق',chatId:'chat-id'});
  assert.match(body,/أحمد/);assert.match(body,/\+96890000000/);assert.match(body,/inbox\?chat=chat-id/);
});

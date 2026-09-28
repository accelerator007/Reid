import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwner, inboundText, maySend, cleanReply, whatsappText, internalTokenValid } from '../policy.mjs';

test('owner access fails closed for suspension and staff', () => {
  assert.equal(isOwner(['owner'], 'active'), true);
  assert.equal(isOwner(['owner'], 'suspended'), false);
  assert.equal(isOwner(['admin'], 'active'), false);
});
test('group text requires Reid by name, mention, or reply to Reid', () => {
  const base = { key: { id:'123', remoteJid:'96812345678@s.whatsapp.net' }, message:{ conversation:'مرحبا' } };
  assert.equal(inboundText(base).text, 'مرحبا');
  assert.equal(inboundText({...base, requestId:'forged'}), null);
  assert.equal(inboundText({...base, key:{...base.key, fromMe:true}}), null);
  assert.equal(inboundText({...base, message:{protocolMessage:{}}}), null);
  const group={key:{id:'g1',remoteJid:'123@g.us',participantPn:'96896709444@s.whatsapp.net'},message:{conversation:'هلا ريد'}};
  assert.equal(inboundText(group).senderPhone,'96896709444');
  assert.equal(inboundText({...group,message:{conversation:'hello Reid'}}).isGroup,true);
  assert.equal(inboundText({...group,message:{conversation:'hello reid'}}).addressed,true);
  assert.equal(inboundText({...group,message:{conversation:'كلام عادي'}}),null);
  const mentioned={...group,message:{extendedTextMessage:{text:'هلا',contextInfo:{mentionedJid:['96897308003@s.whatsapp.net']}}}};
  assert.equal(inboundText(mentioned,['96897308003:1@s.whatsapp.net']).addressed,true);
  const reply={...group,message:{extendedTextMessage:{text:'انبح',contextInfo:{stanzaId:'bot-message',participant:'96897308003:1@s.whatsapp.net'}}}};
  assert.equal(inboundText(reply,['96897308003@s.whatsapp.net']).repliedToBot,true);
  assert.equal(inboundText({...reply,message:{extendedTextMessage:{text:'انبح',contextInfo:{stanzaId:'other-message',participant:'96890000000@s.whatsapp.net'}}}},['96897308003@s.whatsapp.net']),null);
});
test('human takeover, expiry and ambiguous deliveries suppress auto resend', () => {
  const row={status:'queued', origin:'bot', expires_at:new Date(Date.now()+60000).toISOString()};
  assert.equal(maySend(row,{bot_mode:'active'},true),true);
  assert.equal(maySend(row,{bot_mode:'human'},true),false);
  assert.equal(maySend({...row,status:'sending'},{bot_mode:'active'},true),false);
  assert.equal(maySend({...row,expires_at:'2020-01-01'},{bot_mode:'active'},true),false);
});
test('empty model replies fail explicitly', () => {
  assert.throws(()=>cleanReply('  '));
  assert.equal(cleanReply(' مرحبًا '),'مرحبًا');
});

test('WhatsApp text drops grounding citations and renders Markdown the way WhatsApp does',()=>{
  const answer='المعلومات غير متوفرة في سجلات الشركة [Reid:memory:d4e1e5a2-7c81-4088-8812-1d2a7e455daf].\n\n\n**الخطوة القادمة:** راجع [الموقع](https://reidpro.com) [Reid:projects:aaaaaaaa-aaaa] .\n### ملخص';
  assert.equal(whatsappText(answer),'المعلومات غير متوفرة في سجلات الشركة.\n\n*الخطوة القادمة:* راجع الموقع: https://reidpro.com.\n*ملخص*');
  assert.equal(whatsappText('نص عادي بدون مصادر'),'نص عادي بدون مصادر');
  assert.equal(whatsappText('[Reid:memory:only-a-citation]'),'[Reid:memory:only-a-citation]');
});

test('internal service token fails closed', () => {
  assert.equal(internalTokenValid('secret-token', 'secret-token'), true);
  assert.equal(internalTokenValid('secret-token', 'secret-tokeN'), false);
  assert.equal(internalTokenValid('secret-token', 'secret'), false);
  assert.equal(internalTokenValid('secret-token', undefined), false);
  assert.equal(internalTokenValid('', ''), false);
  assert.equal(internalTokenValid(undefined, 'anything'), false);
});

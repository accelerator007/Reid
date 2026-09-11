import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwner, inboundText, maySend, cleanReply } from '../policy.mjs';

test('owner access fails closed for suspension and staff', () => {
  assert.equal(isOwner(['owner'], 'active'), true);
  assert.equal(isOwner(['owner'], 'suspended'), false);
  assert.equal(isOwner(['admin'], 'active'), false);
});
test('only fresh direct text can invoke AI', () => {
  const base = { key: { id:'123', remoteJid:'96812345678@s.whatsapp.net' }, message:{ conversation:'مرحبا' } };
  assert.equal(inboundText(base).text, 'مرحبا');
  assert.equal(inboundText({...base, requestId:'forged'}), null);
  assert.equal(inboundText({...base, key:{...base.key, fromMe:true}}), null);
  assert.equal(inboundText({...base, key:{...base.key, remoteJid:'123@g.us'}}), null);
  assert.equal(inboundText({...base, message:{protocolMessage:{}}}), null);
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

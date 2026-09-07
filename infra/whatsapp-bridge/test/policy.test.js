import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedHistory, jidPhone, messageText, shouldHandle } from '../src/policy.js';

const owners = new Set(['96896709444', '96892797586']);
const groups = new Set(['123@g.us']);
const base = { key: { id: 'm1', remoteJid: '123@g.us', participant: '96896709444@s.whatsapp.net' }, message: { conversation: 'ريد لخص المشروع' } };

test('normalizes device-qualified JIDs', () => assert.equal(jidPhone('96896709444:12@s.whatsapp.net'), '96896709444'));
test('unwraps ephemeral text', () => assert.equal(messageText({ ephemeralMessage: { message: { conversation: 'هلا' } } }), 'هلا'));
test('allows an owner in an allowed group only when addressed', () => {
  assert.equal(shouldHandle({ ...base, botJid: '96890000000@s.whatsapp.net', owners, groups }).allow, true);
  assert.equal(shouldHandle({ ...base, message: { conversation: 'كلام عام' }, botJid: '96890000000@s.whatsapp.net', owners, groups }).allow, false);
});
test('denies unlisted senders and groups', () => {
  assert.equal(shouldHandle({ ...base, key: { ...base.key, participant: '96890000001@s.whatsapp.net' }, owners, groups }).reason, 'owner_denied');
  assert.equal(shouldHandle({ ...base, key: { ...base.key, remoteJid: '999@g.us' }, owners, groups }).reason, 'group_denied');
});
test('keeps bounded isolated history', () => assert.deepEqual(boundedHistory(Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: String(i) })), 2).map((x) => x.content), ['18', '19']));

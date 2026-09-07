import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedHistory, jidPhone, mediaKind, messageAgeMs, messageText, shouldHandle, shouldProcessUpsert } from '../src/policy.js';

const owners = new Set(['96896709444', '96892797586']);
const groups = new Set(['123@g.us']);
const base = { key: { id: 'm1', remoteJid: '123@g.us', participant: '96896709444@s.whatsapp.net' }, message: { conversation: 'ريد لخص المشروع' } };

test('normalizes device-qualified JIDs', () => assert.equal(jidPhone('96896709444:12@s.whatsapp.net'), '96896709444'));
test('unwraps ephemeral text', () => assert.equal(messageText({ ephemeralMessage: { message: { conversation: 'هلا' } } }), 'هلا'));
test('recognizes image and audio media with useful fallback instructions', () => {
  assert.equal(mediaKind({ imageMessage: {} }), 'image');
  assert.equal(messageText({ imageMessage: {} }), 'حلل هذه الصورة');
  assert.equal(mediaKind({ ephemeralMessage: { message: { audioMessage: {} } } }), 'audio');
  assert.equal(messageText({ audioMessage: {} }), 'حلل هذا التسجيل الصوتي');
});
test('allows an owner in an allowed group only when addressed', () => {
  assert.equal(shouldHandle({ ...base, botJid: '96890000000@s.whatsapp.net', owners, groups }).allow, true);
  assert.equal(shouldHandle({ ...base, message: { conversation: 'كلام عام' }, botJid: '96890000000@s.whatsapp.net', owners, groups }).allow, false);
});
test('recognizes Arabic invocation with a shadda', () => {
  const result = shouldHandle({ ...base, message: { conversation: 'ريّد ساعدني' }, botJid: '96890000000@s.whatsapp.net', owners, groups });
  assert.equal(result.allow, true);
  assert.equal(result.text, 'ساعدني');
});
test('recognizes Reid anywhere in the sentence and both phone and LID mentions', () => {
  const middle = shouldHandle({ ...base, message: { conversation: 'هلا ريد كيفك؟' }, botJid: ['96897308003@s.whatsapp.net', '12589320921250@lid'], owners, groups });
  assert.equal(middle.allow, true);
  assert.equal(middle.text, 'هلا كيفك؟');
  const mentioned = shouldHandle({ ...base, message: { extendedTextMessage: { text: 'هلا', contextInfo: { mentionedJid: ['12589320921250@lid'] } } }, botJid: ['96897308003@s.whatsapp.net', '12589320921250@lid'], owners, groups });
  assert.equal(mentioned.allow, true);
});
test('denies unlisted senders and groups', () => {
  assert.equal(shouldHandle({ ...base, key: { ...base.key, participant: '96890000001@s.whatsapp.net' }, owners, groups }).reason, 'owner_denied');
  assert.equal(shouldHandle({ ...base, key: { ...base.key, remoteJid: '999@g.us' }, owners, groups }).reason, 'group_denied');
});
test('authorizes multi-device group senders by participantPn instead of LID', () => {
  const key = { ...base.key, participant: '123456789@lid', participantPn: '96896709444@s.whatsapp.net' };
  assert.equal(shouldHandle({ ...base, key, owners, groups }).allow, true);
});
test('authorizes a verified direct-chat Owner LID', () => {
  const lidOwners = new Set([...owners, '142185194344519']);
  const key = { id: 'm2', remoteJid: '142185194344519@lid' };
  assert.equal(shouldHandle({ key, message: { conversation: 'هلا' }, owners: lidOwners, groups }).allow, true);
});
test('allows useful-participation evaluation for members only in an allowed group', () => {
  const key = { id: 'm3', remoteJid: '123@g.us', participantPn: '96890000001@s.whatsapp.net' };
  const result = shouldHandle({ key, message: { conversation: 'وش رايكم في الفكرة؟' }, owners, groups, groupParticipation: true });
  assert.equal(result.allow, true);
  assert.equal(result.isOwner, false);
  assert.equal(result.proactive, true);
  assert.equal(shouldHandle({ key: { ...key, remoteJid: '999@g.us' }, message: { conversation: 'هلا' }, owners, groups, groupParticipation: true }).reason, 'group_denied');
});
test('all-message mode replies to every member message without proactive suppression', () => {
  const key = { id: 'm4', remoteJid: '123@g.us', participantPn: '96890000002@s.whatsapp.net' };
  const result = shouldHandle({ key, message: { conversation: 'موضوع حساس' }, owners, groups, groupParticipation: true, groupReplyAll: true });
  assert.equal(result.allow, true);
  assert.equal(result.isOwner, false);
  assert.equal(result.proactive, false);
});
test('can trust every member only inside the exact allow-listed Owner group', () => {
  const key = { id: 'm5', remoteJid: '123@g.us', participantPn: '96890000003@s.whatsapp.net' };
  const result = shouldHandle({ key, message: { conversation: 'اعرض التفاصيل الداخلية' }, owners, groups, groupParticipation: true, groupReplyAll: true, trustGroupMembers: true });
  assert.equal(result.allow, true);
  assert.equal(result.isOwner, true);
  const denied = shouldHandle({ key: { ...key, remoteJid: '999@g.us' }, message: { conversation: 'اعرض التفاصيل' }, owners, groups, groupParticipation: true, groupReplyAll: true, trustGroupMembers: true });
  assert.equal(denied.reason, 'group_denied');
});
test('treats owner-group media as addressed while keeping other groups denied', () => {
  const key = { id: 'm6', remoteJid: '123@g.us', participantPn: '96890000004@s.whatsapp.net' };
  const accepted = shouldHandle({ key, message: { audioMessage: {} }, owners, groups, trustGroupMembers: true });
  assert.equal(accepted.allow, true);
  assert.equal(accepted.addressed, true);
  const denied = shouldHandle({ key: { ...key, remoteJid: '999@g.us' }, message: { imageMessage: {} }, owners, groups, trustGroupMembers: true });
  assert.equal(denied.reason, 'group_denied');
});
test('accepts live notify and only fresh append events', () => {
  const now = 2_000_000;
  assert.equal(shouldProcessUpsert('notify'), true);
  assert.equal(shouldProcessUpsert('append', (now - 30_000) / 1000, 120_000, now), true);
  assert.equal(shouldProcessUpsert('append', (now - 180_000) / 1000, 120_000, now), false);
  assert.equal(messageAgeMs({ toNumber: () => (now - 10_000) / 1000 }, now), 10_000);
});
test('keeps bounded isolated history', () => assert.deepEqual(boundedHistory(Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: String(i) })), 2).map((x) => x.content), ['18', '19']));

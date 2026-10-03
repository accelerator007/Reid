import test from 'node:test';
import assert from 'node:assert/strict';
import { inboundText } from '../policy.mjs';
import { createImageCache, mediaPlaceholder, spokenLanguage, synthesizeVoice, transcribeAudio, transcriptBody, voiceRequested } from '../media.mjs';
import { createTyping, pacingDelay, reactions, splitReply } from '../signals.mjs';

const direct = extra => ({ key: { id: 'm1', remoteJid: '96812345678@s.whatsapp.net' }, ...extra });
const group = extra => ({ key: { id: 'g1', remoteJid: '123@g.us', participantPn: '96896709444@s.whatsapp.net' }, ...extra });

test('a voice note in a direct chat is accepted and marked as audio', () => {
  const item = inboundText(direct({ message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } }));
  assert.ok(item, 'a voice note must not be dropped silently');
  assert.equal(item.media.kind, 'audio');
  assert.equal(item.media.mimetype, 'audio/ogg');
  assert.equal(item.senderPhone, '96812345678');
});

test('a photo carries its caption as the message text', () => {
  const item = inboundText(direct({ message: { imageMessage: { mimetype: 'image/jpeg', caption: 'وش رأيك في التصميم؟' } } }));
  assert.equal(item.media.kind, 'image');
  assert.equal(item.text, 'وش رأيك في التصميم؟');
});

test('media in a group still requires an explicit invocation', () => {
  const silent = inboundText(group({ message: { audioMessage: { mimetype: 'audio/ogg' } } }));
  assert.equal(silent, null, 'an unaddressed group voice note must stay ignored');
  const mentioned = inboundText(
    group({ message: { audioMessage: { mimetype: 'audio/ogg', contextInfo: { mentionedJid: ['96897308003@s.whatsapp.net'] } } } }),
    ['96897308003:1@s.whatsapp.net'],
  );
  assert.equal(mentioned?.addressed, true);
  const named = inboundText(group({ message: { imageMessage: { mimetype: 'image/jpeg', caption: 'ريد وش هذا' } } }));
  assert.equal(named?.addressed, true);
});

test('media messages keep every existing inbound guard', () => {
  assert.equal(inboundText(direct({ key: { id: 'm1', remoteJid: '96812345678@s.whatsapp.net', fromMe: true }, message: { audioMessage: {} } })), null);
  assert.equal(inboundText(direct({ message: { audioMessage: {} }, requestId: 'forged' })), null);
  assert.equal(inboundText(direct({ message: { audioMessage: {} }, messageStubType: 2 })), null);
  assert.equal(inboundText(direct({ message: { videoMessage: { caption: 'مرحبا' } } })), null, 'unsupported media stays ignored');
});

test('transcription sends the recording to the local adapter only', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, token: options.headers['x-reid-origin-token'] });
    return { ok: true, json: async () => ({ text: '  سجل لي اجتماع بكرة  ' }) };
  };
  const text = await transcribeAudio(Buffer.from('voice'), 'audio/ogg', { url: 'http://127.0.0.1:11436', token: 'secret', fetchImpl });
  assert.equal(text, 'سجل لي اجتماع بكرة');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:11436/api/transcribe');
  assert.equal(calls[0].token, 'secret');
});

test('transcription refuses oversized, empty and failed recordings', async () => {
  const ok = { ok: true, json: async () => ({ text: '' }) };
  await assert.rejects(() => transcribeAudio(Buffer.alloc(0), 'audio/ogg', { fetchImpl: async () => ok }), /audio_empty/);
  await assert.rejects(() => transcribeAudio(Buffer.alloc(17 * 1024 * 1024), 'audio/ogg', { fetchImpl: async () => ok }), /audio_too_large/);
  await assert.rejects(() => transcribeAudio(Buffer.from('x'), 'audio/ogg', { fetchImpl: async () => ok }), /empty_transcript/);
  await assert.rejects(() => transcribeAudio(Buffer.from('x'), 'audio/ogg', { fetchImpl: async () => ({ ok: false, status: 502 }) }), /transcribe_502/);
});

test('an explicit Arabic or English request selects a voice reply', () => {
  assert.equal(voiceRequested('رد علي بصوت وقل لي ملخص اليوم'), true);
  assert.equal(voiceRequested('سجل رسالة صوتية تقول الاجتماع الساعة 9'), true);
  assert.equal(voiceRequested('Reply with a voice note please'), true);
  assert.equal(voiceRequested('هل تستطيع فهم الرسائل الصوتية؟'), false, 'a capability question is not a send command');
  assert.equal(voiceRequested('لخص لي اليوم'), false);
  assert.equal(spokenLanguage('هلا كيف الحال'), 'ar');
  assert.equal(spokenLanguage('Hello, how are you?'), 'en');
});

test('voice-note wording is detected before it can be mistaken for a saved note', () => {
  assert.equal(voiceRequested('سجل لي رسالة صوتية قصيرة تقول إن ريد جاهز'), true);
  assert.equal(voiceRequested('سجل لي ملاحظة إن ريد جاهز'), false);
});

test('voice synthesis requests local audio and validates the Ogg result', async () => {
  const calls = [];
  const audio = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(100)]);
  const result = await synthesizeVoice('هلا والله', {
    url: 'http://tts:5050',
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, arrayBuffer: async () => audio };
    },
  });
  assert.equal(result.subarray(0, 4).toString(), 'OggS');
  assert.deepEqual(calls, [{ url: 'http://tts:5050/synthesize', body: { text: 'هلا والله', language: 'ar' } }]);
  await assert.rejects(() => synthesizeVoice('x', { url: 'http://tts', fetchImpl: async () => ({ ok: false, status: 503 }) }), /voice_503/);
});

test('a transcript keeps the caption that came with it', () => {
  assert.equal(transcriptBody('نص التسجيل', 'لخص لي'), 'لخص لي\n\nتفريغ التسجيل:\nنص التسجيل');
  assert.equal(transcriptBody('نص التسجيل', ''), 'نص التسجيل');
  assert.equal(mediaPlaceholder('image', ''), 'صورة');
  assert.equal(mediaPlaceholder('audio', ''), 'رسالة صوتية');
  assert.equal(mediaPlaceholder('image', ' وش هذا '), 'وش هذا');
});

test('an inbound photo is read once and never kept', () => {
  let clock = 0;
  const cache = createImageCache({ max: 2, ttl: 1000, now: () => clock });
  cache.set('a', 'first');
  assert.equal(cache.take('a'), 'first');
  assert.equal(cache.take('a'), null, 'a photo is consumed by the job that answers it');
  cache.set('b', 'second');
  clock = 2000;
  assert.equal(cache.take('b'), null, 'a photo nobody answered expires');
  clock = 3000;
  cache.set('c', '1'); cache.set('d', '2'); cache.set('e', '3');
  assert.ok(cache.size <= 2, 'the cache is bounded');
});

test('a long answer is split into a few readable messages', () => {
  const long = `${'كلمة '.repeat(300)}`.trim();
  const chunks = splitReply(long, { limit: 400, max: 3 });
  assert.ok(chunks.length > 1 && chunks.length <= 3, `unexpected chunk count ${chunks.length}`);
  for (const chunk of chunks.slice(0, -1)) assert.ok(chunk.length <= 400, `chunk too long: ${chunk.length}`);
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '), 'splitting must not lose text');
});

test('a short answer stays one message', () => {
  assert.deepEqual(splitReply('تم ✅'), ['تم ✅']);
  assert.deepEqual(splitReply('   '), []);
  assert.deepEqual(splitReply(null), []);
});

test('splitting prefers a paragraph or sentence boundary', () => {
  const text = `${'أ'.repeat(300)}.\n\n${'ب'.repeat(300)}`;
  const chunks = splitReply(text, { limit: 400, max: 3 });
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].endsWith('.'), 'the first chunk should end a sentence');
  assert.ok(chunks[1].startsWith('ب'));
});

test('pacing between messages is proportional and bounded', () => {
  assert.equal(pacingDelay(''), 600);
  assert.equal(pacingDelay('x'.repeat(10_000)), 2600);
  const middle = pacingDelay('x'.repeat(100));
  assert.ok(middle > 600 && middle < 2600);
});

test('the typing indicator starts, refreshes and is always released', () => {
  const sent = [];
  const socket = { sendPresenceUpdate: (state, jid) => { sent.push(`${state}:${jid}`); } };
  let tick = null;
  const typing = createTyping(socket, { interval: 10, timer: fn => { tick = fn; return 'handle'; }, clear: handle => { assert.equal(handle, 'handle'); tick = null; } });
  const stop = typing('96812345678@s.whatsapp.net');
  assert.deepEqual(sent, ['composing:96812345678@s.whatsapp.net']);
  tick();
  assert.equal(sent.length, 2);
  stop();
  assert.equal(sent[sent.length - 1], 'paused:96812345678@s.whatsapp.net');
  stop();
  assert.equal(sent.length, 3, 'releasing twice must not send twice');
});

test('a failing socket never breaks the reply path', () => {
  const socket = { sendPresenceUpdate: () => { throw new Error('socket_closed'); } };
  const typing = createTyping(socket, { timer: () => 1, clear: () => {} });
  assert.doesNotThrow(() => typing('x@s.whatsapp.net')());
  assert.equal(reactions.received, '👀');
});

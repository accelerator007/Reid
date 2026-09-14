import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReply, qualityVersion, summariseQuality } from '../quality.mjs';
import { createRecall, toVectorLiteral } from '../recall.mjs';
import { readCorrection, readReaction } from '../feedback.mjs';
import { openerFingerprint } from '../affect.mjs';
import { createMemory } from '../memory.mjs';

test('a plain, honest answer scores clean', () => {
  const result = assessReply('جهزت التقرير وأرسلته لك هنا.', { request: 'سوّي لي تقرير' });
  assert.equal(result.flags.length, 0);
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.equal(result.version, qualityVersion);
});

test('claiming a send without a receipt is the failure that matters most', () => {
  const claimed = assessReply('تم إرسال الرسالة إلى شيخة ✅', { request: 'ارسل لشيخة' });
  assert.ok(claimed.flags.includes('unbacked_action_claim'));
  assert.equal(claimed.passed, false);
  const backed = assessReply('تم إرسال الرسالة إلى شيخة ✅', { request: 'ارسل لشيخة', hasActionReceipt: true });
  assert.ok(!backed.flags.includes('unbacked_action_claim'), 'a real receipt makes the claim true');
});

test('leaking the prompt or asking for a credential is scored as a breach', () => {
  assert.ok(assessReply('حسب EMPLOYEE_CONTEXT={"notes":[]} عندك مهمتان', { request: 'وش عندي' }).flags.includes('prompt_leak'));
  assert.ok(assessReply('أرسل لي كلمة المرور عشان أكمل', { request: 'ساعدني' }).flags.includes('credential_request'));
  assert.ok(assessReply('اكتب لي رمز التحقق الذي وصلك', { request: 'ساعدني' }).flags.includes('credential_request'));
});

test('an empty reply is the worst possible score', () => {
  const empty = assessReply('   ', { request: 'وش الأخبار' });
  assert.deepEqual(empty.flags, ['empty']);
  assert.equal(empty.score, 0);
});

test('answering in the wrong language is flagged', () => {
  assert.ok(assessReply('Sure, I have prepared the quarterly report for you today.', { request: 'جهز لي تقرير الربع الحالي من فضلك' }).flags.includes('language_mismatch'));
  assert.ok(!assessReply('جهزت لك تقرير الربع', { request: 'جهز لي تقرير الربع الحالي من فضلك' }).flags.includes('language_mismatch'));
  assert.ok(!assessReply('Done.', { request: 'ok' }).flags.includes('language_mismatch'), 'a short request is not enough to judge language');
});

test('a repeated opening line costs points', () => {
  const recent = [openerFingerprint('هلا وغلا حاضر وش تريدني أساعدك فيه')];
  const repeated = assessReply('هلا وغلا 👋🏻 حاضر، وش تريدني أساعدك فيه؟', { request: 'هلا', recentOpeners: recent, openerFingerprint });
  assert.ok(repeated.flags.includes('repeated_opening'));
});

test('a wall of text is flagged but still passes', () => {
  const long = assessReply('ن'.repeat(1500), { request: 'اشرح لي' });
  assert.ok(long.flags.includes('overlong'));
  assert.equal(long.passed, true, 'long is a nudge, not a failure');
});

test('the weekly summary ranks the flags worth fixing', () => {
  const summary = summariseQuality([
    { quality_score: 100, quality_flags: [] },
    { quality_score: 60, quality_flags: ['unbacked_action_claim'] },
    { quality_score: 80, quality_flags: ['repeated_opening'] },
    { quality_score: 60, quality_flags: ['unbacked_action_claim', 'overlong'] },
    { quality_score: null, quality_flags: [] },
  ]);
  assert.equal(summary.replies, 5);
  assert.equal(summary.scored, 4);
  assert.equal(summary.failing, 2);
  assert.equal(summary.average, 75);
  assert.equal(summary.topFlags[0].flag, 'unbacked_action_claim');
  assert.equal(summary.topFlags[0].count, 2);
  assert.equal(summariseQuality([]).average, null);
});

test('an embedding becomes pgvector text only when it is real', () => {
  assert.equal(toVectorLiteral([0.1, -0.2, 3]), '[0.1,-0.2,3]');
  assert.equal(toVectorLiteral([]), null);
  assert.equal(toVectorLiteral(null), null);
  assert.equal(toVectorLiteral([1, 'x']), null);
  assert.equal(toVectorLiteral([1, Number.NaN]), null);
  assert.equal(toVectorLiteral(new Array(5000).fill(0)), null);
});

test('semantic recall returns related memories and drops weak matches', async () => {
  const calls = [];
  const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { data: [
    { content: 'يفضل التقارير بصيغة PDF', similarity: 0.81 },
    { content: 'شيء بعيد تمامًا', similarity: 0.11 },
    { content: '   ', similarity: 0.9 },
  ], error: null }; } };
  const semantic = createRecall({ admin, embed: async () => [0.1, 0.2, 0.3] });
  const found = await semantic('user-1', 'بأي صيغة تبي التقرير؟');
  assert.deepEqual(found, ['يفضل التقارير بصيغة PDF']);
  assert.equal(calls[0].name, 'match_memories');
  assert.equal(calls[0].args.wanted_scope, 'user');
  assert.equal(calls[0].args.wanted_scope_id, 'user-1');
  assert.equal(calls[0].args.query_embedding, '[0.1,0.2,0.3]');
});

test('a retrieval failure answers without recall instead of failing the reply', async () => {
  const failing = createRecall({ admin: { rpc: async () => ({ data: null, error: { code: '42883' } }) }, embed: async () => [1, 2] });
  assert.deepEqual(await failing('user-1', 'سؤال'), []);
  const noEmbedding = createRecall({ admin: { rpc: async () => ({ data: [], error: null }) }, embed: async () => { throw new Error('embed_503'); } });
  assert.deepEqual(await noEmbedding('user-1', 'سؤال'), []);
  const noScope = createRecall({ admin: { rpc: async () => ({ data: [], error: null }) }, embed: async () => [1] });
  assert.deepEqual(await noScope('', 'سؤال'), []);
  assert.deepEqual(await noScope('user-1', '  '), []);
});

test('relevant memories come before merely recent ones', async () => {
  const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ data: [{ content: 'شيء حديث' }], error: null }) }) }) }) }) }) }) };
  const memory = createMemory({ admin, check: async value => value.data ?? [], aiChat: async () => '', semantic: async () => ['شيء ذو صلة'] });
  const recalled = await memory.recall({ id: 'u1', memory_enabled: true }, { summary: 'خلاصة' }, 'سؤال');
  assert.deepEqual(recalled.facts, ['شيء ذو صلة', 'شيء حديث']);
  assert.equal(recalled.summary, 'خلاصة');
});

test('a thumb on the assistant’s own message is feedback', () => {
  const reaction = readReaction({
    key: { id: 'r1', remoteJid: '96812345678@s.whatsapp.net' },
    message: { reactionMessage: { text: '👍', key: { id: 'bot-1', fromMe: true } } },
  });
  assert.equal(reaction.signal, 'positive');
  assert.equal(reaction.targetId, 'bot-1');
  assert.equal(reaction.senderPhone, '96812345678');
});

test('a thumb on someone else’s message is not feedback about the assistant', () => {
  assert.equal(readReaction({
    key: { id: 'r1', remoteJid: '96812345678@s.whatsapp.net' },
    message: { reactionMessage: { text: '👍', key: { id: 'other', fromMe: false } } },
  }), null);
});

test('a negative thumb, a removed one and an unrelated emoji are told apart', () => {
  const build = text => ({ key: { id: 'r', remoteJid: '96812345678@s.whatsapp.net' }, message: { reactionMessage: { text, key: { id: 'bot-1', fromMe: true } } } });
  assert.equal(readReaction(build('👎')).signal, 'negative');
  assert.equal(readReaction(build('❤️')).signal, 'positive');
  assert.equal(readReaction(build('')), null, 'removing a reaction is not a judgement');
  assert.equal(readReaction(build('🤔')), null, 'an ambiguous emoji is not scored');
  assert.equal(readReaction({ message: { conversation: 'مرحبا' } }), null);
});

test('a group reaction is attributed to the participant, not the group', () => {
  const reaction = readReaction({
    key: { id: 'r1', remoteJid: '123@g.us', participantPn: '96896709444@s.whatsapp.net' },
    message: { reactionMessage: { text: '👍', key: { id: 'bot-1', fromMe: true } } },
  });
  assert.equal(reaction.senderPhone, '96896709444');
});

test('a written correction is recognised, and ordinary refusal is not', () => {
  assert.equal(readCorrection('لا، قصدي الورشة الثانية مو الأولى').signal, 'correction');
  assert.equal(readCorrection('لا أقصد تقرير الربع الثالث').signal, 'correction');
  assert.equal(readCorrection('no, I meant the second workshop').signal, 'correction');
  assert.equal(readCorrection('لا ترسلها'), null, 'a cancellation is not a correction');
  assert.equal(readCorrection('تمام'), null);
  assert.equal(readCorrection(''), null);
});

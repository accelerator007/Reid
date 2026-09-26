import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemory, describeStyle, parseFacts, shouldRefresh, styleSample, summaryEvery } from '../memory.mjs';
import { avoidLine, nextMood, nextRapport, openerFingerprint, personaLines, rapportGuidance, rememberOpener, repeatsOpener } from '../affect.mjs';

test('a style profile only speaks once it has seen enough messages', () => {
  const profile = { dominant_language: 'ar', average_message_length: 40, emoji_rate: 0.8, directness: 0.9 };
  assert.equal(describeStyle(profile, 2), '', 'two samples are not a style');
  const described = describeStyle(profile, 40);
  assert.match(described, /العربية/);
  assert.match(described, /اختصر/);
  assert.match(described, /الإيموجي/);
  assert.equal(describeStyle(null, 100), '');
});

test('the summary refreshes on a message cadence, not on every turn', () => {
  assert.equal(shouldRefresh({ total: 3, summaryCount: 0 }), false);
  assert.equal(shouldRefresh({ total: summaryEvery, summaryCount: 0 }), true);
  assert.equal(shouldRefresh({ total: 14, summaryCount: 10 }), false);
  assert.equal(shouldRefresh({ total: 20, summaryCount: 10 }), true);
  const day = 25 * 60 * 60_000;
  assert.equal(shouldRefresh({ total: 12, summaryCount: 10, summaryAt: new Date(Date.now() - day).toISOString() }), true, 'a stale summary is refreshed');
});

test('extracted facts are bounded and never capture a secret', () => {
  const facts = parseFacts(JSON.stringify({ facts: [
    { content: 'يفضل التقارير بصيغة PDF', kind: 'preference' },
    { content: 'كلمة المرور هي 8842', kind: 'fact' },
    { content: 'رمز التحقق 493201', kind: 'fact' },
    { content: 'يتابع مشروع منصة الورش', kind: 'fact' },
    { content: 'قصير', kind: 'fact' },
    { content: 'يجتمع مع الفريق كل أحد', kind: 'fact' },
    { content: 'عنصر زائد عن الحد', kind: 'fact' },
  ] }));
  assert.equal(facts.length, 3, 'at most three facts per pass');
  assert.ok(!facts.some(item => /كلمة المرور|رمز التحقق/.test(item.content)), 'credentials must never be remembered');
  assert.ok(!facts.some(item => item.content === 'قصير'), 'a fragment is not a fact');
  assert.equal(facts[0].kind, 'preference');
});

test('unusable extraction output yields nothing rather than noise', () => {
  assert.deepEqual(parseFacts('ما فيه شيء'), []);
  assert.deepEqual(parseFacts(JSON.stringify({ facts: 'كل شيء' })), []);
  assert.deepEqual(parseFacts(JSON.stringify({ facts: [] })), []);
});

test('a style sample reads language, length, emoji and directness', () => {
  const arabic = styleSample('ارسل التقرير 🙏🏻');
  assert.equal(arabic.sample_language, 'ar');
  assert.equal(arabic.sample_has_emoji, true);
  assert.equal(arabic.sample_is_direct, true);
  assert.equal(styleSample('send me the quarterly report please').sample_language, 'en');
  assert.equal(styleSample('ok'), null, 'a two letter message teaches nothing');
});

test('memory stays off for anyone who did not consent to it', async () => {
  const calls = [];
  const admin = { from: () => { calls.push('read'); return { select: () => ({ eq: () => ({ eq: () => ({ neq: () => ({ order: () => ({ limit: () => ({}) }) }) }) }) }) }; } };
  const memory = createMemory({ admin, check: async () => [], aiChat: async () => { throw new Error('must not be called'); } });
  assert.deepEqual(await memory.recall({ memory_enabled: false, id: 'u1' }, { summary: 'x' }), { summary: '', facts: [] });
  assert.equal(await memory.learn({ memory_enabled: false, id: 'u1' }, { message_count: 100 }, []), false);
  assert.equal(await memory.observeStyle({ style_learning_enabled: false }, 'نص طويل كفاية'), false);
  assert.equal(calls.length, 0, 'a disabled memory must not even read');
});

test('learning waits for the cadence and then writes a summary', async () => {
  const writes = [];
  const admin = {
    from: table => ({
      update: values => ({ eq: () => { writes.push({ table, values }); return { error: null }; } }),
      select: () => ({ eq: () => ({ eq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ data: [], error: null }) }) }), limit: () => ({ data: [], error: null }) }) }) }),
      insert: values => { writes.push({ table, insert: values }); return { error: null }; },
    }),
  };
  const replies = ['خلاصة المحادثة', JSON.stringify({ facts: [{ content: 'يفضل الاجتماعات الصباحية', kind: 'preference' }] })];
  const memory = createMemory({ admin, check: async value => (Array.isArray(value?.data) ? value.data : value?.data ?? []), aiChat: async () => replies.shift() });
  const identity = { id: 'u1', memory_enabled: true };
  assert.equal(await memory.learn(identity, { id: 'c1', message_count: 4, summary_count: 0 }, [{ role: 'user', content: 'مرحبا' }]), false, 'below the cadence nothing runs');
  assert.equal(await memory.learn(identity, { id: 'c1', message_count: 12, summary_count: 0 }, [{ role: 'user', content: 'اجتماعاتي صباحية دائمًا' }]), true);
  assert.equal(writes[0].table, 'qr_conversations');
  assert.equal(writes[0].values.summary, 'خلاصة المحادثة');
  assert.equal(writes[0].values.summary_count, 12);
  assert.equal(writes[1].table, 'memories');
  assert.equal(writes[1].insert[0].memory_kind, 'preference');
  assert.equal(writes[1].insert[0].scope_id, 'u1');
});

test('urgency and frustration change behaviour immediately', () => {
  assert.equal(nextMood('ودّي', 'محايد', 'high'), 'مستعجل');
  assert.equal(nextMood('مبسوط', 'محبط', 'normal'), 'محبط');
  assert.equal(nextMood('محايد', 'جاد', 'normal'), 'جاد');
});

test('a passing mood decays instead of sticking forever', () => {
  assert.equal(nextMood('مستعجل', 'محايد', 'normal'), 'محايد');
  assert.equal(nextMood('محبط', 'محايد', 'normal'), 'محايد');
  assert.equal(nextMood('ودّي', 'محايد', 'normal'), 'ودّي', 'warmth is not reset by one neutral message');
  assert.equal(nextMood('غير معروف', 'قيمة غريبة', 'normal'), 'محايد');
});

test('tone instructions match the moment', () => {
  assert.match(personaLines({ mood: 'محايد', urgency: 'high', rapport: 0, recent: [], style: '', summary: '', facts: [] }), /جملتان كحد أقصى/);
  assert.match(personaLines({ mood: 'محبط', urgency: 'normal', rapport: 0, recent: [], style: '', summary: '', facts: [] }), /لا تعتذر مرتين/);
  assert.match(personaLines({ mood: 'جاد', urgency: 'normal', rapport: 0, recent: [], style: '', summary: '', facts: [] }), /بلا إيموجي ولا مزح/);
  const lines = personaLines({ mood: 'ودّي', urgency: 'normal', rapport: 0, recent: [], style: '', summary: '', facts: [] });
  assert.match(lines, /لا تدّعِ مشاعر لا تملكها/);
  assert.match(lines, /لا تكرر صياغة ردك السابق/);
});

test('memory and familiarity reach the prompt when they exist', () => {
  const lines = personaLines({ mood: 'محايد', urgency: 'normal', rapport: 70, recent: [], style: 'أسلوبه: مباشر.', summary: 'يشتغل على منصة الورش', facts: ['يفضل PDF'] });
  assert.match(lines, /يشتغل على منصة الورش/);
  assert.match(lines, /يفضل PDF/);
  assert.match(lines, /خاطبه مباشرة/);
  assert.match(rapportGuidance(0), /عرّف بنفسك/);
  assert.match(rapportGuidance(30), /بلا تعريف بنفسك/);
});

test('an opener fingerprint ignores emoji, punctuation and Arabic spelling drift', () => {
  const a = openerFingerprint('هلا وغلا 👋🏻 حاضر، وش تريدني أساعدك فيه؟');
  const b = openerFingerprint('هلا وغلا حاضر وش تريدني');
  assert.equal(a, b);
  assert.equal(openerFingerprint('  '), '');
});

test('a repeated opening line is detected and then remembered', () => {
  const first = 'هلا وغلا 👋🏻 حاضر، وش تريدني أساعدك فيه؟';
  let recent = rememberOpener([], first);
  assert.equal(repeatsOpener('هلا وغلا حاضر وش تريدني أسويه', recent), true);
  assert.equal(repeatsOpener('تم، جهزت لك التقرير', recent), false);
  recent = rememberOpener(recent, 'تم، جهزت لك التقرير');
  assert.equal(recent.length, 2);
  for (let index = 0; index < 10; index += 1) recent = rememberOpener(recent, `رد مختلف رقم ${index} هنا الآن`);
  assert.ok(recent.length <= 5, 'the avoid list stays short');
  assert.match(avoidLine(recent), /لا تبدأ ردك/);
  assert.equal(avoidLine([]), '');
});

test('familiarity only ever grows warmth, and is bounded', () => {
  assert.equal(nextRapport(0, { handled: true }), 2);
  assert.equal(nextRapport(0, {}), 1);
  assert.equal(nextRapport(100, { handled: true }), 100);
  assert.equal(nextRapport(undefined, {}), 1);
  assert.equal(nextRapport(-5, {}), 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { briefingDue, composeBrief, createProactive, muscatParts, staleActionNote, withinQuietHours } from '../proactive.mjs';

// 2026-09-14T04:00:00Z is 08:00 in Muscat.
const morning = Date.parse('2026-09-14T04:00:00Z');
const night = Date.parse('2026-09-14T19:00:00Z');
const earlyMorning = Date.parse('2026-09-14T01:00:00Z');

test('Muscat time is derived without a timezone database', () => {
  assert.equal(muscatParts(morning).hour, 8);
  assert.equal(muscatParts(morning).day, '2026-09-14');
  assert.equal(muscatParts(night).hour, 23);
});

test('the assistant stays silent at night', () => {
  assert.equal(withinQuietHours(morning), false);
  assert.equal(withinQuietHours(night), true, '23:00 is quiet');
  assert.equal(withinQuietHours(earlyMorning), true, '05:00 is quiet');
});

test('a brief is due from its hour onward, never during quiet hours', () => {
  assert.equal(briefingDue(8, morning), true);
  assert.equal(briefingDue(9, morning), false, 'before the chosen hour nothing is sent');
  assert.equal(briefingDue(8, Date.parse('2026-09-14T06:00:00Z')), true, 'a late service still delivers the day');
  assert.equal(briefingDue(8, night), false);
  assert.equal(briefingDue(undefined, morning), true);
});

test('a brief carries today, the overdue, what is close and what waits', () => {
  const brief = composeBrief({
    name: 'علي',
    tasks: [
      { title: 'مراجعة العقد', due_at: '2026-09-14T10:00:00Z' },
      { title: 'تقرير الورشة', due_at: '2026-09-10T10:00:00Z' },
    ],
    workshops: [{ title_ar: 'ذكاء اصطناعي', start_at: '2026-09-15T13:00:00Z' }],
    pending: [{ id: 'a' }],
    now: morning,
  });
  assert.match(brief, /صباح الخير علي/);
  assert.match(brief, /مهام اليوم \(1\)/);
  assert.match(brief, /مراجعة العقد/);
  assert.match(brief, /متأخرة \(1\)/);
  assert.match(brief, /ذكاء اصطناعي/);
  assert.match(brief, /طلب ينتظر تأكيدك/);
});

test('an empty day produces no message at all', () => {
  assert.equal(composeBrief({ name: 'علي', tasks: [], workshops: [], pending: [], now: morning }), null);
  assert.equal(composeBrief({ tasks: [{ title: 'بلا موعد', due_at: null }], now: morning }), null, 'a task with no date is not today');
});

test('a stuck request is surfaced without ever retrying it', () => {
  const note = staleActionNote([{ id: 'abcdef123456', status: 'uncertain', recipient_name: 'شيخة', created_at: new Date(morning).toISOString() }], morning);
  assert.match(note, /abcdef12/);
  assert.match(note, /شيخة/);
  assert.match(note, /ما أعدته تلقائيًا/);
  assert.equal(staleActionNote([{ id: 'x', status: 'queued', created_at: new Date(morning - 60_000).toISOString() }], morning), null, 'a fresh queue entry is not stale');
  assert.equal(staleActionNote([], morning), null);
});

function harness({ profiles, nudgeError = null, tasks = [], now = morning }) {
  const queued = [];
  const inserted = [];
  const admin = {
    from: table => ({
      select: () => {
        const result = {
          eq: () => result, in: () => result, not: () => result, gte: () => result, lte: () => result,
          order: () => result, limit: () => result,
          maybeSingle: () => result,
          then: undefined,
        };
        const data = table === 'whatsapp_admin_profiles' ? profiles
          : table === 'account_controls' ? { status: 'active' }
            : table === 'profiles' ? { full_name: 'علي' }
              : table === 'tasks' ? tasks : [];
        result.data = data;
        result.error = null;
        return result;
      },
      insert: values => ({ select: () => ({ maybeSingle: () => { if (nudgeError) return { error: nudgeError }; inserted.push(values); return { data: { id: `n${inserted.length}` }, error: null }; } }) }),
    }),
  };
  const run = createProactive({
    admin,
    check: async value => value.data,
    queueText: async (chat, body, options) => { queued.push({ chat, body, options }); },
    ensureConversation: async phone => ({ id: `c-${phone}` }),
  });
  return { run, queued, inserted, now };
}

test('nothing is sent to anyone who has not opted in', async () => {
  const { run, queued } = harness({ profiles: [] });
  assert.equal(await run(morning), 0);
  assert.equal(queued.length, 0);
});

test('an opted-in employee gets one brief, recorded before it is queued', async () => {
  const { run, queued, inserted } = harness({
    profiles: [{ user_id: 'u1', phone_e164: '96896709444', briefing_hour: 8 }],
    tasks: [{ title: 'مراجعة العقد', due_at: '2026-09-14T10:00:00Z' }],
  });
  assert.equal(await run(morning), 1);
  assert.equal(queued.length, 1);
  assert.match(queued[0].body, /مراجعة العقد/);
  assert.equal(inserted[0].kind, 'morning_brief');
  assert.equal(inserted[0].subject_day, '2026-09-14');
});

test('the same brief is never sent twice in one day', async () => {
  const { run, queued } = harness({
    profiles: [{ user_id: 'u1', phone_e164: '96896709444', briefing_hour: 8 }],
    tasks: [{ title: 'مراجعة العقد', due_at: '2026-09-14T10:00:00Z' }],
    nudgeError: { code: '23505' },
  });
  assert.equal(await run(morning), 0, 'a duplicate day is refused by the unique key');
  assert.equal(queued.length, 0, 'and nothing reaches the outbox');
});

test('the night is respected even for an opted-in employee', async () => {
  const { run, queued } = harness({
    profiles: [{ user_id: 'u1', phone_e164: '96896709444', briefing_hour: 8 }],
    tasks: [{ title: 'مهمة', due_at: '2026-09-14T10:00:00Z' }],
  });
  assert.equal(await run(night), 0);
  assert.equal(queued.length, 0);
});

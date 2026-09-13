import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatMuscat, muscatNow, parseReminder, ReminderStore } from '../src/reminders.js';

const now = new Date('2026-09-08T06:00:00.000Z'); // 10:00 in Muscat

test('parses relative reminders and Arabic digits', () => {
  const reminder = parseReminder('ريد ذكرني بعد ١٥ دقيقة أشرب ماي', now);
  assert.equal(reminder.due.toISOString(), '2026-09-08T06:15:00.000Z');
  assert.equal(reminder.text, 'أشرب ماي');
});

test('parses tomorrow clock time in Asia/Muscat', () => {
  const reminder = parseReminder('ذكرني بكرة الساعة ٩ صباحا بالاجتماع', now);
  assert.equal(reminder.due.toISOString(), '2026-09-09T05:00:00.000Z');
  assert.match(reminder.text, /بالاجتماع/);
  assert.match(formatMuscat(reminder.due), /٢٠٢٦|2026/);
  assert.match(muscatNow(now), /١٠|10/);
});

test('asks one focused question when a reminder lacks time', () => {
  assert.deepEqual(parseReminder('ذكرني بالاجتماع', now), { missing: true });
  assert.equal(parseReminder('كيف حالك', now), null);
});

test('persists, claims and completes reminders without duplicate delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-reminders-'));
  const path = join(directory, 'reminders.json');
  const store = new ReminderStore(path);
  await store.load();
  const created = await store.create({ sender: '9681', chatId: 'group@g.us', text: 'اختبار', due: new Date(now.getTime() - 1000) });
  assert.equal((await store.claimDue(now)).id, created.id);
  assert.equal(await store.claimDue(now), null);
  await store.complete(created.id);
  assert.equal(JSON.parse(await readFile(path, 'utf8'))[0].status, 'sent');
});

test('supports weekly reminders, listing, snoozing and cancellation', async () => {
  const weekly = parseReminder('ريد ذكرني كل أحد الساعة 9 صباحا بالتقرير', now);
  assert.equal(weekly.recurrence.type, 'weekly');
  const directory = await mkdtemp(join(tmpdir(), 'reid-reminders-actions-'));
  const store = new ReminderStore(join(directory, 'reminders.json'));
  await store.load();
  const row = await store.create({ sender: '9681', chatId: 'direct', text: weekly.text, due: weekly.due, recurrence: weekly.recurrence });
  assert.equal(store.list('9681', 'direct').length, 1);
  const snoozed = await store.snooze('9681', 'direct', 7_200_000);
  assert.equal(snoozed.id, row.id);
  assert.equal((await store.cancel('9681', 'direct', row.id.slice(0, 8))).status, 'cancelled');
});

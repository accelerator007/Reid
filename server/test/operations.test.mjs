import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsHandler, formatOperationsSnapshot, parseOperationsCommand } from '../operations.mjs';

const snapshot = {
  checkedAt: '2026-09-26T10:00:00.000Z',
  components: {
    website: { status: 'healthy', latencyMs: 123 },
    database: { status: 'unavailable' },
    ai: { status: 'degraded' },
    runner: { status: 'healthy' },
    whatsapp: { status: 'healthy', connection: 'connected' },
  },
  queue: { pending: 2, failed: 3, uncertain: 1 },
  activity: { lastInboundAt: '2026-09-26T09:50:00.000Z', lastOutboundAt: null },
  host: { name: 'ai-lap', fresh: true, lastSeenAt: '2026-09-26T09:59:50.000Z', cpuPercent: 23.1, memoryUsedGb: 8, memoryTotalGb: 32 },
};

test('recognizes bounded Arabic and English operational commands including Owner-group invocation', () => {
  for (const value of ['حالة النظام', 'ريّد، حالة النظام؟', 'Reid system status', 'اعرض حالة النظام']) assert.equal(parseOperationsCommand(value), 'system');
  for (const value of ['حالة الموقع', 'website status']) assert.equal(parseOperationsCommand(value), 'website');
  for (const value of ['حالة السيرفر', 'حالة الخادم', 'server status']) assert.equal(parseOperationsCommand(value), 'server');
  for (const value of ['حالة واتساب', 'حالة واتس اب', 'whatsapp status']) assert.equal(parseOperationsCommand(value), 'whatsapp');
  for (const value of ['أوامر الإدارة', 'admin help']) assert.equal(parseOperationsCommand(value), 'help');
  for (const value of ['أعد تشغيل السيرفر', 'انشر الموقع', 'حدثني عن حالة النظام أمس', 'system status; reboot', 'أرسل حالة النظام إلى شخص']) assert.equal(parseOperationsCommand(value), null);
});

test('denies public, employee and admin operational requests before reading any data', async () => {
  let reads = 0;
  const handle = createOperationsHandler({ getSnapshot: async () => { reads++; return snapshot; } });
  for (const identity of [null, {}, { roles: ['guest'] }, { roles: ['employee'] }, { roles: ['admin'] }]) {
    const result = await handle({ identity, text: 'حالة النظام' });
    assert.equal(result.handled, true);
    assert.match(result.text, /للمالك فقط/u);
  }
  assert.equal(reads, 0);
  assert.equal(await handle({ identity: null, text: 'مرحبا' }), null);
});

test('owner and super admin status requests distinguish component failures and queue states', async () => {
  const requests = [];
  const handle = createOperationsHandler({ getSnapshot: async request => { requests.push(request); return snapshot; } });
  for (const role of ['owner', 'super_admin']) {
    const result = await handle({ identity: { roles: [role] }, text: 'حالة النظام' });
    assert.match(result.text, /الموقع: سليم — 123/u);
    assert.match(result.text, /قاعدة البيانات: غير متاح/u);
    assert.match(result.text, /خدمة الذكاء الاصطناعي: يحتاج متابعة/u);
    assert.match(result.text, /معلّق 2، فاشل 3، غير مؤكد 1/u);
    assert.match(result.text, /آخر رسالة صادرة: غير متاح/u);
    assert.match(result.text, /لا يثبتان اكتمال اختبار/u);
    assert.match(result.text, /خادم الموقع \(Reid\): مقاييس المضيف الحديثة غير متاحة/u);
  }
  assert.deepEqual(requests, [{ command: 'system' }, { command: 'system' }]);
});

test('missing, stale and invalid host metrics never become a healthy host claim', () => {
  for (const host of [undefined, { ...snapshot.host, fresh: false }, { ...snapshot.host, fresh: 'true' }]) {
    const output = formatOperationsSnapshot('server', { ...snapshot, host });
    assert.match(output, /مقاييس المضيف الحديثة غير متاحة/u);
    assert.doesNotMatch(output, /23\.1|8 \/ 32/u);
  }
  const output = formatOperationsSnapshot('server', { ...snapshot, host: { fresh: true, cpuPercent: 120, diskUsedPercent: -1, memoryUsedGb: 40, memoryTotalGb: 32 } });
  assert.match(output, /مقاييس المعالج والذاكرة والقرص غير متاحة/u);
  assert.doesNotMatch(output, /120%|40 \/ 32/u);
});

test('formatter excludes arbitrary provider text, credentials, private messages and invalid counters', () => {
  const output = formatOperationsSnapshot('system', {
    checkedAt: 'secret-value',
    components: { website: { status: 'secret-value', error: 'secret-value' }, whatsapp: { connection: 'secret-value' } },
    queue: { pending: -1, failed: 'secret-value', uncertain: NaN },
    activity: { lastInboundAt: 'secret-value', lastOutboundAt: 'not-a-date', body: 'secret-value' },
    host: { name: 'secret-value', fresh: false },
  });
  assert.doesNotMatch(output, /secret-value|-1|NaN|not-a-date/u);
  assert.match(output, /معلّق غير متاح، فاشل غير متاح، غير مؤكد غير متاح/u);
});

test('focused status commands keep component scope clear', () => {
  const website = formatOperationsSnapshot('website', snapshot);
  assert.match(website, /الموقع: سليم/u);
  assert.match(website, /لا يؤكد عمل كل صفحات/u);
  assert.doesNotMatch(website, /الطابور|استخدام المعالج/u);
  const whatsapp = formatOperationsSnapshot('whatsapp', snapshot);
  assert.match(whatsapp, /اتصال واتساب: متصل/u);
  assert.doesNotMatch(whatsapp, /استخدام المعالج|قاعدة البيانات/u);
});

test('website-host telemetry is labeled separately from ai-lap and requires its own freshness', () => {
  const websiteHost = { name: 'Reid', fresh: true, lastSeenAt: snapshot.checkedAt, cpuPercent: 9, memoryUsedGb: 4, memoryTotalGb: 16, diskUsedPercent: 50 };
  const output = formatOperationsSnapshot('server', { ...snapshot, websiteHost });
  assert.match(output, /خادم الذكاء الاصطناعي \(ai-lap\)/u);
  assert.match(output, /خادم الموقع \(Reid\) — آخر قياس/u);
  assert.match(output, /الذاكرة: 4 \/ 16 GB/u);
  const stale = formatOperationsSnapshot('server', { ...snapshot, websiteHost: { ...websiteHost, fresh: false } });
  assert.doesNotMatch(stale, /4 \/ 16 GB|50%/u);
});

test('help gives only available operations and clear mutation limits without a backend request', async () => {
  const handle = createOperationsHandler({ getSnapshot: async () => { throw new Error('must not read'); } });
  const result = await handle({ identity: { roles: ['owner'] }, text: 'أوامر الإدارة' });
  assert.match(result.text, /معاينة ثم تأكيد/u);
  assert.match(result.text, /أوامر خادم الاستضافة متاحة للمالك/u);
});

test('collector failure stays contained and does not disclose its raw error', async () => {
  const handle = createOperationsHandler({ getSnapshot: async () => { throw new Error('secret-token'); } });
  const result = await handle({ identity: { roles: ['owner'] }, text: 'حالة السيرفر' });
  assert.equal(result.handled, true);
  assert.match(result.text, /لم يتم التحقق/u);
  assert.doesNotMatch(result.text, /secret-token/u);
});

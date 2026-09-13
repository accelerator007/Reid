import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionStore, planAction } from '../src/actions.js';
import { CompanyClient } from '../src/company.js';

test('planner extracts strict JSON from a model response', async () => {
  const plan = await planAction(async () => '```json\n{"intent":"project_status","query":"مشروع ألف"}\n```', 'وين وصل مشروع ألف؟');
  assert.equal(plan.intent, 'project_status');
});

test('planner preserves image studio controls', async () => {
  const plan = await planAction(async () => '{"intent":"image_generate","prompt":"إعلان ريّد","platforms":["instagram"],"aspect_ratio":"4:5","count":3}', 'صمم لي ثلاث صور');
  assert.equal(plan.intent, 'image_generate');
  assert.equal(plan.aspect_ratio, '4:5');
  assert.equal(plan.count, 3);
});

test('action store persists approval and lifecycle state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-actions-'));
  const store = new ActionStore(join(directory, 'actions.json'));
  await store.load();
  await store.pending('ali:direct', { kind: 'meeting' });
  assert.equal((await store.pending('ali:direct')).kind, 'meeting');
  const job = await store.job('meeting', { project: 'Reid' }, 'ali:direct');
  assert.equal((await store.finish(job.id, 'completed', { created: 2 })).status, 'completed');
  assert.equal(store.recentJobs('ali:direct')[0].id, job.id);
});

test('failed jobs require a fresh approval before retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-actions-'));
  const store = new ActionStore(join(directory, 'actions.json')); await store.load();
  const job = await store.job('outbound_message', { recipient: { id: '9681@s.whatsapp.net' }, message: 'هلا' }, 'ali:direct');
  await store.finish(job.id, 'failed', 'network');
  const retry = await store.prepareRetry('ali:direct', job.id);
  assert.equal(retry.status, 'pending_approval');
  assert.equal(retry.attempts, 2);
});

test('handoff and cancellation remain isolated by conversation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-actions-'));
  const store = new ActionStore(join(directory, 'actions.json')); await store.load();
  const first = await store.job('meeting', {}, 'ali:direct');
  const second = await store.job('content', {}, 'sheikha:direct');
  assert.equal((await store.handoff('ali:direct', first.id)).status, 'needs_human');
  assert.equal(await store.cancel('ali:direct', second.id), null);
  assert.equal((await store.cancel('sheikha:direct', second.id)).status, 'cancelled');
});

test('contact directory resolves one name and normalizes an Oman number', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-actions-'));
  const store = new ActionStore(join(directory, 'actions.json')); await store.load();
  await store.rememberContacts([{ id: '96892797586@s.whatsapp.net', name: 'Sheikha' }, { id: '96891111111@s.whatsapp.net', name: 'Ahmed' }]);
  assert.equal(store.resolveContact('Sheikha').id, '96892797586@s.whatsapp.net');
  assert.equal(store.resolveContact('96709444').phone, '96896709444');
  assert.equal(store.resolveContact('missing').ambiguous.length, 0);
});

test('company client never calls an unconfigured gateway', async () => {
  const client = new CompanyClient({});
  assert.equal(client.enabled, false);
  await assert.rejects(() => client.call('9681', 'projects.summary'), /not_configured/);
});

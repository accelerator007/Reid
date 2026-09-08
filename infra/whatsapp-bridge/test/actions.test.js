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

test('action store persists approval and lifecycle state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reid-actions-'));
  const store = new ActionStore(join(directory, 'actions.json'));
  await store.load();
  await store.pending('ali:direct', { kind: 'meeting' });
  assert.equal((await store.pending('ali:direct')).kind, 'meeting');
  const job = await store.job('meeting', { project: 'Reid' });
  assert.equal((await store.finish(job.id, 'completed', { created: 2 })).status, 'completed');
});

test('company client never calls an unconfigured gateway', async () => {
  const client = new CompanyClient({});
  assert.equal(client.enabled, false);
  await assert.rejects(() => client.call('9681', 'projects.summary'), /not_configured/);
});

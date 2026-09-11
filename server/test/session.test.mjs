import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createAuthStore } from '../auth-store.mjs';
import { reminderDecision } from '../reminders.mjs';
import { inboundText } from '../policy.mjs';

test('encrypted session survives restart and rejects a different key', async () => {
  const dir=mkdtempSync(join(tmpdir(),'reid-auth-test-')),key=randomBytes(32).toString('hex');
  let store;
  try {
    store=createAuthStore(dir,key);store.state.creds.registered=true;store.state.creds.testMarker='private-session-sentinel';store.save();
    await store.state.keys.set({session:{example:{value:Buffer.from('private-signal-key')}}});store.close();
    const bytes=readFileSync(join(dir,'session.sqlite')).toString();assert.ok(!bytes.includes('private-session-sentinel'));assert.ok(!bytes.includes('private-signal-key'));
    store=createAuthStore(dir,key);assert.equal(store.state.creds.registered,true);assert.equal((await store.state.keys.get('session',['example'])).example.value.toString(),'private-signal-key');store.close();store=null;
    assert.throws(()=>createAuthStore(dir,randomBytes(32).toString('hex')));
  } finally {store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('stale reminders require review instead of surprise sends',()=>{
  const now=Date.now(),row={whatsapp_phone:'96890000000',due_at:new Date(now-1000).toISOString()};
  assert.equal(reminderDecision(row,now),'queue');
  assert.equal(reminderDecision({...row,due_at:new Date(now-31*60000).toISOString()},now),'overdue_review_required');
  assert.equal(reminderDecision({...row,whatsapp_phone:'group@g.us'},now),'invalid_recipient');
});
test('authenticated PN alternate is used for Owner mapping, display names never are',()=>{
  assert.equal(inboundText({key:{id:'pn-test',remoteJid:'123@lid',remoteJidAlt:'96890000000@s.whatsapp.net'},message:{conversation:'hello'}}).jid,'96890000000@s.whatsapp.net');
  assert.equal(inboundText({key:{id:'pn-test',remoteJid:'123@lid'},pushName:'96890000000',message:{conversation:'hello'}}).jid,'123@lid');
});

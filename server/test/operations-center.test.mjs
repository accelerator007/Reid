import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOperationsCenter, operationCommand } from '../operations-center.mjs';

test('operations allow only bounded service names and fixed backup dispatch',()=>{
  assert.equal(operationCommand('restart','reid-tts'),'docker restart reid-tts');
  for(const target of ['reid-services','reid-host-ops','unrelated','reid-web; reboot'])assert.throws(()=>operationCommand('restart',target));
  assert.throws(()=>operationCommand('shell','pwd'));
});
test('confirmation is actor-bound, expiring, single-use and durable through a lost response',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reid-ops-'));let calls=0,time=Date.now();const audit=[];
  const opts={directory,now:()=>time,hostOps:{execute:async()=>{calls++;throw new Error('connection_lost');}},audit:async(...entry)=>audit.push(entry)};
  try{
    const center=createOperationsCenter(opts),action=await center.preview('owner','restart','reid-tts');
    assert.equal((await center.read()).actions[0].code,undefined);
    await assert.rejects(center.execute('other',action.id,action.code),/expired_or_used/);
    await assert.rejects(center.execute('owner',action.id,'wrong'),/confirmation_code_invalid/);
    assert.equal((await center.execute('owner',action.id,action.code)).status,'uncertain');
    const restarted=createOperationsCenter(opts);
    await assert.rejects(restarted.execute('owner',action.id,action.code),/expired_or_used/);
    assert.equal(calls,1);assert.equal(audit.length,3);
    const expired=await restarted.preview('owner','backup');time+=300001;
    await assert.rejects(restarted.execute('owner',expired.id,expired.code),/expired_or_used/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('history survives restart, is bounded, and incidents debounce and recover',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reid-history-'));let time=Date.now();
  const opts={directory,now:()=>time,hostOps:{}};
  const snapshot=healthy=>({checkedAt:new Date(time).toISOString(),components:Object.fromEntries(['website','ai','tts','database','whatsapp','runner'].map(name=>[name,{status:healthy?'healthy':'unavailable'}])),queue:{pending:0,failed:0,uncertain:0},websiteHost:{cpuPercent:5}});
  try{
    const center=createOperationsCenter(opts);
    await center.record(snapshot(false));await center.record(snapshot(false));assert.equal((await center.read()).incidents.length,0);
    time+=60000;await center.record(snapshot(false));time+=60000;await center.record(snapshot(false));
    assert.equal((await center.read()).incidents.length,5);
    const restarted=createOperationsCenter(opts);time+=60000;await restarted.record(snapshot(true));
    assert.ok((await restarted.read()).incidents.every(row=>row.resolvedAt));
    time+=8*86400000;await restarted.record(snapshot(true));assert.equal((await restarted.read()).history.length,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

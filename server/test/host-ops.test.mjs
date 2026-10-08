import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostOps, parseServerPlan, planServerCommand } from '../host-ops.mjs';

test('server plans are bounded JSON and raw Owner commands remain literal',async()=>{
  assert.deepEqual(parseServerPlan('{"summary":"restart","command":"docker compose restart api","impact":"brief restart","rollback":"restart again"}'),{
    summary:'restart',command:'docker compose restart api',impact:'brief restart',rollback:'restart again',
  });
  assert.equal(parseServerPlan('{"command":""}'),null);
  let called=false;
  const raw=await planServerCommand(async()=>{called=true;},{request:'نفذ على السيرفر: docker ps',command:'docker ps'});
  assert.equal(raw.command,'docker ps');
  assert.equal(called,false);
});

test('host executor calls are signed and never put the token in the payload',async()=>{
  const seen=[];
  const host=createHostOps({url:'http://host-ops:8787',token:'test-secret',fetchImpl:async(url,options)=>{
    seen.push({url,options});return {ok:true,json:async()=>({ok:true,risk:'read'})};
  }});
  await host.validate('docker ps');
  assert.equal(seen[0].url,'http://host-ops:8787/v1/validate');
  assert.deepEqual(JSON.parse(seen[0].options.body),{command:'docker ps'});
  assert.ok(seen[0].options.headers['x-reid-signature']);
  assert.equal(seen[0].options.body.includes('test-secret'),false);
});

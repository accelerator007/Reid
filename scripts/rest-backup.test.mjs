import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { exportTables, verifyBackup, buildRestoreSql } from './rest-backup.mjs';

test('REST backup paginates, verifies hashes and builds a fail-fast restore',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'reid-backup-test-'));
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),range:options.headers.Range,authorization:options.headers.Authorization});
    const table=new URL(url).pathname.split('/').at(-1);
    const start=Number(options.headers.Range.split('-')[0]);
    const source=table==='alpha'?[{id:1},{id:2},{id:3}]:[];
    return {ok:true,status:start?206:200,json:async()=>source.slice(start,start+2)};
  };
  const manifest=await exportTables({url:'https://example.supabase.co',key:'private-test-key',tables:['beta','alpha','alpha'],outDir:resolve(dir,'data'),fetchImpl,pageSize:2,now:()=>new Date('2026-10-06T08:00:00Z')});
  assert.deepEqual(manifest.tables.map(item=>[item.table,item.rows]),[['alpha',3],['beta',0]]);
  assert.deepEqual(calls.map(call=>call.range),['0-1','0-1','2-3']);
  assert.ok(calls.every(call=>call.authorization==='Bearer private-test-key'));
  assert.ok(!JSON.stringify(manifest).includes('private-test-key'));
  assert.equal((await verifyBackup({backupDir:dir})).tables.length,2);
  const sql=await buildRestoreSql({backupDir:dir});
  assert.match(sql,/session_replication_role = replica/);
  assert.match(sql,/insert into public\."alpha" overriding system value/);
  assert.match(sql,/restore count mismatch: alpha/);

  await writeFile(resolve(dir,'data','alpha.json'),'[]');
  await assert.rejects(()=>verifyBackup({backupDir:dir}),/verification failed/);
});

test('REST backup rejects unsafe table names and non-HTTPS endpoints',async()=>{
  await assert.rejects(()=>exportTables({url:'http://example.test',key:'x',tables:['safe'],outDir:'/tmp/unused'}),/HTTPS/);
  await assert.rejects(()=>exportTables({url:'https://example.test',key:'x',tables:['users?select=*'],outDir:'/tmp/unused'}),/Unsafe table/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsSnapshot, hostTelemetry, sampleLocalHost } from '../operations-snapshot.mjs';

const epoch=Date.parse('2026-09-26T10:00:00Z');
function fixture({failure,runner,fetchImpl,sampleHost,clock=()=>epoch}={}) {
  const requests=[],queries=[];
  const admin={from(table){
    const query={table,filters:[]};queries.push(query);
    const builder={
      select(columns,options){query.columns=columns;query.options=options;return builder;},
      eq(key,value){query.filters.push([key,value]);return builder;},
      in(key,value){query.filters.push([key,value]);return builder;},
      gt(){return builder;},gte(){return builder;},order(){return builder;},limit(){return builder;},maybeSingle(){return builder;},
      async abortSignal(){
        if(failure?.(query))return {error:{message:'secret failure content'}};
        if(table==='agent_runner_status')return {data:runner===undefined?{status:'online',last_seen_at:new Date(epoch).toISOString(),cpu_percent:18,memory_used_gb:6,memory_total_gb:32}:runner};
        if(table==='qr_messages')return {data:{created_at:new Date(epoch-60000).toISOString()}};
        return {count:query.filters.some(([key,value])=>key==='status'&&value==='uncertain')?1:2};
      },
    };return builder;
  }};
  const collect=createOperationsSnapshot({admin,getConnection:()=> 'connected',aiUrl:'http://private-ai',aiToken:'never-return-this',
    now:clock,sampleHost,
    fetchImpl:fetchImpl|| (async(url,options)=>{requests.push({url,options});return {ok:true};}),
  });
  return {collect,queries,requests};
}

test('collects bounded metadata and probes fixed services without returning credentials',async()=>{
  const {collect,queries,requests}=fixture();const result=await collect();
  assert.equal(result.components.website.status,'healthy');
  assert.equal(result.components.database.status,'healthy');
  assert.equal(result.components.whatsapp.connection,'connected');
  assert.deepEqual(result.queue,{pending:4,failed:4,uncertain:1});
  assert.equal(result.host.fresh,true);assert.equal(result.websiteHost.fresh,false);
  assert.deepEqual(requests.map(request=>request.url),['https://reidpro.com/healthz','http://private-ai/health']);
  assert.ok(queries.every(query=>!query.columns.includes('*')&&!query.columns.includes('body')));
  assert.ok(!JSON.stringify(result).includes('never-return-this'));
});

test('database failure stays unknown and cannot become zero outstanding work',async()=>{
  const {collect}=fixture({failure:query=>query.table==='qr_jobs'});
  const result=await collect();
  assert.equal(result.components.database.status,'unavailable');
  assert.equal(result.queue.pending,null);assert.equal(result.queue.failed,null);
  assert.equal(result.queue.uncertain,1);
  assert.ok(!JSON.stringify(result).includes('secret failure'));
});

test('network failure does not hide independent database and queue health',async()=>{
  const result=await fixture({fetchImpl:async()=>{throw Error('private network detail');}}).collect();
  assert.equal(result.components.website.status,'unavailable');
  assert.equal(result.components.ai.status,'unavailable');
  assert.equal(result.components.database.status,'healthy');
});

test('old or future heartbeats and invalid measurements are not fresh telemetry',()=>{
  const stale=hostTelemetry({status:'online',last_seen_at:new Date(epoch-90001).toISOString(),cpu_percent:Infinity,memory_used_gb:-1},epoch);
  assert.equal(stale.fresh,false);assert.equal(stale.cpuPercent,null);assert.equal(stale.memoryUsedGb,null);
  assert.equal(hostTelemetry({status:'online',last_seen_at:new Date(epoch+60000).toISOString()},epoch).fresh,false);
  assert.equal(hostTelemetry({status:'offline',last_seen_at:new Date(epoch).toISOString()},epoch).fresh,false);
});

test('missing runner is unknown, not a working AI runner',async()=>{
  const result=await fixture({runner:null}).collect();
  assert.equal(result.components.runner.status,'unknown');assert.equal(result.host.fresh,false);
});

test('concurrent probes coalesce and expire after ten seconds',async()=>{
  let current=epoch;const {collect,requests}=fixture({clock:()=>current});
  const [first,second]=await Promise.all([collect(),collect()]);
  assert.equal(first,second);assert.equal(requests.length,2);
  current+=9000;assert.equal(await collect(),first);
  current+=2000;assert.notEqual(await collect(),first);assert.equal(requests.length,4);
});

test('optional host sampler is separate from ai-lap and fails closed on bad data',async()=>{
  const host={status:'online',last_seen_at:new Date(epoch).toISOString(),disk_used_percent:32,memory_total_gb:16};
  const result=await fixture({sampleHost:async()=>host}).collect();
  assert.equal(result.websiteHost.name,'Reid');assert.equal(result.websiteHost.fresh,true);assert.equal(result.websiteHost.diskUsedPercent,32);
  assert.equal(result.host.name,'ai-lap');
  const failed=await fixture({sampleHost:async()=>{throw Error('private host detail');}}).collect();
  assert.equal(failed.websiteHost.fresh,false);assert.equal(failed.components.ai.status,'healthy');
  assert.ok(!JSON.stringify(failed).includes('private host detail'));
  const invalid=await fixture({sampleHost:()=>({status:'online',last_seen_at:'not a date',cpu_percent:400})}).collect();
  assert.equal(invalid.websiteHost.fresh,false);assert.equal(invalid.websiteHost.cpuPercent,null);
  assert.equal((await fixture().collect()).websiteHost.fresh,false);
});

test('local host sampling reads only fixed kernel counters and the root filesystem',async()=>{
  const reads=[],stats=['cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3','cpu  150 0 150 750 150 0 0 0 0 0\n'];
  const sample=await sampleLocalHost({
    readFileImpl:async path=>{reads.push(path);return path==='/proc/stat'?stats.shift():'MemTotal:       16777216 kB\nMemFree: 1 kB\nMemAvailable:    4194304 kB\n';},
    statfsImpl:async path=>{assert.equal(path,'/');return {blocks:1000,bfree:250,bavail:200};},
    wait:async()=>{},now:()=>epoch,
  });
  assert.deepEqual(reads,['/proc/stat','/proc/stat','/proc/meminfo']);
  assert.deepEqual(sample,{status:'online',last_seen_at:new Date(epoch).toISOString(),cpu_percent:50,memory_used_gb:12,memory_total_gb:16,disk_used_percent:78.95});
  assert.equal(hostTelemetry(sample,epoch,'Reid').fresh,true);
  const empty=await sampleLocalHost({readFileImpl:async path=>path==='/proc/stat'?'cpu  0 0 0 0 0 0 0 0':'',statfsImpl:async()=>({blocks:0,bfree:0}),wait:async()=>{},now:()=>epoch});
  assert.equal(empty.cpu_percent,null);assert.equal(empty.memory_total_gb,null);assert.equal(empty.disk_used_percent,null);
});

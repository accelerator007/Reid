import { readFile, statfs } from 'node:fs/promises';

const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const fresh=(value,now)=>Boolean(time(value))&&now-Date.parse(value)>=-5000&&now-Date.parse(value)<90000;

export function hostTelemetry(row,now=Date.now(),name='ai-lap') {
  const lastSeenAt=time(row?.last_seen_at);
  return {
    name,lastSeenAt,fresh:row?.status==='online'&&fresh(lastSeenAt,now),
    cpuPercent:finite(row?.cpu_percent,0,100),
    memoryUsedGb:finite(row?.memory_used_gb,0,100000),
    memoryTotalGb:finite(row?.memory_total_gb,0,100000),
    diskUsedPercent:finite(row?.disk_used_percent,0,100),
  };
}

const round=value=>Math.round(value*100)/100;

// The Reid containers share the host kernel, so /proc/stat and /proc/meminfo are
// host-wide and '/' is backed by the host's Docker filesystem. The paths are
// fixed; nothing here runs a process or needs a host service to be installed.
export async function sampleLocalHost({readFileImpl=readFile,statfsImpl=statfs,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}={}) {
  const cpu=async()=>{
    const fields=(await readFileImpl('/proc/stat','utf8')).split('\n',1)[0].trim().split(/\s+/).slice(1,9).map(Number);
    return {total:fields.reduce((sum,value)=>sum+value,0),idle:fields[3]+fields[4]};
  };
  const before=await cpu();await wait(200);const after=await cpu();
  const elapsed=after.total-before.total;
  const memory=Object.fromEntries((await readFileImpl('/proc/meminfo','utf8')).split('\n').map(line=>/^(\w+):\s+(\d+)/.exec(line)).filter(Boolean).map(match=>[match[1],Number(match[2])]));
  const disk=await statfsImpl('/');
  return {
    status:'online',last_seen_at:new Date(now()).toISOString(),
    cpu_percent:elapsed>0?round(100*(1-(after.idle-before.idle)/elapsed)):null,
    memory_used_gb:memory.MemTotal>0&&memory.MemAvailable>=0?round((memory.MemTotal-memory.MemAvailable)/1048576):null,
    memory_total_gb:memory.MemTotal>0?round(memory.MemTotal/1048576):null,
    disk_used_percent:disk.blocks>disk.bfree&&disk.bavail>=0?round(100*(disk.blocks-disk.bfree)/(disk.blocks-disk.bfree+disk.bavail)):null,
  };
}

// Every source is fixed by the service. No WhatsApp text may become a URL,
// database selector, filesystem path, or command.
export function createOperationsSnapshot({admin,getConnection,aiUrl,aiToken,ttsUrl,websiteUrl='https://reidpro.com/healthz',sampleHost=null,fetchImpl=fetch,now=Date.now,cacheMs=10000}) {
  let cached,pending;
  async function probe(url,headers={}) {
    const start=now();
    try {
      const response=await fetchImpl(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
      const status=response.ok?'healthy':'unavailable';
      await response.body?.cancel();
      return {status,latencyMs:Math.max(0,now()-start)};
    } catch {return {status:'unavailable'};}
  }
  async function query(build) {
    try {const result=await build().abortSignal(AbortSignal.timeout(5000));return result.error?null:result;}
    catch {return null;}
  }
  const count=build=>query(build).then(result=>Number.isSafeInteger(result?.count)?result.count:null);
  async function collect() {
    const checkedAt=new Date(now()).toISOString(),since=new Date(now()-86400000).toISOString();
    const results=await Promise.all([
      probe(websiteUrl),
      aiUrl?probe(`${aiUrl}/health`,{'x-reid-origin-token':aiToken}):{status:'unknown'},
      ttsUrl?probe(`${ttsUrl}/healthz`):{status:'unknown'},
      count(()=>admin.from('qr_jobs').select('id',{count:'exact',head:true}).in('state',['queued','running']).gt('expires_at',checkedAt)),
      count(()=>admin.from('qr_outbox').select('id',{count:'exact',head:true}).in('status',['queued','sending']).gt('expires_at',checkedAt)),
      count(()=>admin.from('qr_jobs').select('id',{count:'exact',head:true}).eq('state','failed').gte('created_at',since)),
      count(()=>admin.from('qr_outbox').select('id',{count:'exact',head:true}).eq('status','failed').gte('created_at',since)),
      count(()=>admin.from('qr_outbox').select('id',{count:'exact',head:true}).eq('status','uncertain')),
      query(()=>admin.from('qr_messages').select('created_at').eq('direction','inbound').order('created_at',{ascending:false}).limit(1).maybeSingle()),
      query(()=>admin.from('qr_messages').select('created_at').eq('direction','outbound').order('created_at',{ascending:false}).limit(1).maybeSingle()),
      query(()=>admin.from('agent_runner_status').select('status,last_seen_at,cpu_percent,memory_used_gb,memory_total_gb').eq('id','ai-lap').maybeSingle()),
      sampleHost?Promise.resolve().then(sampleHost).catch(()=>null):null,
    ]);
    const [website,ai,tts,jobs,outbox,failedJobs,failedOutbox,uncertain,inbound,outbound,runner,hostSample]=results;
    const databaseOk=results.slice(3,11).every(value=>value!==null);
    const host=hostTelemetry(runner?.data,now());
    const websiteHost=hostTelemetry(hostSample,now(),'Reid');
    const connection=getConnection();
    return {
      checkedAt,
      components:{website,ai,tts,database:{status:databaseOk?'healthy':'unavailable'},
        whatsapp:{status:connection==='connected'?'healthy':'unavailable',connection:['connected','connecting','disconnected','qr'].includes(connection)?connection:'unknown'},
        runner:{status:!runner?.data?'unknown':host.fresh?'healthy':runner.data.status==='degraded'?'degraded':'unavailable'}},
      queue:{pending:jobs===null||outbox===null?null:jobs+outbox,failed:failedJobs===null||failedOutbox===null?null:failedJobs+failedOutbox,uncertain},
      activity:{lastInboundAt:time(inbound?.data?.created_at),lastOutboundAt:time(outbound?.data?.created_at)},
      host,websiteHost,
    };
  }
  return async()=>{
    if(cached&&now()-Date.parse(cached.checkedAt)<cacheMs)return cached;
    if(!pending)pending=collect().then(value=>(cached=value)).finally(()=>{pending=null;});
    return pending;
  };
}

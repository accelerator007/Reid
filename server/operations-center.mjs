import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { publicOperationsHealth } from './operations-snapshot.mjs';

const SERVICES=['reid-web','reid-tts','reid-ai-relay','reid-agent-runner','reid-tunnel','reid-assistant'];
export const operationCommand=(kind,target)=>{
  if(kind==='restart'&&SERVICES.includes(target))return `docker restart ${target}`;
  if(kind==='backup')return 'runuser -u reid -- gh workflow run weekly-backup.yml --repo accelerator007/Reid --ref main';
  throw new Error('operation_not_allowed');
};

// Durable metadata only: no prompts, messages, secrets or raw command output.
// Write-ahead state makes an ambiguous execution non-retryable after a crash.
export function createOperationsCenter({directory='/data/operations',hostOps,audit=async()=>{},now=Date.now}){
  let state={history:[],incidents:[],actions:[],workflows:null,containers:null,hostCheckedAt:null,workflowCheckedAt:null},loaded=false,tail=Promise.resolve();
  const lock=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
  const load=async()=>{if(loaded)return;try{const value=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));state={...state,...value};}catch(error){if(error.code!=='ENOENT')throw error;}for(const action of state.actions)if(action.status==='executing')action.status='uncertain';loaded=true;};
  const save=async()=>{await mkdir(directory,{recursive:true,mode:0o700});await writeFile(join(directory,'state.tmp'),JSON.stringify(state),{mode:0o600});await rename(join(directory,'state.tmp'),join(directory,'state.json'));};
  const read=()=>lock(async()=>{await load();return structuredClone({...state,actions:state.actions.map(({code,...row})=>row)});});
  async function record(snapshot){return lock(async()=>{
    await load();const health=publicOperationsHealth(snapshot),at=now();
    state.history=state.history.filter(row=>Date.parse(row.at)>at-7*86400000);
    if(!state.history.length||at-Date.parse(state.history.at(-1).at)>=55000)state.history.push({at:snapshot.checkedAt,ok:health.ok,components:health.components,queue:snapshot.queue.pending,cpu:snapshot.websiteHost?.cpuPercent??null,memory:snapshot.websiteHost?.memoryUsedGb??null,latency:snapshot.components.ai?.latencyMs??null});
    for(const [component,ok] of Object.entries(health.components)){
      const open=state.incidents.find(row=>row.component===component&&!row.resolvedAt);
      const recent=state.history.slice(-3);
      // Three distinct consecutive samples prevent a transient probe causing an alert.
      if(!ok&&!open&&recent.length===3&&recent.every(row=>row.components[component]===false))state.incidents.push({id:randomUUID(),component,openedAt:snapshot.checkedAt,resolvedAt:null});
      if(ok&&open)open.resolvedAt=snapshot.checkedAt;
    }
    state.incidents=state.incidents.filter(row=>!row.resolvedAt||Date.parse(row.resolvedAt)>at-7*86400000).slice(-500);
    await save();
  });}
  let refreshing=null;
  const refreshHost=()=>refreshing|| (refreshing=(async()=>{
    const previous=await read(),wantWorkflows=!previous.workflowCheckedAt||now()-Date.parse(previous.workflowCheckedAt)>10*60000;
    const [containers,workflows]=await Promise.allSettled([hostOps.observe('containers'),wantWorkflows?hostOps.observe('workflows'):Promise.resolve(null)]);
    await lock(async()=>{
      if(containers.status==='fulfilled'){state.containers=containers.value.containers;state.hostCheckedAt=new Date(now()).toISOString();}
      if(workflows.status==='fulfilled'&&workflows.value){state.workflows=workflows.value.workflows;state.workflowCheckedAt=new Date(now()).toISOString();}
      await save();
    });
  })().finally(()=>{refreshing=null;}));
  const preview=(actor,kind,target)=>lock(async()=>{
    await load();const command=operationCommand(kind,target);
    const action={id:randomUUID(),actor,kind,target:kind==='backup'?'weekly-backup.yml':target,command,code:String(randomInt(100000,1000000)),createdAt:new Date(now()).toISOString(),expiresAt:new Date(now()+300000).toISOString(),status:'pending'};
    state.actions=state.actions.filter(row=>row.status!=='pending'||Date.parse(row.expiresAt)>now()).slice(-199);
    await audit(actor,'operations_preview',{id:action.id,kind,target:action.target,command});
    state.actions.push(action);await save();return {...action};
  });
  const execute=async(actor,id,code)=>{
    const action=await lock(async()=>{
      await load();const action=state.actions.find(row=>row.id===id);
      if(!action||action.actor!==actor||action.status!=='pending'||Date.parse(action.expiresAt)<now())throw new Error('operation_expired_or_used');
      if(typeof code!=='string'||action.code!==code)throw new Error('confirmation_code_invalid');
      await audit(actor,'operations_confirmed',{id,kind:action.kind,target:action.target});
      action.status='executing';delete action.code;await save();return {...action};
    });
    let result;
    try{result=await hostOps.execute(id,action.command);}catch{/* Uncertain actions are never retried. */}
    return lock(async()=>{
      const stored=state.actions.find(row=>row.id===id);
      stored.status=!result?'uncertain':result.exit_code===0?'completed':'failed';
      stored.exitCode=result?.exit_code??null;stored.completedAt=new Date(now()).toISOString();
      await save();await audit(actor,'operations_result',{id,status:stored.status});return {...stored};
    });
  };
  return {read,record,refreshHost,preview,execute};
}

export function registerOperationsCenter(app,{center,hostOps}){
  // Mounted only after the active-Owner authentication middleware.
  app.get('/api/operations/center',async(_req,res)=>res.json(await center.read()));
  app.get('/api/operations/logs/:name',async(req,res)=>{
    if(![...SERVICES,'reid-services','reid-host-ops'].includes(req.params.name))return res.status(400).json({error:'container_not_allowed'});
    res.json(await hostOps.observe('logs',req.params.name));
  });
  app.post('/api/operations/preview',async(req,res)=>{
    try{res.json(await center.preview(req.user.id,req.body.kind,req.body.target));}catch(error){res.status(400).json({error:error.message==='operation_not_allowed'?error.message:'operation_unavailable'});}
  });
  app.post('/api/operations/confirm',async(req,res)=>{
    // A durable receipt survives an interrupted HTTP response; never retry an uncertain action.
    try{res.json(await center.execute(req.user.id,req.body.id,req.body.code));}catch(error){res.status(409).json({error:['operation_expired_or_used','confirmation_code_invalid'].includes(error.message)?error.message:'operation_unavailable'});}
  });
}

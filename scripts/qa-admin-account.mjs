import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const project='pkogchbrknwmzefjklkr';
const url=`https://${project}.supabase.co`;
const keys=JSON.parse(execFileSync('npx',['--yes','supabase@2.117.0','projects','api-keys','--project-ref',project,'--reveal','-o','json'],{encoding:'utf8'}));
const publishable=keys.find(key=>key.type==='publishable')?.api_key;
const serviceRole=keys.find(key=>key.name==='service_role')?.api_key;
if(!publishable||!serviceRole)throw new Error('Supabase API keys unavailable');
const admin=createClient(url,serviceRole,{auth:{persistSession:false}});
const caller=createClient(url,publishable,{auth:{persistSession:false}});
const stamp=Date.now();
const password=randomBytes(24).toString('base64url');
let ownerId,targetId;

async function invoke(body){
  const {data,error}=await caller.functions.invoke('manage-account',{body});
  if(error||data?.error)throw new Error(data?.error||error?.message||'manage-account failed');
}

try{
  const owner=await admin.auth.admin.createUser({email:`admin-control-owner-${stamp}@reid.test`,password,email_confirm:true,user_metadata:{full_name:'Admin control QA owner'}});
  if(owner.error)throw owner.error;ownerId=owner.data.user.id;
  const target=await admin.auth.admin.createUser({email:`admin-control-target-${stamp}@reid.test`,password,email_confirm:true,user_metadata:{full_name:'Admin control QA target'}});
  if(target.error)throw target.error;targetId=target.data.user.id;
  const role=await admin.from('user_roles').insert({user_id:ownerId,role:'owner',granted_by:ownerId});if(role.error)throw role.error;
  const session=await caller.auth.signInWithPassword({email:owner.data.user.email,password});if(session.error)throw session.error;

  await invoke({action:'set_role',targetUserId:targetId,role:'employee',enabled:true,reason:'Automated governance verification'});
  const granted=await admin.from('user_roles').select('role').eq('user_id',targetId).eq('role','employee').single();if(granted.error)throw granted.error;
  const audit=await admin.from('audit_logs').select('actor_id').eq('record_id',targetId).eq('action','role_granted').eq('actor_id',ownerId).single();if(audit.error)throw audit.error;

  await invoke({action:'set_status',targetUserId:targetId,status:'suspended',reason:'Automated suspension verification'});
  const suspended=await admin.from('account_controls').select('status,reason').eq('user_id',targetId).single();
  if(suspended.error||suspended.data.status!=='suspended')throw suspended.error||new Error('Suspension was not persisted');
  await invoke({action:'set_status',targetUserId:targetId,status:'active',reason:'Automated reactivation verification'});
  await invoke({action:'set_role',targetUserId:targetId,role:'employee',enabled:false,reason:'Automated cleanup verification'});
  console.log(JSON.stringify({ok:true,roleGrant:true,actorAudit:true,suspendAndReactivate:true,roleRemoval:true}));
}finally{
  if(targetId)await admin.from('audit_logs').delete().eq('record_id',targetId);
  if(ownerId)await admin.from('audit_logs').delete().eq('actor_id',ownerId);
  if(targetId)await admin.from('user_roles').delete().eq('user_id',targetId);
  if(ownerId)await admin.from('user_roles').delete().eq('user_id',ownerId);
  if(targetId)await admin.auth.admin.deleteUser(targetId);
  if(ownerId)await admin.auth.admin.deleteUser(ownerId);
}

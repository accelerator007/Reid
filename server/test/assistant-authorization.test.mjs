import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantActions, parseWorkshopCommand } from '../assistant-actions.mjs';

// A small stateful PostgREST double lets the real action handler create,
// claim, cancel and execute requests without contacting WhatsApp or a database.
function fixture(kind='send_text',identityChanges={}) {
  const identity={id:'requester',phone_e164:'96891000001',roles:['owner'],outbound_scope:'any',workshops_enabled:true,notes_enabled:true,artifacts_enabled:true,...identityChanges};
  const chat={id:'request-chat'};
  const pending={id:'action-id',requester_id:identity.id,conversation_id:chat.id,kind,payload:{body:'Hello',artifact_id:'artifact-id',workshop_id:'workshop-id',note_id:'note-id',title_ar:'ورشة',title_en:'Workshop'},recipient_phone:'96891000002',recipient_name:'Recipient',status:'pending_confirmation',expires_at:new Date(Date.now()+60000).toISOString(),created_at:new Date().toISOString()};
  const tables={
    whatsapp_actions:[pending],
    whatsapp_admin_profiles:[{user_id:'recipient',phone_e164:pending.recipient_phone,enabled:true}],
    account_controls:[{user_id:'recipient',status:'active'}],
    user_roles:[{user_id:'recipient',role:'employee'}],
    workshops:[{id:'workshop-id',title_ar:'ورشة',title_en:'Workshop',status:'draft'}],
    assistant_notes:[{id:'note-id',owner_id:identity.id,status:'active'}],
    whatsapp_artifacts:[{id:'artifact-id',owner_id:identity.id,title:'Report',kind:'pdf'}],
    assistant_contacts:[],
  };
  const writes=[],effects=[];
  let sequence=0,failedTable=null;
  const admin={from(table){
    let operation='select',payload,filters=[],single=false,required=false,max=Infinity,ordering=null,promise;
    const query={
      select(){return query;},
      update(value){operation='update';payload=value;return query;},
      insert(value){operation='insert';payload=value;return query;},
      upsert(value){operation='upsert';payload=value;return query;},
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      gt(key,value){filters.push(row=>row[key]>value);return query;},
      lte(key,value){filters.push(row=>row[key]<=value);return query;},
      in(key,values){filters.push(row=>values.includes(row[key]));return query;},
      order(key,{ascending=true}={}){ordering={key,ascending};return query;},
      limit(value){max=value;return query;},
      maybeSingle(){single=true;return query;},
      single(){single=true;required=true;return query;},
      then(resolve,reject){
        promise ||= Promise.resolve().then(()=>{
          if(table===failedTable)return {data:null,error:new Error('database_unavailable')};
          let rows=(tables[table]||=[]).filter(row=>filters.every(filter=>filter(row)));
          if(operation==='insert'||operation==='upsert'){
            const row={id:`created-${++sequence}`,status:'pending_confirmation',expires_at:new Date(Date.now()+60000).toISOString(),created_at:new Date().toISOString(),...payload};
            tables[table].push(row);rows=[row];
          }else if(operation==='update')for(const row of rows)Object.assign(row,payload);
          if(operation!=='select')writes.push({table,operation,payload:{...payload},ids:rows.map(row=>row.id)});
          if(ordering)rows.sort((a,b)=>String(a[ordering.key]).localeCompare(String(b[ordering.key]))*(ordering.ascending?1:-1));
          rows=rows.slice(0,max).map(row=>({...row}));
          if(single&&(rows.length>1||(required&&!rows.length)))return {data:null,error:new Error('unexpected_cardinality')};
          return {data:single?rows[0]||null:rows,error:null};
        });
        return promise.then(resolve,reject);
      },
    };
    return query;
  }};
  const check=async query=>{const {data,error}=await query;if(error)throw error;return data;};
  const handle=createAssistantActions({admin,check,
    aiChat:async()=>{throw new Error('unexpected_model_call');},
    aiImage:async()=>{throw new Error('unexpected_image_call');},
    verifyNumber:async phone=>{effects.push({kind:'verify',phone});return true;},
    ensureConversation:async phone=>{effects.push({kind:'conversation',phone});return {id:'recipient-chat'};},
    queueText:async(_chat,body,options)=>effects.push({kind:'text',body,options}),
    queueMedia:async(_chat,options)=>effects.push({kind:'media',options}),
  });
  return {identity,chat,pending,tables,writes,effects,handle,failReads(table){failedTable=table;}};
}

const approve=state=>state.handle({identity:state.identity,chat:state.chat,text:'موافقة'});
function assertCancelled(state,error) {
  assert.equal(state.pending.status,'cancelled');
  assert.equal(state.pending.error_code,error);
  assert.deepEqual(state.effects,[]);
  assert.equal(state.writes.some(write=>write.table!=='whatsapp_actions'),false);
  assert.equal(state.writes.some(write=>write.payload.status==='running'),false);
}

for(const kind of ['workshop_create','workshop_publish','workshop_cancel']){
  test(`${kind} rechecks the workshop flag and manager role on confirmation`,async()=>{
    for(const change of [{workshops_enabled:false},{roles:['employee']}]){
      const state=fixture(kind,change);
      const result=await approve(state);
      assert.equal(result.handled,true);
      assertCancelled(state,'workshops_permission_revoked');
      assert.equal(state.tables.workshops[0].status,'draft');
    }
  });
}

test('revoking private notes cancels a previously pending deletion',async()=>{
  const state=fixture('note_delete',{notes_enabled:false});
  await approve(state);
  assertCancelled(state,'notes_permission_revoked');
  assert.equal(state.tables.assistant_notes[0].status,'active');
});

for(const kind of ['send_text','send_artifact']){
  test(`${kind} cannot execute after outbound permission is disabled`,async()=>{
    const state=fixture(kind,{outbound_scope:'none'});
    await approve(state);
    assertCancelled(state,'outbound_disabled');
  });
}

test('an actual send preview cannot outlive a narrowed outbound permission',async()=>{
  const state=fixture();
  state.tables.whatsapp_actions.length=0;
  state.tables.whatsapp_admin_profiles.length=0;
  const preview=await state.handle({identity:state.identity,chat:state.chat,text:'أرسل إلى 96891000002 تقرير الورشة'});
  assert.equal(preview.handled,true);
  assert.equal(state.effects.length,0);
  const action=state.tables.whatsapp_actions[0];
  assert.equal(action.status,'pending_confirmation');
  state.identity.outbound_scope='company';
  await approve(state);
  assert.equal(action.status,'cancelled');
  assert.equal(action.error_code,'recipient_not_active_company_member');
  assert.deepEqual(state.effects,[]);
});

test('company sends require a currently linked, active company recipient',async()=>{
  const changes=[
    state=>{state.tables.whatsapp_admin_profiles.length=0;},
    state=>{state.tables.whatsapp_admin_profiles[0].enabled=false;},
    state=>{state.tables.account_controls[0].status='suspended';},
    state=>{state.tables.account_controls.length=0;},
    state=>{state.tables.user_roles[0].role='guest';},
    state=>{state.tables.user_roles.length=0;},
  ];
  for(const change of changes){
    const state=fixture('send_text',{outbound_scope:'company'});
    change(state);
    await approve(state);
    assertCancelled(state,'recipient_not_active_company_member');
  }
});

test('a failed company-recipient authorization read never claims or sends an action',async()=>{
  const state=fixture('send_text',{outbound_scope:'company'});
  state.failReads('account_controls');
  await assert.rejects(approve(state),/database_unavailable/);
  assert.equal(state.pending.status,'pending_confirmation');
  assert.deepEqual(state.effects,[]);
  assert.equal(state.writes.some(write=>write.payload.status==='running'),false);
});

test('unknown approval kinds are rejected before any execution',async()=>{
  const state=fixture('server_shell');
  await approve(state);
  assertCancelled(state,'unsupported_action');
});

test('authorized company and any-number sends still queue once after explicit approval',async()=>{
  for(const scope of ['company','any'])for(const kind of ['send_text','send_artifact']){
    const state=fixture(kind,{outbound_scope:scope});
    if(scope==='any')state.tables.whatsapp_admin_profiles.length=0;
    const result=await approve(state);
    assert.equal(result.handled,true);
    assert.equal(state.pending.status,'queued');
    assert.equal(state.effects.filter(effect=>effect.kind==='text'||effect.kind==='media').length,1);
    assert.equal(await approve(state),null);
    assert.equal(state.effects.filter(effect=>effect.kind==='text'||effect.kind==='media').length,1);
  }
});

test('authorized workshop publication and private note deletion still complete',async()=>{
  const workshop=fixture('workshop_publish',{roles:['hr']});
  await approve(workshop);
  assert.equal(workshop.tables.workshops[0].status,'published');
  assert.equal(workshop.pending.status,'completed');
  const note=fixture('note_delete',{roles:['employee']});
  await approve(note);
  assert.equal(note.tables.assistant_notes[0].status,'archived');
  assert.equal(note.pending.status,'completed');
});

test('approval cannot claim another requester, conversation, or expired action',async()=>{
  for(const change of [
    state=>{state.pending.requester_id='someone-else';},
    state=>{state.pending.conversation_id='another-chat';},
    state=>{state.pending.expires_at=new Date(Date.now()-60000).toISOString();},
  ]){
    const state=fixture();change(state);
    assert.equal(await approve(state),null);
    assert.deepEqual(state.effects,[]);
    assert.equal(state.writes.some(write=>write.payload.status==='running'),false);
  }
});

test('Arabic withdrawal commands prepare only a draft transition',()=>{
  for(const text of ['أخف الورشة مقدمة الذكاء','إخفاء ورشة مقدمة الذكاء','اسحب نشر ورشة مقدمة الذكاء']){
    assert.deepEqual(parseWorkshopCommand(text),{kind:'unpublish',query:'مقدمة الذكاء'});
  }
});

test('hiding a named workshop needs confirmation and preserves all other fields',async()=>{
  const state=fixture();
  state.tables.whatsapp_actions.length=0;
  Object.assign(state.tables.workshops[0],{title_ar:'مقدمة الذكاء',status:'published',capacity:20});
  const preview=await state.handle({identity:state.identity,chat:state.chat,text:'أخف الورشة مقدمة الذكاء'});
  assert.match(preview.text,/موافقة/);
  assert.equal(state.tables.workshops[0].status,'published');
  const action=state.tables.whatsapp_actions[0];
  assert.equal(action.kind,'workshop_update');
  assert.deepEqual(action.payload,{workshop_id:'workshop-id',status:'draft'});
  assert.equal(action.status,'pending_confirmation');
  await approve(state);
  assert.equal(state.tables.workshops[0].status,'draft');
  assert.equal(state.tables.workshops[0].capacity,20);
  assert.equal(action.status,'completed');
  assert.deepEqual(state.writes.filter(write=>write.table==='workshops').map(write=>write.payload),[{status:'draft'}]);
});

test('workshop withdrawal also respects revoked flags and manager roles',async()=>{
  for(const change of [{workshops_enabled:false},{roles:['employee']}]){
    const state=fixture('workshop_update',change);
    state.pending.payload={workshop_id:'workshop-id',status:'draft'};
    await approve(state);
    assertCancelled(state,'workshops_permission_revoked');
  }
});

test('workshop updates cannot approve arbitrary fields or status transitions',async()=>{
  for(const payload of [
    {workshop_id:'workshop-id',status:'published'},
    {workshop_id:'workshop-id',status:'draft',capacity:999},
    {workshop_id:'workshop-id'},
    {status:'draft'},
    null,
  ]){
    const state=fixture('workshop_update');state.pending.payload=payload;
    await approve(state);
    assertCancelled(state,'unsupported_action');
  }
});

test('publish, cancel and hide require a uniquely named workshop',async()=>{
  for(const command of ['انشر ورشة','الغي ورشة','أخف الورشة'])for(const name of ['', ' الذكاء']){
    const state=fixture();
    state.tables.whatsapp_actions.length=0;
    state.tables.workshops=[
      {id:'first',title_ar:'مقدمة الذكاء',title_en:'AI Introduction',status:'published'},
      {id:'second',title_ar:'تطبيقات الذكاء',title_en:'AI Applications',status:'published'},
    ];
    const result=await state.handle({identity:state.identity,chat:state.chat,text:`${command}${name}`});
    assert.equal(result.handled,true);
    assert.match(result.text,name?/أكثر من ورشة/:/اكتب اسم الورشة/);
    assert.equal(state.tables.whatsapp_actions.length,0);
    assert.equal(state.writes.some(write=>write.table==='workshops'),false);
  }
});

test('group address prefixes are removed for commands and their confirmation',async()=>{
  for(const prefix of ['ريد','ريّد،','Reid:']){
    const state=fixture();
    state.chat.jid='123456@g.us';
    state.tables.whatsapp_actions.length=0;
    Object.assign(state.tables.workshops[0],{title_ar:'مقدمة الذكاء',status:'published'});
    const result=await state.handle({identity:state.identity,chat:state.chat,text:`${prefix} أخف الورشة مقدمة الذكاء`});
    assert.equal(result.handled,true);
    assert.equal(state.tables.workshops[0].status,'published');
    await state.handle({identity:state.identity,chat:state.chat,text:`${prefix} موافقة`});
    assert.equal(state.tables.workshops[0].status,'draft');
  }
});

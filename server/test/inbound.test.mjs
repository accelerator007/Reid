import test from 'node:test';
import assert from 'node:assert/strict';
import { createInboundPersistence } from '../inbound.mjs';

const inbound={jid:'96890000000@s.whatsapp.net',id:'message-1',text:'مرحبا ريّد',senderPhone:'96890000000',isGroup:false};

function setup({conversation=null,raceConversation=null,group=null,rateAllowed=true,insertError=null}={}) {
  const tables={qr_conversations:conversation?[{...conversation}]:[],qr_messages:[],qr_jobs:[]};
  const calls=[],authorizations=[],rates=[];
  const admin={from(table) {
    const query={table,operation:'select',filters:[]};
    const execute=async()=>{
      calls.push({...query,filters:[...query.filters]});
      const rows=tables[table];
      if(query.operation==='select')return {data:rows.find(row=>query.filters.every(([key,value])=>row[key]===value))||null,error:null};
      if(query.operation==='insert'){
        if(insertError)return {data:null,error:insertError};
        if(raceConversation){rows.push({...raceConversation});raceConversation=null;return {data:null,error:{code:'23505'}};}
        const created={id:'chat-new',...query.payload};
        rows.push(created);
        return {data:{...created},error:null};
      }
      if(query.operation==='upsert'){
        const key=query.options.onConflict;
        if(!rows.some(row=>row[key]===query.payload[key]))rows.push({...query.payload});
        return {data:null,error:null};
      }
      if(query.operation==='update'){
        for(const row of rows)if(query.filters.every(([key,value])=>row[key]===value))Object.assign(row,query.payload);
        return {data:null,error:null};
      }
      throw new Error(`unexpected_operation_${query.operation}`);
    };
    const chain={
      select(){return chain;},
      eq(key,value){query.filters.push([key,value]);return chain;},
      insert(payload){Object.assign(query,{operation:'insert',payload});return chain;},
      upsert(payload,options){Object.assign(query,{operation:'upsert',payload,options});return chain;},
      update(payload){Object.assign(query,{operation:'update',payload});return chain;},
      maybeSingle:execute,
      single:execute,
      then(resolve,reject){return execute().then(resolve,reject);},
    };
    return chain;
  }};
  const check=async query=>{const {data,error}=await query;if(error)throw new Error(`database_${error.code||'failed'}`);return data;};
  const persist=createInboundPersistence({
    admin,check,
    allowedOwnerGroup:async item=>{authorizations.push(item);return group;},
    rate:(...args)=>{rates.push(args);return rateAllowed;},
  });
  return {persist,tables,calls,authorizations,rates};
}

test('first inbound message creates a sanitized conversation, message and reply job',async()=>{
  const {persist,tables,rates,authorizations}=setup();
  const item={...inbound,text:'مرحبا '.repeat(40)};
  await persist({pushName:' \u0000Ali\nReid\u007f '},item);
  assert.equal(tables.qr_conversations.length,1);
  assert.deepEqual(tables.qr_conversations[0],{
    id:'chat-new',jid:item.jid,display_name:'Ali Reid',bot_mode:'active',
    last_message:item.text.slice(0,180),updated_at:tables.qr_conversations[0].updated_at,
  });
  assert.ok(Number.isFinite(Date.parse(tables.qr_conversations[0].updated_at)));
  assert.deepEqual(tables.qr_messages,[{conversation_id:'chat-new',message_id:item.id,direction:'inbound',body:item.text,sender_phone:item.senderPhone}]);
  assert.deepEqual(tables.qr_jobs,[{conversation_id:'chat-new',message_id:item.id,input:item.text,sender_phone:item.senderPhone}]);
  assert.deepEqual(rates,[['in:chat-new',6]]);
  assert.deepEqual(authorizations,[]);
});

test('existing conversation is reused and repeated delivery does not duplicate messages or jobs',async()=>{
  const {persist,tables,calls}=setup({conversation:{id:'chat-existing',jid:inbound.jid,display_name:'Existing',bot_mode:'active'}});
  await persist({pushName:'New name'},inbound);
  await persist({pushName:'New name'},inbound);
  assert.equal(tables.qr_conversations.length,1);
  assert.equal(tables.qr_conversations[0].display_name,'Existing');
  assert.equal(tables.qr_messages.length,1);
  assert.equal(tables.qr_jobs.length,1);
  assert.equal(tables.qr_messages[0].conversation_id,'chat-existing');
  assert.equal(tables.qr_jobs[0].conversation_id,'chat-existing');
  assert.equal(calls.filter(call=>call.operation==='insert').length,0);
  for(const call of calls.filter(call=>call.operation==='upsert'))assert.deepEqual(call.options,{onConflict:'message_id',ignoreDuplicates:true});
});

test('a concurrent first message unique conflict recovers the winning conversation',async()=>{
  const {persist,tables,calls}=setup({raceConversation:{id:'chat-winner',jid:inbound.jid,display_name:'Winner',bot_mode:'active'}});
  await persist({pushName:'Second request'},inbound);
  assert.equal(tables.qr_conversations.length,1);
  assert.equal(tables.qr_conversations[0].display_name,'Winner');
  assert.equal(tables.qr_messages[0].conversation_id,'chat-winner');
  assert.equal(tables.qr_jobs[0].conversation_id,'chat-winner');
  assert.equal(calls.filter(call=>call.table==='qr_conversations'&&call.operation==='select').length,2);
});

test('a disallowed group stops before any conversation or message write',async()=>{
  const {persist,tables,calls,authorizations,rates}=setup();
  const item={...inbound,jid:'group@g.us',isGroup:true};
  await persist({pushName:'Untrusted sender'},item);
  assert.deepEqual(authorizations,[item]);
  assert.deepEqual(calls,[]);
  assert.deepEqual(rates,[]);
  assert.deepEqual(tables,{qr_conversations:[],qr_messages:[],qr_jobs:[]});
});

test('human mode stores inbound messages without queuing an automated reply',async()=>{
  const {persist,tables,rates}=setup({conversation:{id:'chat-human',jid:inbound.jid,bot_mode:'human'}});
  await persist({},inbound);
  assert.equal(tables.qr_messages.length,1);
  assert.equal(tables.qr_conversations[0].last_message,inbound.text);
  assert.deepEqual(tables.qr_jobs,[]);
  assert.deepEqual(rates,[]);
});

test('authorized groups use the bounded registered name and retain rate limiting',async()=>{
  const {persist,tables,authorizations,rates}=setup({group:{display_name:'G'.repeat(140)},rateAllowed:false});
  const item={...inbound,jid:'group@g.us',isGroup:true};
  await persist({pushName:'Sender'},item);
  assert.deepEqual(authorizations,[item]);
  assert.equal(tables.qr_conversations[0].display_name,'G'.repeat(120));
  assert.equal(tables.qr_messages.length,1);
  assert.deepEqual(tables.qr_jobs,[]);
  assert.deepEqual(rates,[['in:chat-new',6]]);
});

test('empty display names fall back to the WhatsApp identifier',async()=>{
  const {persist,tables}=setup();
  await persist({pushName:' \u0000\n '},inbound);
  assert.equal(tables.qr_conversations[0].display_name,'96890000000');
});

test('conversation insertion failures keep stage diagnostics and never queue a reply',async()=>{
  const insertError={code:'XX000'};
  const {persist,tables}=setup({insertError});
  await assert.rejects(persist({},inbound),error=>error.message==='inbound_conversation_insert_failed'&&error.cause===insertError);
  assert.deepEqual(tables.qr_messages,[]);
  assert.deepEqual(tables.qr_jobs,[]);
});

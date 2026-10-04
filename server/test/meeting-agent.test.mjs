import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentToken } from '../meetings.mjs';
import { createMeetingTurnHandler } from '../meeting-agent.mjs';
import { createFakeSupabase, check } from './fake-supabase.mjs';

const secret='c'.repeat(64);
const token=createAgentToken({meetingId:'meeting-1',ownerId:'owner-1'},secret);
const request=(value,{body={text:'هلا ريّد'}}={})=>({params:{token:value},body});
const response=()=>{
  const result={statusCode:200,headers:{},body:null,ended:false};
  result.status=code=>{result.statusCode=code;return result};
  result.set=headers=>{Object.assign(result.headers,headers);return result};
  result.send=body=>{result.body=body;return result};
  result.end=()=>{result.ended=true;return result};
  return result;
};
const deps=(overrides={})=>{
  const admin=createFakeSupabase({tables:{
    reid_meetings:[{id:'meeting-1',owner_id:'owner-1',status:'active'}],
    reid_meeting_turns:[{id:'old-1',meeting_id:'meeting-1',owner_id:'owner-1',role:'user',body:'تذكر المشروع',created_at:'2026-01-01'}],
  }});
  return {admin,check,sessionKey:secret,rate:()=>true,aiChat:async()=> 'أبشر، حاضر.',synthesize:async()=>Buffer.from('opus-audio'),...overrides};
};

test('meeting bridge rejects invalid token before touching storage or AI',async()=>{
  let called=false;
  const d=deps({aiChat:async()=>{called=true;}}),res=response();
  await createMeetingTurnHandler(d)(request('invalid-token'),res);
  assert.equal(res.statusCode,404);
  assert.equal(res.ended,true);
  assert.equal(called,false);
  assert.equal(d.admin.calls.length,0);
});

test('meeting bridge rate limits before processing transcript',async()=>{
  const d=deps({rate:()=>false}),res=response();
  await createMeetingTurnHandler(d)(request(token),res);
  assert.equal(res.statusCode,429);
  assert.equal(d.admin.calls.length,0);
});

test('meeting bridge ignores empty transcript and rejects inactive meeting',async()=>{
  const d=deps(),empty=response();
  await createMeetingTurnHandler(d)(request(token,{body:{text:' '}}),empty);
  assert.equal(empty.statusCode,204);
  d.admin.table('reid_meetings')[0].status='ended';
  const gone=response();
  await createMeetingTurnHandler(d)(request(token),gone);
  assert.equal(gone.statusCode,410);
  assert.equal(d.admin.table('reid_meeting_turns').length,1);
});

test('successful voice turn uses bounded history, stores both sides, and returns Opus',async()=>{
  let prompt='',input='',spoken='';
  const d=deps({
    aiChat:async(system,user)=>{prompt=system;input=user;return 'أبشر يا علي، حاضر.'},
    synthesize:async text=>{spoken=text;return Buffer.from('voice-bytes')},
  }),res=response();
  await createMeetingTurnHandler(d)(request(token,{body:{text:`  ${'هلا '.repeat(400)}  `}}),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['Content-Type'],'audio/ogg; codecs=opus');
  assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
  assert.equal(res.headers['Content-Length'],String(Buffer.byteLength('voice-bytes')));
  assert.equal(spoken,'أبشر يا علي، حاضر.');
  assert.match(input,/تذكر المشروع/);
  assert.ok(input.length<1400);
  assert.match(prompt,/واتساب/);
  assert.match(prompt,/عملية حساسة/);
  assert.match(prompt,/لا تقل رد الوكيل/);
  const turns=d.admin.table('reid_meeting_turns');
  assert.equal(turns.at(-2).role,'user');
  assert.equal(turns.at(-2).body.length,1200);
  assert.equal(turns.at(-1).role,'assistant');
});

test('empty AI answer fails without fabricating an assistant turn',async()=>{
  const d=deps({aiChat:async()=> '  '}),res=response();
  await createMeetingTurnHandler(d)(request(token),res);
  assert.equal(res.statusCode,503);
  assert.equal(d.admin.table('reid_meeting_turns').filter(row=>row.role==='assistant').length,0);
});

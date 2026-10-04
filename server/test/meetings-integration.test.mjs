import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingService, open, seal, signState } from '../meetings.mjs';
import { createFakeSupabase, check } from './fake-supabase.mjs';

const secret='b'.repeat(64);
const owner={id:'owner-1',roles:['owner']};
const baseEnv={
  GOOGLE_MEET_CLIENT_ID:'google-client',
  GOOGLE_MEET_CLIENT_SECRET:'google-secret',
  GOOGLE_MEET_REDIRECT_URI:'https://reidpro.com/api/meet/google/callback',
  RECALL_API_KEY:'recall-secret',
  RECALL_TRANSCRIPTION_READY:'1',
  REID_PUBLIC_URL:'https://reidpro.com',
  SESSION_KEY:secret,
};

const response=(status,body={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const database=(tables={})=>createFakeSupabase({tables:{
  meeting_connections:[{owner_id:owner.id,google_email:'owner@example.com',google_refresh_token:seal('refresh-token',secret)}],
  reid_meetings:[],
  ...tables,
}});

test('meeting start creates an open Google space, joins Recall, and activates the row',async()=>{
  const db=database(),requests=[];
  const fetchImpl=async(url,options={})=>{
    requests.push({url:String(url),options});
    if(String(url).includes('oauth2.googleapis.com'))return response(200,{access_token:'google-access'});
    if(String(url)==='https://meet.googleapis.com/v2/spaces')return response(200,{name:'spaces/abc',meetingUri:'https://meet.google.com/abc-defg-hij',meetingCode:'abc-defg-hij',config:{accessType:'OPEN'}});
    if(String(url).endsWith('/bot/'))return response(201,{id:'recall-bot-1'});
    throw new Error(`unexpected_url_${url}`);
  };
  const service=createMeetingService({admin:db,check,env:baseEnv,fetchImpl});
  const result=await service.start({identity:owner,conversationId:'conversation-1',sourceText:'خلنا ندخل ميتنج'});
  assert.equal(result.status,'active');
  assert.equal(result.recall_bot_id,'recall-bot-1');
  assert.equal(requests.length,3);
  const tokenBody=new URLSearchParams(requests[0].options.body);
  assert.equal(tokenBody.get('refresh_token'),'refresh-token');
  assert.equal(tokenBody.get('client_secret'),'google-secret');
  const meetBody=JSON.parse(requests[1].options.body);
  assert.deepEqual(meetBody,{config:{accessType:'OPEN',entryPointAccess:'ALL',moderation:'OFF'}});
  assert.equal(requests[1].options.headers.Authorization,'Bearer google-access');
  const recallBody=JSON.parse(requests[2].options.body);
  assert.equal(recallBody.meeting_url,result.meeting_url);
  assert.equal(recallBody.bot_name,'Reid | ريّد');
  assert.equal(recallBody.recording_config.transcript.provider.elevenlabs_streaming.model_id,'scribe_v2_realtime');
  assert.match(recallBody.output_media.camera.config.url,/^https:\/\/reidpro\.com\/meet-agent\//);
  assert.ok(!JSON.stringify(recallBody).includes('recall-secret'));
  assert.equal(db.table('reid_meetings').length,1);
});

test('meeting start reuses an active link without calling providers',async()=>{
  const db=database({reid_meetings:[{id:'meeting-live',owner_id:owner.id,status:'active',meeting_url:'https://meet.google.com/live'}]});
  const service=createMeetingService({admin:db,check,env:baseEnv,fetchImpl:async()=>{throw new Error('provider_must_not_be_called');}});
  const result=await service.start({identity:owner});
  assert.equal(result.id,'meeting-live');
  assert.equal(result.reused,true);
});

test('meeting prerequisites fail closed before creating database state',async()=>{
  for(const [override,message] of [
    [{GOOGLE_MEET_CLIENT_ID:''},'meeting_google_app_not_configured'],
    [{RECALL_API_KEY:''},'meeting_voice_provider_not_configured'],
    [{RECALL_TRANSCRIPTION_READY:'0'},'meeting_transcription_not_configured'],
  ]){
    const db=database();
    const service=createMeetingService({admin:db,check,env:{...baseEnv,...override},fetchImpl:async()=>response(500)});
    await assert.rejects(()=>service.start({identity:owner}),new RegExp(message));
    assert.equal(db.table('reid_meetings').length,0);
  }
  const db=database({meeting_connections:[]});
  await assert.rejects(()=>createMeetingService({admin:db,check,env:baseEnv,fetchImpl:async()=>response(500)}).start({identity:owner}),/meeting_google_not_connected/);
  assert.equal(db.table('reid_meetings').length,0);
  await assert.rejects(()=>createMeetingService({admin:db,check,env:baseEnv}).start({identity:{id:'admin-1',roles:['admin']}}),/meeting_owner_required/);
});

test('non-open Google space is ended and the meeting is marked failed',async()=>{
  const db=database(),urls=[];
  const fetchImpl=async(url)=>{
    urls.push(String(url));
    if(String(url).includes('oauth2.googleapis.com'))return response(200,{access_token:'access'});
    if(String(url).endsWith('/spaces'))return response(200,{name:'spaces/locked',meetingUri:'https://meet.google.com/locked',config:{accessType:'TRUSTED'}});
    if(String(url).includes(':endActiveConference'))return response(200,{});
    throw new Error(`unexpected_url_${url}`);
  };
  const service=createMeetingService({admin:db,check,env:baseEnv,fetchImpl});
  await assert.rejects(()=>service.start({identity:owner}),/meeting_open_access_unavailable/);
  assert.ok(urls.some(url=>url.includes('spaces/locked:endActiveConference')));
  assert.equal(db.table('reid_meetings')[0].status,'failed');
  assert.equal(db.table('reid_meetings')[0].error_code,'meeting_open_access_unavailable');
});

test('Recall join failure cleans up Google space and records the provider error',async()=>{
  const db=database(),urls=[];
  const fetchImpl=async(url)=>{
    urls.push(String(url));
    if(String(url).includes('oauth2.googleapis.com'))return response(200,{access_token:'access'});
    if(String(url).endsWith('/spaces'))return response(200,{name:'spaces/cleanup',meetingUri:'https://meet.google.com/cleanup',config:{accessType:'OPEN'}});
    if(String(url).endsWith('/bot/'))return response(503,{detail:'temporarily unavailable'});
    if(String(url).includes(':endActiveConference'))return response(200,{});
    throw new Error(`unexpected_url_${url}`);
  };
  await assert.rejects(()=>createMeetingService({admin:db,check,env:baseEnv,fetchImpl}).start({identity:owner}),/recall_bot_create_503/);
  assert.ok(urls.some(url=>url.includes(':endActiveConference')));
  assert.equal(db.table('reid_meetings')[0].status,'failed');
});

test('ending a meeting closes Google and Recall even if transcription was later disabled',async()=>{
  const db=database({reid_meetings:[{id:'meeting-1',owner_id:owner.id,status:'active',google_space_name:'spaces/end-me',recall_bot_id:'bot-end'}]}),urls=[];
  const fetchImpl=async(url)=>{urls.push(String(url));return String(url).includes('oauth2.googleapis.com')?response(200,{access_token:'access'}):response(200,{})};
  const result=await createMeetingService({admin:db,check,env:{...baseEnv,RECALL_TRANSCRIPTION_READY:'0'},fetchImpl}).end({identity:owner});
  assert.equal(result.status,'ended');
  assert.ok(urls.some(url=>url.includes(':endActiveConference')));
  assert.ok(urls.some(url=>url.endsWith('/bot/bot-end/leave_call/')));
});

test('OAuth URL is least-scope and callback stores only an encrypted refresh token',async()=>{
  const db=database({meeting_connections:[]});
  const idPayload=Buffer.from(JSON.stringify({email:'owner@example.com'})).toString('base64url');
  const fetchImpl=async(url,options)=>{
    assert.equal(String(url),'https://oauth2.googleapis.com/token');
    const body=new URLSearchParams(options.body);
    assert.equal(body.get('code'),'oauth-code');
    return response(200,{refresh_token:'new-refresh',id_token:`x.${idPayload}.x`});
  };
  const service=createMeetingService({admin:db,check,env:baseEnv,fetchImpl});
  const auth=new URL(service.authorizationUrl(owner.id));
  assert.equal(auth.searchParams.get('redirect_uri'),baseEnv.GOOGLE_MEET_REDIRECT_URI);
  assert.equal(auth.searchParams.get('access_type'),'offline');
  assert.equal(auth.searchParams.get('scope'),'openid email https://www.googleapis.com/auth/meetings.space.created');
  const state=signState({ownerId:owner.id,exp:Date.now()+60_000},secret);
  assert.equal(await service.completeAuthorization({code:'oauth-code',state}),owner.id);
  const stored=db.table('meeting_connections')[0];
  assert.notEqual(stored.google_refresh_token,'new-refresh');
  assert.equal(open(stored.google_refresh_token,secret),'new-refresh');
  assert.equal(stored.google_email,'owner@example.com');
});

test('status reports each readiness gate without exposing credentials',async()=>{
  const db=database();
  const status=await createMeetingService({admin:db,check,env:baseEnv,fetchImpl:async()=>response(200)}).status(owner.id);
  assert.deepEqual({...status,active:undefined},{googleAppConfigured:true,googleConnected:true,googleEmail:'owner@example.com',voiceProviderConfigured:true,transcriptionConfigured:true,ready:true,active:undefined});
  assert.equal(status.active,null);
  assert.ok(!JSON.stringify(status).includes('refresh-token'));
  assert.ok(!JSON.stringify(status).includes('recall-secret'));
});

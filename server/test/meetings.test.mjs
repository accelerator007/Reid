import test from 'node:test';
import assert from 'node:assert/strict';
import { open, parseMeetingCommand, seal, signState, verifyState } from '../meetings.mjs';

const secret='a'.repeat(64);

test('meeting command grammar covers immediate Arabic wording',()=>{
  for(const text of ['خلنا ندخل ميتنج','نبدأ ميتنج','نسوي ميتنج','أرسل لي رابط ميتنج','افتح اجتماع الحين'])assert.deepEqual(parseMeetingCommand(text),{kind:'start'});
  assert.deepEqual(parseMeetingCommand('أنهي الاجتماع'),{kind:'end'});
  assert.deepEqual(parseMeetingCommand('حالة الميتنج'),{kind:'status'});
  assert.equal(parseMeetingCommand('عندي اجتماع بكرة'),null);
});

test('refresh token encryption authenticates and round trips',()=>{
  const packed=seal('refresh-secret',secret);
  assert.notEqual(packed,'refresh-secret');
  assert.equal(open(packed,secret),'refresh-secret');
  const middle=Math.floor(packed.length/2);
  assert.throws(()=>open(`${packed.slice(0,middle)}${packed[middle]==='x'?'y':'x'}${packed.slice(middle+1)}`,secret));
});

test('OAuth state is signed, expires and rejects changes',()=>{
  const state=signState({ownerId:'owner-1',exp:2_000},secret);
  assert.equal(verifyState(state,secret,1_000).ownerId,'owner-1');
  assert.throws(()=>verifyState(state,secret,3_000),/expired/);
  assert.throws(()=>verifyState(`${state}x`,secret,1_000),/invalid/);
});

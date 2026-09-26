import test from 'node:test';
import assert from 'node:assert/strict';
import { clockContext, clockReply, parseClockQuestion } from '../clock.mjs';

test('time and date questions are recognised in Gulf Arabic, English and the Owner group',()=>{
  for(const text of ['كم الساعة؟','كم الساعه الحين','الساعة كم','و الحين كم؟','ريد كم الساعة','ريّد، كم الوقت الحين؟','What time is it?'])assert.equal(parseClockQuestion(text),'time',text);
  for(const text of ['وش التاريخ اليوم؟','كم التاريخ','ايش اليوم','What is the date today?'])assert.equal(parseClockQuestion(text),'date',text);
});

test('ordinary sentences that mention time are left to the assistant',()=>{
  for(const text of ['كم الوقت اللي يحتاجه المشروع؟','الوقت غلط عدلها وحدك ف النظام ابحث ف الانترنت','ذكرني الساعة 5','كم مهمة عندي اليوم؟',''])assert.equal(parseClockQuestion(text),null,text);
});

test('answers come from the clock in Muscat time, not from a model',()=>{
  const moment=new Date('2026-09-26T10:48:00Z');
  const reply=clockReply('time',moment);
  assert.match(reply,/مسقط/);
  assert.match(reply,/٢:٤٨|2:48/);
  assert.match(clockReply('date',moment),/٢٠٢٦|2026/);
  assert.match(clockContext(moment),/UTC\+4/);
});

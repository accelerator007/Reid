import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyInput} from '../customer-journeys.mjs';
const id='74000000-0000-0000-0000-000000000001';
test('journey input preserves the due instant and does not accept a caller identity',()=>{
  const input=journeyInput(id,{title:' متابعة العميل ',assignee_id:id,due_at:'2026-10-15T10:00:00+04:00',actor_id:'spoofed'});
  assert.equal(input.follow_up_due,'2026-10-15T06:00:00.000Z');assert.equal(input.follow_up_title,'متابعة العميل');assert.equal('actor_id' in input,false);
});
test('invalid dates, identifiers and conflicting project creation fail before database writes',()=>{
  const valid={title:'متابعة',assignee_id:id,due_at:'2026-10-15T10:00:00Z'};
  for(const patch of [{due_at:null},{due_at:'bad'},{title:' '},{assignee_id:'x'},{contact_id:'x'},{project_id:id,new_project_name:'new'}])assert.throws(()=>journeyInput(id,{...valid,...patch}));
});

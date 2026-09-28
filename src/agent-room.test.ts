import { describe,expect,it } from 'vitest';
import { resolveAgentHandoffs,resolveAgentMentions,roomHistory,teamRequest } from './agent-room';
import type { AgentRow } from './agents';
import type { AgentRoomMessage } from './agent-room';

const agents=(['ceo','operations','marketing','sales','knowledge','hr','analytics','content','competitor','support'] as const)
  .map(id=>({id,enabled:true} as Pick<AgentRow,'id'|'enabled'>));

describe('agent team room',()=>{
  it('routes explicit English and Arabic mentions without duplicates',()=>{
    expect(resolveAgentMentions('@operations راجعها مع @التحليلات و @operations',agents)).toEqual(['operations','analytics']);
  });

  it('routes an unmentioned request to the orchestrator',()=>{
    expect(resolveAgentMentions('رتب لي العمل اليوم',agents)).toEqual(['ceo']);
  });

  it('expands an all-team mention only to enabled agents',()=>{
    const withDisabled=agents.map(agent=>agent.id==='hr'?{...agent,enabled:false}:agent);
    expect(resolveAgentMentions('@الجميع أعطوني رأيكم',withDisabled)).not.toContain('hr');
    expect(resolveAgentMentions('@all review this',withDisabled)).toHaveLength(9);
  });

  it('gives a room agent an explicit bounded handoff contract',()=>{
    const prompt=teamRequest('operations','راجع المشاريع','ar');
    expect(prompt).toContain('أنت @operations');
    expect(prompt).toContain('[HANDOFF:@agent_id]');
    expect(prompt).toContain('لا تدّع أنه نفّذ');
  });

  it('queues only explicit handoffs from an agent reply',()=>{
    expect(resolveAgentHandoffs('تواصلت مع @marketing.\n[HANDOFF:@content] جهز النص\n[HANDOFF: @التحليلات] راجع الأرقام',agents)).toEqual(['content','analytics']);
  });

  it('shares only completed recent room turns with the next agent',()=>{
    const base={room_id:'r',sender_user_id:null,mentions:[],run_id:null,reply_to:null,error:null,created_at:'',updated_at:''};
    const messages:AgentRoomMessage[]=[
      {...base,id:'1',sender_kind:'user',sender_user_id:'u',sender_agent_id:null,body:'ابدأ',state:'completed'},
      {...base,id:'2',sender_kind:'agent',sender_agent_id:'operations',body:'أعمل الآن',state:'running',run_id:'run'},
      {...base,id:'3',sender_kind:'agent',sender_agent_id:'operations',body:'هذه النتيجة',state:'completed',run_id:'run2'},
    ];
    expect(roomHistory(messages,'ar').map(turn=>turn.content)).toEqual(['[المالك] ابدأ','[التشغيل] هذه النتيجة']);
  });
});

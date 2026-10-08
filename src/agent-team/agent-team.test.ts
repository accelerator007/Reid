import { describe, expect, it } from 'vitest';
import type { AgentRoomMessage } from '../agent-room';
import { MAX_HANDOFFS, runTeamTurn, type TeamDependencies } from './orchestration';
import { appendMention, dayLabel, insertMention, mentionCandidates, mentionQuery, splitHandoffs, textDirection } from './mentions';

const agents = ['ceo', 'operations', 'marketing', 'content', 'sales', 'analytics'].map(id => ({ id, name: id, enabled: true }));

function fakeTeam(replies: Record<string, string | Error>, options: { queued?: string[] } = {}) {
  const messages: AgentRoomMessage[] = [];
  const calls: string[] = [];
  let runs = 0;
  const deps: TeamDependencies = {
    async run(agentId, _input, _history, replyTo) {
      calls.push(agentId);
      const reply = replies[agentId];
      if (reply instanceof Error) throw reply;
      const runId = `run-${++runs}`;
      messages.push({ id: `msg-${runs}`, room_id: 'room', sender_kind: 'agent', sender_user_id: null, sender_agent_id: agentId,
        body: reply ?? '', mentions: [], run_id: runId, reply_to: replyTo, state: 'completed', error: null,
        created_at: new Date(2026, 8, 29, 9, runs).toISOString(), updated_at: '' });
      return options.queued?.includes(agentId) ? { runId, status: 'queued' } : { runId, output: reply ?? '' };
    },
    async result(runId) {
      const index = Number(runId.split('-')[1]) - 1;
      return { status: 'succeeded', output: messages[index].body };
    },
    async messages() { return [...messages]; },
    sleep: async () => {},
  };
  return { deps, calls, messages };
}

const turn = (targets: string[]) => ({ text: 'راجع الوضع', lang: 'ar' as const, agents, targets, userMessageId: 'user-1' });

describe('agent team turn', () => {
  it('runs every mentioned agent once, in order', async () => {
    const team = fakeTeam({ operations: 'تم', marketing: 'تم' });
    const result = await runTeamTurn(turn(['operations', 'marketing', 'operations']), team.deps);
    expect(team.calls).toEqual(['operations', 'marketing']);
    expect(result.answered).toEqual(['operations', 'marketing']);
  });

  it('follows explicit handoffs, replying to the handing agent', async () => {
    const team = fakeTeam({ ceo: 'وزعت المهام.\n[HANDOFF:@operations] راجع العوائق', operations: 'العوائق اثنتان.' });
    await runTeamTurn(turn(['ceo']), team.deps);
    expect(team.calls).toEqual(['ceo', 'operations']);
    expect(team.messages[1].reply_to).toBe('msg-1');
  });

  it(`stops after ${MAX_HANDOFFS} automatic handoffs and never loops`, async () => {
    const chain = { ceo: '[HANDOFF:@operations]', operations: '[HANDOFF:@marketing]', marketing: '[HANDOFF:@content]', content: '[HANDOFF:@sales]', sales: '[HANDOFF:@ceo]' };
    const team = fakeTeam(chain);
    await runTeamTurn(turn(['ceo']), team.deps);
    expect(team.calls).toEqual(['ceo', 'operations', 'marketing', 'content']);
  });

  it('reports a failing agent and still runs the rest', async () => {
    const team = fakeTeam({ operations: new Error('provider_offline'), marketing: 'تم' });
    const result = await runTeamTurn(turn(['operations', 'marketing']), team.deps);
    expect(result.failures.map(failure => failure.agentId)).toEqual(['operations']);
    expect(result.answered).toEqual(['marketing']);
  });

  it('waits for a queued local run before reading its handoffs', async () => {
    const team = fakeTeam({ ceo: '[HANDOFF:@analytics]', analytics: 'الأرقام جاهزة' }, { queued: ['ceo'] });
    await runTeamTurn(turn(['ceo']), team.deps);
    expect(team.calls).toEqual(['ceo', 'analytics']);
  });
});

describe('composer mentions', () => {
  it('detects the mention being typed', () => {
    expect(mentionQuery('راجع @oper')).toBe('oper');
    expect(mentionQuery('@')).toBe('');
    expect(mentionQuery('email@reid')).toBeNull();
    expect(mentionQuery('done @ops now')).toBeNull();
  });

  it('suggests agents by id or Arabic name and inserts the choice', () => {
    expect(mentionCandidates(agents, 'تش', 'ar').map(agent => agent.id)).toEqual(['operations']);
    expect(mentionCandidates(agents, 'mark', 'en').map(agent => agent.id)).toEqual(['marketing']);
    expect(insertMention('راجع @op', 'operations')).toBe('راجع @operations ');
    expect(appendMention('راجع', 'sales')).toBe('راجع @sales ');
  });

  it('splits handoff markers out of a reply', () => {
    expect(splitHandoffs('خطة جاهزة.\n[HANDOFF:@content] اكتب المنشورات')).toEqual([
      { kind: 'text', text: 'خطة جاهزة.' }, { kind: 'handoff', agentId: 'content' }, { kind: 'text', text: 'اكتب المنشورات' },
    ]);
    expect(splitHandoffs('لا تسليم')).toEqual([{ kind: 'text', text: 'لا تسليم' }]);
  });

  it('labels days in Muscat time', () => {
    const now = new Date('2026-09-29T08:00:00Z');
    expect(dayLabel('2026-09-29T05:00:00Z', now, 'ar')).toBe('اليوم');
    expect(dayLabel('2026-09-28T05:00:00Z', now, 'en')).toBe('Yesterday');
    expect(dayLabel('2026-09-20T05:00:00Z', now, 'en')).toMatch(/20 September/);
  });
});

describe('message direction', () => {
  it('lays out by majority script, not the first word', () => {
    expect(textDirection('@operations لخص لي وضع المشروع')).toBe('rtl');
    expect(textDirection('@ops summarise the project status')).toBe('ltr');
    expect(textDirection('راجع React و Supabase')).toBe('rtl');
  });
});

// Data and actions for the agent team room: the private room, the agents that
// can take work, live messages and one send action that runs a team turn.
import React from 'react';
import {
  agentNames, ensureAgentRoom, loadAgentRoomMessages, postAgentRoomMessage, resolveAgentMentions,
  type AgentRoom, type AgentRoomMessage,
} from '../agent-room';
import { agentRunResult, runAgent, type AgentRow } from '../agents';
import { list, messageFor, run, toAppError } from '../db';
import { agentHealth, type AgentHealth } from '../owner-overview.model';
import { useSession } from '../shell';
import { supabase } from '../supabase';
import { runTeamTurn } from './orchestration';

type Lang = 'ar' | 'en';

// The order the roster is shown in: the orchestrator first, then by domain.
export const agentOrder = ['ceo', 'operations', 'analytics', 'knowledge', 'marketing', 'content', 'competitor', 'sales', 'support', 'hr'];

const byRoster = (a: { id: string }, b: { id: string }) =>
  (agentOrder.indexOf(a.id) + 1 || 99) - (agentOrder.indexOf(b.id) + 1 || 99);

const sortMessages = (rows: AgentRoomMessage[]) => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

export function useAgentTeam(lang: Lang) {
  const { user } = useSession();
  const [room, setRoom] = React.useState<AgentRoom | null>(null);
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [messages, setMessages] = React.useState<AgentRoomMessage[]>([]);
  const [health, setHealth] = React.useState<AgentHealth>('unknown');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!user || !supabase) return;
    const client = supabase;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [currentRoom, agentRows, runner] = await Promise.all([
          ensureAgentRoom(user.id, lang),
          list<AgentRow>(client.from('agents').select('id,name,status,model,host,approval_level,provider_id,classification,enabled,disabled_reason')),
          run<{ status: string; last_seen_at: string }>(client.from('agent_runner_status').select('status,last_seen_at').eq('id', 'ai-lap').maybeSingle()),
        ]);
        if (!agentRows.ok) throw agentRows.error;
        const history = await loadAgentRoomMessages(currentRoom.id);
        if (!alive) return;
        setRoom(currentRoom);
        setAgents(agentRows.data.filter(agent => agent.id in agentNames).sort(byRoster));
        setHealth(runner.ok ? agentHealth(runner.data, new Date()) : 'unknown');
        setMessages(sortMessages(history));
        setError('');
      } catch (cause) {
        if (alive) setError(messageFor(toAppError(cause), lang));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user, lang]);

  // Replies arrive through Realtime; the gateway writes them as the run progresses.
  React.useEffect(() => {
    if (!room || !supabase) return;
    const client = supabase;
    const channel = client.channel(`agent-team-room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_room_messages', filter: `room_id=eq.${room.id}` }, payload => {
        const row = (payload.new || payload.old) as AgentRoomMessage;
        setMessages(current => payload.eventType === 'DELETE'
          ? current.filter(message => message.id !== row.id)
          : sortMessages([...current.filter(message => message.id !== row.id), row]));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [room]);

  const send = React.useCallback(async (text: string) => {
    if (!room || !user || !text.trim() || busy) return false;
    const targets = resolveAgentMentions(text, agents);
    setBusy(true);
    setError('');
    try {
      const mine = await postAgentRoomMessage(room.id, user.id, text.trim(), targets);
      setMessages(current => sortMessages([...current.filter(message => message.id !== mine.id), mine]));
      const { failures } = await runTeamTurn(
        { text: text.trim(), lang, agents, targets, userMessageId: mine.id },
        {
          run: (agentId, input, history, replyToMessageId) =>
            runAgent(agentId, input, 'internal', history, { roomId: room.id, replyToMessageId }),
          result: agentRunResult,
          messages: () => loadAgentRoomMessages(room.id),
        },
        updated => setMessages(sortMessages(updated)),
      );
      if (failures.length) {
        setError(failures.map(failure => `${agentNames[failure.agentId]?.[lang] || failure.agentId}: ${messageFor(toAppError(failure.cause), lang)}`).join('\n'));
      }
      setMessages(sortMessages(await loadAgentRoomMessages(room.id)));
      return true;
    } catch (cause) {
      setError(messageFor(toAppError(cause), lang));
      return false;
    } finally {
      setBusy(false);
    }
  }, [room, user, agents, busy, lang]);

  return { room, agents, messages, health, loading, busy, error, send, dismissError: () => setError('') };
}

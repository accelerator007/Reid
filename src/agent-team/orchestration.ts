// One turn of the agent team: the Owner writes once, the mentioned agents
// answer in order, and an agent may hand a clearly scoped part to a colleague
// with an explicit [HANDOFF:@agent] line.
//
// Guards, unchanged from the original room:
//   - an agent answers at most once per turn;
//   - at most MAX_HANDOFFS automatic handoffs per turn;
//   - a failure is reported and the remaining agents still run.
//
// This still runs in the browser. The Reid 2.0 plan moves it to a server-side
// runtime so a turn survives a closed tab; the dependencies are injected so the
// same logic can move without rewriting it.
import type { AgentRoomMessage } from '../agent-room';
import { resolveAgentHandoffs, roomHistory, teamRequest } from '../agent-room';
import type { AgentRow, RunState } from '../agents';

export const MAX_HANDOFFS = 3;
export const RESULT_POLLS = 72;
export const RESULT_POLL_MS = 2500;

type History = { role: 'user' | 'assistant'; content: string }[];

export type TeamDependencies = {
  run: (agentId: string, input: string, history: History, replyToMessageId: string) =>
    Promise<{ runId: string; output?: string; status?: string }>;
  result: (runId: string) => Promise<{ status: RunState; output: string }>;
  messages: () => Promise<AgentRoomMessage[]>;
  sleep?: (ms: number) => Promise<void>;
};

export type TeamTurn = {
  text: string;
  lang: 'ar' | 'en';
  agents: readonly Pick<AgentRow, 'id' | 'enabled'>[];
  targets: readonly string[];
  userMessageId: string;
};

export type TeamFailure = { agentId: string; cause: unknown };

export async function runTeamTurn(
  turn: TeamTurn,
  deps: TeamDependencies,
  onMessages: (messages: AgentRoomMessage[]) => void = () => {},
): Promise<{ answered: string[]; failures: TeamFailure[] }> {
  const sleep = deps.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const queue = turn.targets.map(id => ({ id, replyTo: turn.userMessageId }));
  const processed = new Set<string>();
  const answered: string[] = [];
  const failures: TeamFailure[] = [];
  let handoffs = 0;

  while (queue.length) {
    const item = queue.shift()!;
    if (processed.has(item.id)) continue;
    processed.add(item.id);
    try {
      const history = roomHistory(await deps.messages(), turn.lang);
      const started = await deps.run(item.id, teamRequest(item.id, turn.text, turn.lang), history, item.replyTo);
      let output = started.output || '';
      if (started.status === 'queued' || started.status === 'running') {
        output = await waitForOutput(started.runId, deps.result, sleep);
      }
      const updated = await deps.messages();
      onMessages(updated);
      answered.push(item.id);
      const reply = updated.find(message => message.run_id === started.runId);
      for (const next of resolveAgentHandoffs(output, turn.agents)) {
        if (handoffs >= MAX_HANDOFFS) break;
        if (processed.has(next) || queue.some(queued => queued.id === next)) continue;
        queue.push({ id: next, replyTo: reply?.id || turn.userMessageId });
        handoffs += 1;
      }
    } catch (cause) {
      failures.push({ agentId: item.id, cause });
    }
  }
  return { answered, failures };
}

async function waitForOutput(
  runId: string,
  result: TeamDependencies['result'],
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  for (let attempt = 0; attempt < RESULT_POLLS; attempt += 1) {
    const current = await result(runId);
    if (current.status === 'succeeded') return current.output || '';
    if (current.status === 'failed' || current.status === 'cancelled') throw new Error(`agent_run_${current.status}`);
    await sleep(RESULT_POLL_MS);
  }
  throw new Error('agent_team_timeout');
}

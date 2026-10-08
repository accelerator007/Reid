// Composer mentions: detect the "@partial" being typed, suggest agents, insert
// the chosen one, and split a reply into text and handoff markers.
import { agentNames } from '../agent-room';
import type { AgentRow } from '../agents';

export function mentionQuery(input: string): string | null {
  const match = input.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
  return match ? match[1].toLocaleLowerCase() : null;
}

export function mentionCandidates(agents: readonly Pick<AgentRow, 'id' | 'name' | 'enabled'>[], term: string, lang: 'ar' | 'en') {
  return agents
    .filter(agent => agent.enabled)
    .filter(agent => agent.id.includes(term) || (agentNames[agent.id]?.[lang] || agent.name).toLocaleLowerCase().includes(term))
    .slice(0, 6);
}

export function insertMention(input: string, agentId: string): string {
  return input.replace(/@([\p{L}\p{N}_-]*)$/u, `@${agentId} `);
}

export function appendMention(input: string, agentId: string): string {
  return `${input}${input && !/\s$/.test(input) ? ' ' : ''}@${agentId} `;
}

export type BodyPart = { kind: 'text'; text: string } | { kind: 'handoff'; agentId: string };

/** Split an agent reply into plain text and [HANDOFF:@agent] markers. */
export function splitHandoffs(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const match of body.matchAll(/\[HANDOFF:\s*@([\p{L}\p{N}_-]+)\]/giu)) {
    const before = body.slice(last, match.index).trim();
    if (before) parts.push({ kind: 'text', text: before });
    parts.push({ kind: 'handoff', agentId: match[1].toLocaleLowerCase() });
    last = (match.index ?? 0) + match[0].length;
  }
  const rest = body.slice(last).trim();
  if (rest) parts.push({ kind: 'text', text: rest });
  return parts;
}

/** "اليوم" / "أمس" / a date, for the separators between days. */
export function dayLabel(iso: string, now: Date, lang: 'ar' | 'en'): string {
  const day = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(value);
  const target = day(new Date(iso));
  if (target === day(now)) return lang === 'ar' ? 'اليوم' : 'Today';
  if (target === day(new Date(now.getTime() - 86_400_000))) return lang === 'ar' ? 'أمس' : 'Yesterday';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Muscat',
  }).format(new Date(iso));
}

/** Paragraph direction by majority script, ignoring @mentions and markers.
 *  dir="auto" looks only at the first strong letter, so "@operations لخص…"
 *  was laid out left-to-right. */
export function textDirection(text: string): 'rtl' | 'ltr' {
  const words = text.replace(/@[\p{L}\p{N}_-]+|\[HANDOFF:[^\]]*\]/gu, ' ').split(/\s+/).filter(Boolean);
  const arabic = words.filter(word => /[\u0600-\u06FF]/.test(word)).length;
  const latin = words.filter(word => /[A-Za-z]/.test(word) && !/[\u0600-\u06FF]/.test(word)).length;
  return arabic >= latin ? 'rtl' : 'ltr';
}

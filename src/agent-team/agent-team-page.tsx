// The agent team room: one private conversation where the Owner assigns work
// to specialists with @mentions and follows how they hand parts to each other.
import React from 'react';
import {
  ArrowLeftRight, AtSign, BookOpen, ChartColumn, Compass, Handshake, Headset, LoaderCircle, Megaphone, PenLine,
  Radar, Search, Send, ShieldCheck, Sparkles, UserRound, UsersRound, Workflow, X,
} from 'lucide-react';
import { agentNames, resolveAgentMentions, type AgentRoomMessage } from '../agent-room';
import type { AgentRow } from '../agents';
import { Badge, IconButton, type Tone } from '../ui';
import { appendMention, dayLabel, insertMention, mentionCandidates, mentionQuery, splitHandoffs, textDirection } from './mentions';
import { useAgentTeam } from './use-agent-team';
import './agent-team.css';

type Lang = 'ar' | 'en';
const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

// Each specialist keeps one icon and one colour everywhere it appears.
const identity: Record<string, { icon: React.ReactNode; tone: Tone; role: { ar: string; en: string } }> = {
  ceo: { icon: <Compass />, tone: 'brand', role: { ar: 'ينسّق الفريق ويوزّع العمل', en: 'Coordinates the team' } },
  operations: { icon: <Workflow />, tone: 'info', role: { ar: 'المشاريع والمهام والعوائق', en: 'Projects, tasks, blockers' } },
  analytics: { icon: <ChartColumn />, tone: 'info', role: { ar: 'المؤشرات والتقارير', en: 'Metrics and reports' } },
  knowledge: { icon: <BookOpen />, tone: 'brand', role: { ar: 'وثائق الشركة ومعرفتها', en: 'Company knowledge' } },
  marketing: { icon: <Megaphone />, tone: 'accent', role: { ar: 'الحملات والنمو', en: 'Campaigns and growth' } },
  content: { icon: <PenLine />, tone: 'accent', role: { ar: 'كتابة المحتوى', en: 'Content writing' } },
  competitor: { icon: <Radar />, tone: 'accent', role: { ar: 'رصد السوق والمنافسين', en: 'Market watch' } },
  sales: { icon: <Handshake />, tone: 'success', role: { ar: 'العملاء والمتابعات', en: 'Clients and follow-ups' } },
  support: { icon: <Headset />, tone: 'success', role: { ar: 'دعم العملاء', en: 'Customer support' } },
  hr: { icon: <UsersRound />, tone: 'warning', role: { ar: 'الموظفون والتوظيف', en: 'People and hiring' } },
};
const who = (id: string | null | undefined) => identity[id || ''] ?? { icon: <Sparkles />, tone: 'neutral' as Tone, role: { ar: '', en: '' } };
const nameOf = (id: string | null | undefined, lang: Lang) => agentNames[id || '']?.[lang] || id || tr(lang, 'النظام', 'System');

const inProgress = (state: AgentRoomMessage['state']) => state === 'queued' || state === 'running' || state === 'pending_approval';

export function AgentTeamRoom({ lang }: { lang: Lang }) {
  const team = useAgentTeam(lang);
  const [query, setQuery] = React.useState('');
  const [sender, setSender] = React.useState('all');
  const listRef = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState(() => new URLSearchParams(location.search).get('q') || '');

  React.useEffect(() => {
    const follow = () => { const q = new URLSearchParams(location.search).get('q'); if (q) setDraft(q); };
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const visible = team.messages.filter(message =>
    (sender === 'all' || message.sender_agent_id === sender || (sender === 'owner' && message.sender_kind === 'user'))
    && (!query.trim() || message.body.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));

  // Keep the newest message in view, but only when the reader is already near
  // the bottom: scrolling back through history must not be interrupted.
  const opened = React.useRef(false);
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || team.loading) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    // The first render of a loaded room always opens on the latest message.
    if (!opened.current || nearBottom || team.busy) list.scrollTop = list.scrollHeight;
    opened.current = true;
  }, [team.loading, team.messages, team.busy, visible.length]);

  const ready = team.agents.filter(agent => agent.enabled && agent.status !== 'paused');
  const working = team.messages.filter(message => inProgress(message.state)).length;
  const review = team.messages.filter(message => message.state === 'failed' || message.state === 'pending_approval').length;
  const healthBadge = {
    online: { tone: 'success' as Tone, text: tr(lang, 'الذكاء المحلي متصل', 'Local AI online') },
    degraded: { tone: 'warning' as Tone, text: tr(lang, 'الذكاء المحلي بخلل', 'Local AI degraded') },
    offline: { tone: 'danger' as Tone, text: tr(lang, 'الذكاء المحلي غير متصل', 'Local AI offline') },
    unknown: { tone: 'neutral' as Tone, text: tr(lang, 'حالة الذكاء غير معروفة', 'AI status unknown') },
  }[team.health];

  return (
    <main className="team">
      <div className="team-head">
        <div>
          <h1>{tr(lang, 'فريق الوكلاء', 'Agent team')}</h1>
          <p>{tr(lang, 'كلّف مختصًا بـ @، أو اجمع أكثر من وكيل، وتابع كيف يسلّمون العمل لبعض.', 'Assign a specialist with @, bring several together, and follow each handoff.')}</p>
        </div>
        <div className="team-head__badges">
          <Badge tone="brand" dot>{tr(lang, `${ready.length} جاهز للعمل`, `${ready.length} ready`)}</Badge>
          <Badge tone={healthBadge.tone} dot>{healthBadge.text}</Badge>
        </div>
      </div>

      <div className="team-body">
        <section className="team-chat" aria-label={tr(lang, 'محادثة الفريق', 'Team conversation')}>
          <div className="team-chat__bar">
            <label className="team-search">
              <Search aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث في المحادثة…', 'Search the conversation…')} aria-label={tr(lang, 'بحث', 'Search')} />
              {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح البحث', 'Clear search')}><X /></button>}
            </label>
            <select className="team-filter" value={sender} onChange={event => setSender(event.target.value)} aria-label={tr(lang, 'تصفية حسب المرسل', 'Filter by sender')}>
              <option value="all">{tr(lang, 'كل الرسائل', 'All messages')}</option>
              <option value="owner">{tr(lang, 'رسائلي', 'My messages')}</option>
              {team.agents.map(agent => <option key={agent.id} value={agent.id}>{nameOf(agent.id, lang)}</option>)}
            </select>
          </div>

          <div className="team-chat__messages" ref={listRef} aria-live="polite" aria-busy={team.loading}>
            {team.loading && <div className="team-loading"><LoaderCircle aria-hidden="true" />{tr(lang, 'نفتح غرفة الفريق…', 'Opening the team room…')}</div>}
            {!team.loading && !team.messages.length && <Welcome lang={lang} choose={text => setDraft(text)} />}
            {!team.loading && team.messages.length > 0 && !visible.length && (
              <p className="team-nomatch">{tr(lang, 'لا توجد رسائل مطابقة. غيّر البحث أو اعرض كل الرسائل.', 'No matching messages. Change the search or show all.')}</p>
            )}
            <MessageList lang={lang} messages={visible} all={team.messages} />
          </div>

          {team.error && (
            <div className="team-error" role="alert">
              <span>{team.error}</span>
              <IconButton label={tr(lang, 'إغلاق', 'Dismiss')} icon={<X />} onClick={team.dismissError} />
            </div>
          )}
          <Composer lang={lang} agents={team.agents} busy={team.busy} disabled={team.loading} draft={draft} setDraft={setDraft} send={team.send} />
        </section>

        <aside className="team-roster" aria-label={tr(lang, 'المختصون', 'Specialists')}>
          <div className="team-roster__head">
            <h2>{tr(lang, 'المختصون', 'Specialists')}</h2>
            <span>{tr(lang, 'اضغط لذكره في رسالتك', 'Tap to mention')}</span>
          </div>
          <div className="team-roster__list">
            {team.agents.map(agent => {
              const state = !agent.enabled ? 'blocked' : agent.status === 'paused' ? 'paused' : 'ready';
              return (
                <button type="button" key={agent.id} className="team-agent" data-state={state} disabled={state !== 'ready'}
                  onClick={() => setDraft(value => appendMention(value, agent.id))}>
                  <span className={`team-avatar ui-tone--${who(agent.id).tone}`} aria-hidden="true">{who(agent.id).icon}</span>
                  <span className="team-agent__text">
                    <strong>{nameOf(agent.id, lang)}</strong>
                    <small>{who(agent.id).role[lang] || `@${agent.id}`}</small>
                  </span>
                  <i aria-label={state === 'ready' ? tr(lang, 'جاهز', 'Ready') : state === 'paused' ? tr(lang, 'موقوف مؤقتًا', 'Paused') : tr(lang, 'متوقف', 'Blocked')} />
                </button>
              );
            })}
          </div>
          <dl className="team-stats">
            <div><dt>{tr(lang, 'الرسائل', 'Messages')}</dt><dd>{team.messages.length}</dd></div>
            <div><dt>{tr(lang, 'قيد العمل', 'Working')}</dt><dd>{working}</dd></div>
            <div><dt>{tr(lang, 'تحتاج مراجعة', 'Review')}</dt><dd>{review}</dd></div>
          </dl>
          <p className="team-note"><ShieldCheck aria-hidden="true" />
            {tr(lang, 'كل رد مرتبط بتشغيل حقيقي، والإجراءات الحساسة لا تُنفّذ دون موافقتك.', 'Every reply is tied to a real run; sensitive actions wait for your approval.')}
          </p>
        </aside>
      </div>
    </main>
  );
}

function Welcome({ lang, choose }: { lang: Lang; choose: (text: string) => void }) {
  const ideas = [
    tr(lang, '@operations راجع حالة المشاريع وحدد العوائق', '@operations review project status and blockers'),
    tr(lang, '@marketing @content جهّزوا خطة محتوى الأسبوع', '@marketing @content prepare this week’s content plan'),
    tr(lang, '@ceo وزّع أولويات اليوم على الفريق', '@ceo set today’s priorities for the team'),
  ];
  return (
    <div className="team-welcome">
      <span className="team-welcome__mark" aria-hidden="true"><Sparkles /></span>
      <h2>{tr(lang, 'ابدأ اجتماع الفريق', 'Start the team meeting')}</h2>
      <p>{tr(lang, 'اذكر مختصًا بـ @، أو اكتب مباشرة وسيستلمها المدير المنسّق.', 'Mention a specialist with @, or just write and the orchestrator takes it.')}</p>
      <div className="team-welcome__ideas">
        {ideas.map(idea => <button type="button" key={idea} onClick={() => choose(idea)}>{idea}</button>)}
      </div>
    </div>
  );
}

function MessageList({ lang, messages, all }: { lang: Lang; messages: AgentRoomMessage[]; all: AgentRoomMessage[] }) {
  const now = new Date();
  let lastDay = '';
  return (
    <>
      {messages.map(message => {
        const day = dayLabel(message.created_at, now, lang);
        const separator = day !== lastDay ? <div className="team-day" role="separator"><span>{day}</span></div> : null;
        lastDay = day;
        return (
          <React.Fragment key={message.id}>
            {separator}
            <Message lang={lang} message={message} parent={message.reply_to ? all.find(candidate => candidate.id === message.reply_to) : undefined} />
          </React.Fragment>
        );
      })}
    </>
  );
}

function Message({ lang, message, parent }: { lang: Lang; message: AgentRoomMessage; parent?: AgentRoomMessage }) {
  const mine = message.sender_kind === 'user';
  const time = new Date(message.created_at).toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });
  const progress = {
    pending_approval: tr(lang, 'ينتظر موافقتك', 'Waiting for your approval'),
    queued: tr(lang, 'في الطابور', 'Queued'),
    running: tr(lang, 'يعمل على المهمة', 'Working on it'),
  } as Record<string, string>;
  return (
    <article className="team-msg" data-mine={mine} data-state={message.state}>
      <span className={`team-avatar ${mine ? 'team-avatar--me' : `ui-tone--${who(message.sender_agent_id).tone}`}`} aria-hidden="true">
        {mine ? <UserRound /> : who(message.sender_agent_id).icon}
      </span>
      <div className="team-msg__bubble">
        <div className="team-msg__meta">
          <strong>{mine ? tr(lang, 'أنت', 'You') : nameOf(message.sender_agent_id, lang)}</strong>
          {!mine && message.sender_agent_id && <span>@{message.sender_agent_id}</span>}
          <time dateTime={message.created_at}>{time}</time>
        </div>
        {parent && (
          <div className="team-msg__reply">
            {parent.sender_kind === 'user' ? tr(lang, 'ردًا على رسالتك', 'Replying to you') : tr(lang, `ردًا على ${nameOf(parent.sender_agent_id, lang)}`, `Replying to ${nameOf(parent.sender_agent_id, lang)}`)}
          </div>
        )}
        {inProgress(message.state) ? (
          <div className="team-msg__progress"><span className="team-dots" aria-hidden="true"><i /><i /><i /></span>{progress[message.state]}</div>
        ) : message.state === 'failed' ? (
          <div className="team-msg__failed">{tr(lang, 'تعذّر تنفيذ المهمة.', 'The task failed.')}{message.error ? ` (${message.error.slice(0, 120)})` : ''}</div>
        ) : message.state === 'cancelled' ? (
          <div className="team-msg__failed">{tr(lang, 'أُلغيت المهمة.', 'Task cancelled.')}</div>
        ) : (
          <div className="team-msg__body" dir={textDirection(message.body)}>
            {splitHandoffs(message.body).map((part, index) => part.kind === 'text'
              ? <p key={index}>{withMentions(part.text)}</p>
              : <span key={index} className="team-handoff"><ArrowLeftRight aria-hidden="true" />{tr(lang, `سلّم جزءًا إلى ${nameOf(part.agentId, lang)}`, `Handed a part to ${nameOf(part.agentId, lang)}`)}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}

// "@ceo" inside Arabic text renders as "ceo@" unless it is isolated as a
// left-to-right unit; <bdi> does that and lets the token be styled.
function withMentions(text: string): React.ReactNode[] {
  return text.split(/(@[\p{L}\p{N}_-]+)/u).map((piece, index) =>
    index % 2 ? <bdi key={index} dir="ltr" className="team-token">{piece}</bdi> : piece);
}

function Composer({ lang, agents, busy, disabled, draft, setDraft, send }: {
  lang: Lang; agents: AgentRow[]; busy: boolean; disabled: boolean;
  draft: string; setDraft: React.Dispatch<React.SetStateAction<string>>; send: (text: string) => Promise<boolean>;
}) {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const term = mentionQuery(draft);
  const candidates = term !== null && !dismissed ? mentionCandidates(agents, term, lang) : [];
  const targets = resolveAgentMentions(draft, agents, false);
  const menuId = React.useId();

  React.useEffect(() => { setActive(0); setDismissed(false); }, [term]);
  React.useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 200)}px`;
  }, [draft]);

  const choose = (id: string) => { setDraft(value => insertMention(value, id)); areaRef.current?.focus(); };
  const submit = async () => {
    if (!draft.trim() || busy) return;
    const text = draft;
    setDraft('');
    const ok = await send(text);
    if (!ok) setDraft(text);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % candidates.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index - 1 + candidates.length) % candidates.length); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(candidates[active].id); return; }
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
  };

  return (
    <form className="team-composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="team-composer__targets">
        {targets.length
          ? targets.map(id => <span key={id} className={`team-target ui-tone--${who(id).tone}`}>{who(id).icon}{nameOf(id, lang)}</span>)
          : <small>{tr(lang, 'بدون منشن تذهب الرسالة إلى المدير المنسّق', 'Without a mention the orchestrator receives it')}</small>}
      </div>
      <div className="team-composer__row">
        {candidates.length > 0 && (
          <div className="team-mentions" id={menuId} role="listbox" aria-label={tr(lang, 'اختر مختصًا', 'Choose a specialist')}>
            {candidates.map((agent, index) => (
              <div key={agent.id} role="option" aria-selected={index === active} className="team-mention"
                onMouseEnter={() => setActive(index)} onMouseDown={event => { event.preventDefault(); choose(agent.id); }}>
                <span className={`team-avatar team-avatar--sm ui-tone--${who(agent.id).tone}`} aria-hidden="true">{who(agent.id).icon}</span>
                <strong>{nameOf(agent.id, lang)}</strong><small>@{agent.id}</small>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="team-at" onClick={() => { setDraft(value => `${value}${value && !/\s$/.test(value) ? ' ' : ''}@`); areaRef.current?.focus(); }}
          aria-label={tr(lang, 'اذكر مختصًا', 'Mention a specialist')} title={tr(lang, 'اذكر مختصًا', 'Mention a specialist')}>
          <AtSign />
        </button>
        <textarea
          ref={areaRef} rows={1} maxLength={8000} value={draft} disabled={disabled}
          autoFocus={new URLSearchParams(location.search).get('focus') === 'compose'}
          onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown}
          placeholder={tr(lang, 'اكتب المهمة، واستخدم @ لاختيار المختص…', 'Describe the work; use @ to pick a specialist…')}
          aria-label={tr(lang, 'رسالتك لفريق الوكلاء', 'Message the agent team')}
          role="combobox" aria-expanded={candidates.length > 0} aria-controls={menuId} aria-autocomplete="list"
        />
        <button type="submit" className="team-send" disabled={busy || disabled || !draft.trim()} aria-label={tr(lang, 'إرسال', 'Send')}>
          {busy ? <LoaderCircle className="team-spin" /> : <Send />}
        </button>
      </div>
      <small className="team-composer__hint">
        {busy ? tr(lang, 'الفريق يعمل على طلبك…', 'The team is working on it…') : tr(lang, 'Enter للإرسال · Shift+Enter لسطر جديد', 'Enter to send · Shift+Enter for a new line')}
      </small>
    </form>
  );
}

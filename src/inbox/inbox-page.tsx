// /inbox — the company's WhatsApp conversations: a searchable list, the thread
// with what the assistant remembers about the person, and a composer. A reply
// from here pauses the assistant for that chat until it is handed back.
// Owner only; the service on the Reid host enforces it.
import React from 'react';
import {
  ArrowLeft, ArrowRight, Bot, ChevronDown, FileText, Image as ImageIcon, LoaderCircle, MessageCircle, Mic, QrCode, Search, Send,
  Settings2, UserRound, UsersRound, Wifi, X,
} from 'lucide-react';
import { localError } from '../local-api';
import type { Page } from '../routes';
import { Badge, Button, EmptyState, InlineAlert, PageHeader, Skeleton } from '../ui';
import * as api from './api';
import { WhatsappControl } from './control-panel';
import {
  MESSAGE_LIMIT, avatarLetter, chatName, clock, connectionLabel, connectionStates, contactKindLabel, deliveryLabel, filterChats, formatPhone,
  groupByDay, isGroup, listStamp, moodLabel, moodTones, pendingOutbox, phoneOf,
  type Chat, type ChatFilter, type ChatMessage, type Connection, type Lang, type OutboxItem,
} from './model';
import './inbox.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const chatFromUrl = () => new URLSearchParams(location.search).get('chat');
const viewFromUrl = () => new URLSearchParams(location.search).get('view') === 'control' ? 'control' : 'chats';

/** Runs fn now and every `ms` while the tab is visible; catches up when it returns. */
function usePoll(fn: () => Promise<void>, ms: number, enabled = true) {
  const saved = React.useRef(fn);
  saved.current = fn;
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => { if (alive && document.visibilityState === 'visible') void saved.current(); };
    tick();
    const timer = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [ms, enabled]);
}

export function Inbox({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const [status, setStatus] = React.useState<Connection | null>(null);
  const [chats, setChats] = React.useState<Chat[] | null>(null);
  const [outbox, setOutbox] = React.useState<OutboxItem[]>([]);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(chatFromUrl);
  const [view,setView]=React.useState<'chats'|'control'>(viewFromUrl);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<ChatFilter>('all');
  const [now, setNow] = React.useState(() => new Date());

  const refresh = React.useCallback(async () => {
    try {
      const [state, rows, queue] = await Promise.all([api.loadStatus(), api.loadChats(), api.loadOutbox()]);
      setStatus(state); setChats(rows); setOutbox(queue); setError(''); setNow(new Date());
    } catch (thrown) { setError(localError(thrown, lang)); }
  }, [lang]);
  usePoll(refresh, 5000);
  React.useEffect(() => {
    const follow = () => {setSelected(chatFromUrl());setView(viewFromUrl());};
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const open = (id: string) => { history.pushState({}, '', `/inbox?chat=${id}`); setSelected(id); };
  const close = () => { history.pushState({}, '', '/inbox'); setSelected(null); };
  const show=(next:'chats'|'control')=>{history.pushState({},'',next==='control'?'/inbox?view=control':'/inbox');setSelected(null);setView(next);};
  const active = chats?.find(chat => chat.id === selected) ?? null;
  const connected = status?.connection === 'connected';
  const shown = chats ? filterChats(chats, query, filter) : [];
  const counts = { all: chats?.length ?? 0, assistant: chats?.filter(chat => chat.bot_mode === 'active').length ?? 0, team: chats?.filter(chat => chat.bot_mode === 'human').length ?? 0 };

  return (
    <main className={`inbox${view==='control'?' inbox--control':''}`} data-thread={view==='chats'&&!!active}>
      <PageHeader
        title={view==='control'?tr(lang,'تحكم واتساب وريد','WhatsApp & Reid control'):tr(lang, 'محادثات واتساب', 'WhatsApp inbox')}
        description={view==='control'?tr(lang,'شغّل الوكيل واضبط سلوكه وراقب الرسائل والخدمات من مكان واحد.','Run the agent, tune its behavior, and monitor messages and services in one place.'):tr(lang, 'رسائل رقم الشركة. رد بنفسك أو خلّ المساعد يرد، محادثة محادثة.', 'Messages to the company number. Reply yourself or let the assistant answer, chat by chat.')}
        actions={<>
          {status && <Badge tone={connectionStates[status.connection]?.tone ?? 'danger'} dot>{connectionLabel(status.connection, lang)}{status.number ? <> · <bdi dir="ltr">{formatPhone(status.number)}</bdi></> : null}</Badge>}
          <Button variant={view==='chats'?'primary':'secondary'} icon={<MessageCircle/>} onClick={()=>show('chats')}>{tr(lang,'المحادثات','Chats')}</Button>
          <Button variant={view==='control'?'primary':'secondary'} icon={<Settings2/>} onClick={()=>show('control')}>{tr(lang,'مركز التحكم','Control center')}</Button>
          <Button icon={<Wifi />} onClick={() => go('connections')}>{tr(lang, 'إدارة الاتصال', 'Connection')}</Button>
        </>}
      />
      {error && <InlineAlert action={<Button size="sm" onClick={() => void refresh()}>{tr(lang, 'أعد المحاولة', 'Try again')}</Button>}>{error}</InlineAlert>}
      {status && !connected && (
        <InlineAlert tone="warning" action={<Button size="sm" icon={<QrCode />} onClick={() => go('connections')}>{tr(lang, 'ربط الهاتف', 'Link the phone')}</Button>}>
          {tr(lang, 'رقم ريّد غير مرتبط الآن، فلا تصل رسائل جديدة ولا يمكن الإرسال.', 'The Reid number is not linked, so no new messages arrive and nothing can be sent.')}
        </InlineAlert>
      )}

      {view==='control'?<WhatsappControl lang={lang} go={go} status={status} chats={chats||[]} outbox={outbox} onChanged={refresh}/>:<div className="inbox-layout">
        <aside className="inbox-list" aria-label={tr(lang, 'المحادثات', 'Conversations')}>
          <div className="inbox-list__tools">
            <label className="inbox-search">
              <Search aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث بالاسم أو الرقم…', 'Search by name or number…')} aria-label={tr(lang, 'بحث في المحادثات', 'Search conversations')} />
              {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
            </label>
            <div className="inbox-chips" role="group" aria-label={tr(lang, 'من يرد', 'Who replies')}>
              {([['all', 'الكل', 'All'], ['assistant', 'المساعد يرد', 'Assistant'], ['team', 'الفريق يرد', 'Team']] as const).map(([id, ar, en]) => (
                <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{tr(lang, ar, en)} <span>{counts[id]}</span></button>
              ))}
            </div>
          </div>
          <div className="inbox-list__items">
            {!chats && !error && <div className="inbox-list__loading"><Skeleton lines={6} /></div>}
            {chats && shown.map(chat => (
              <button type="button" key={chat.id} className="inbox-chat" aria-current={chat.id === selected ? 'true' : undefined} onClick={() => open(chat.id)}>
                <Avatar chat={chat} />
                <span className="inbox-chat__text">
                  <span className="inbox-chat__top">
                    <strong><bdi>{chatName(chat, lang)}</bdi> <span className="inbox-contact-kind" data-kind={chat.contact_kind}>{contactKindLabel(chat.contact_kind,lang)}</span></strong>
                    <small>{listStamp(chat.updated_at, now, lang)}</small>
                  </span>
                  <span className="inbox-chat__preview">
                    {chat.bot_mode === 'active' && <Bot aria-label={tr(lang, 'المساعد يرد', 'Assistant replies')} />}
                    <span dir="auto">{chat.last_message || tr(lang, 'محادثة جديدة', 'New conversation')}</span>
                  </span>
                </span>
              </button>
            ))}
            {chats && !shown.length && (
              <EmptyState icon={<MessageCircle />}
                title={chats.length ? tr(lang, 'لا محادثة تطابق البحث', 'No conversation matches') : tr(lang, 'لا محادثات بعد', 'No conversations yet')}
                description={chats.length ? undefined : tr(lang, 'أول رسالة تصل لرقم ريّد ستظهر هنا.', 'The first message to the Reid number will appear here.')} />
            )}
          </div>
        </aside>

        <section className="inbox-thread" aria-label={active ? chatName(active, lang) : tr(lang, 'المحادثة', 'Conversation')}>
          {active
            ? <Thread key={active.id} lang={lang} chat={active} connected={connected} outbox={outbox} now={now} back={close}
                onChanged={refresh} onMode={mode => setChats(rows => rows?.map(row => (row.id === active.id ? { ...row, bot_mode: mode } : row)) ?? rows)} />
            : <EmptyState icon={<MessageCircle />} title={tr(lang, 'اختر محادثة', 'Choose a conversation')}
                description={tr(lang, 'اقرأ وتابع ورد باسم ريّد.', 'Read, follow up and reply as Reid.')} />}
        </section>
      </div>}
    </main>
  );
}

function Avatar({ chat, size = 'md' }: { chat: Chat; size?: 'md' | 'lg' }) {
  const letter = avatarLetter(chat);
  return (
    <span className={`inbox-avatar inbox-avatar--${size}`} data-group={isGroup(chat.jid)} aria-hidden="true">
      {isGroup(chat.jid) ? <UsersRound /> : letter || <UserRound />}
    </span>
  );
}

function Thread({ lang, chat, connected, outbox, now, back, onChanged, onMode }: {
  lang: Lang; chat: Chat; connected: boolean; outbox: OutboxItem[]; now: Date; back: () => void;
  onChanged: () => Promise<void>; onMode: (mode: 'active' | 'human') => void;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[] | null>(null);
  const [error, setError] = React.useState('');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState<'send' | 'mode' | null>(null);
  const [memoryOpen, setMemoryOpen] = React.useState(false);
  const requestId = React.useRef(crypto.randomUUID());
  const scroller = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);
  const area = React.useRef<HTMLTextAreaElement>(null);

  const load = React.useCallback(async () => {
    try { setMessages(await api.loadMessages(chat.id)); setError(''); }
    catch (thrown) { setError(localError(thrown, lang)); }
  }, [chat.id, lang]);
  usePoll(load, 3000);

  // Follow new messages only while the reader is already at the bottom.
  React.useLayoutEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const node = scroller.current;
    if (node) stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  };
  // The composer grows with its text up to a few lines.
  React.useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [text]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !connected) return;
    setBusy('send'); setError('');
    try {
      await api.sendMessage(chat.id, body, requestId.current);
      setText(''); requestId.current = crypto.randomUUID(); stick.current = true;
      onMode('human');
      await Promise.all([onChanged(), load()]);
    } catch (thrown) { setError(localError(thrown, lang)); }
    finally { setBusy(null); area.current?.focus(); }
  };
  const toggle = async () => {
    const mode = chat.bot_mode === 'active' ? 'human' : 'active';
    setBusy('mode'); setError('');
    try { await api.setMode(chat.id, mode); onMode(mode); await onChanged(); }
    catch (thrown) { setError(localError(thrown, lang)); }
    finally { setBusy(null); }
  };
  const { waiting, unconfirmed } = pendingOutbox(outbox, chat.id);
  const phone = formatPhone(phoneOf(chat.jid));
  const assistant = chat.bot_mode === 'active';

  return (
    <>
      <div className="thread-head">
        <button type="button" className="thread-head__back" onClick={back} aria-label={tr(lang, 'كل المحادثات', 'All conversations')}>
          {lang === 'ar' ? <ArrowRight /> : <ArrowLeft />}
        </button>
        <Avatar chat={chat} />
        <div className="thread-head__who">
          <strong><bdi>{chatName(chat, lang)}</bdi></strong>
          <small>
            {isGroup(chat.jid) ? tr(lang, 'مجموعة · يرد المساعد عند ذكر «ريد» فقط', 'Group · the assistant replies only when addressed') : <bdi dir="ltr">{phone}</bdi>}
          </small>
        </div>
        <Badge tone={chat.contact_kind==='internal'?'success':chat.contact_kind==='group'?'info':'neutral'}>{contactKindLabel(chat.contact_kind,lang)}</Badge>
        <Badge tone={assistant ? 'brand' : 'neutral'} dot>{assistant ? tr(lang, 'المساعد يرد', 'Assistant replies') : tr(lang, 'الفريق يرد', 'Team replies')}</Badge>
        <Button size="sm" variant={assistant ? 'secondary' : 'primary'} icon={assistant ? <UserRound /> : <Bot />} busy={busy === 'mode'} disabled={!!busy} onClick={() => void toggle()}>
          {assistant ? tr(lang, 'استلم المحادثة', 'Take over') : tr(lang, 'خلّ المساعد يرد', 'Hand to assistant')}
        </Button>
      </div>

      {chat.summary && (
        <div className="thread-memory" data-open={memoryOpen}>
          <button type="button" onClick={() => setMemoryOpen(value => !value)} aria-expanded={memoryOpen}>
            <Bot aria-hidden="true" />
            <span>{tr(lang, 'ما يعرفه المساعد عن هذه المحادثة', 'What the assistant knows about this chat')}</span>
            {chat.mood && <Badge tone={moodTones[chat.mood] ?? 'neutral'}>{moodLabel(chat.mood, lang)}</Badge>}
            <ChevronDown aria-hidden="true" className="thread-memory__chevron" />
          </button>
          {memoryOpen && <p dir="auto">{chat.summary}</p>}
        </div>
      )}

      <div className="thread-messages" ref={scroller} onScroll={onScroll} aria-live="polite">
        {!messages && !error && <div className="thread-messages__loading"><LoaderCircle className="thread-spin" aria-hidden="true" />{tr(lang, 'جارٍ تحميل الرسائل…', 'Loading messages…')}</div>}
        {messages && !messages.length && <p className="thread-messages__empty">{tr(lang, 'لا رسائل في هذه المحادثة بعد.', 'No messages in this chat yet.')}</p>}
        {messages && groupByDay(messages, now, lang).map(group => (
          <div className="thread-day" key={group.key}>
            <span className="thread-day__label">{group.label}</span>
            {group.items.map(message => <Bubble key={message.id} lang={lang} message={message} group={isGroup(chat.jid)} />)}
          </div>
        ))}
      </div>

      {(waiting.length > 0 || unconfirmed.length > 0 || error) && (
        <div className="thread-notices">
          {error && <InlineAlert>{error}</InlineAlert>}
          {waiting.length > 0 && <InlineAlert tone="info">{tr(lang, 'رسالة بانتظار تأكيد الإرسال من الهاتف…', 'A message is waiting for the phone to confirm it was sent…')}</InlineAlert>}
          {unconfirmed.length > 0 && <InlineAlert tone="warning">{tr(lang, 'تعذّر تأكيد إرسال رسالة. تحقق من الهاتف قبل إعادة إرسالها حتى لا تتكرر.', 'A delivery could not be confirmed. Check the phone before resending so it is not sent twice.')}</InlineAlert>}
        </div>
      )}

      <form className="thread-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea ref={area} rows={1} value={text} maxLength={MESSAGE_LIMIT} disabled={!connected}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
          placeholder={connected ? tr(lang, 'اكتب ردًا باسم ريّد…', 'Reply as Reid…') : tr(lang, 'اربط الهاتف أولًا للإرسال', 'Link the phone to send')}
          aria-label={tr(lang, 'نص الرسالة', 'Message')} dir="auto" />
        <button type="submit" className="thread-send" disabled={!connected || !text.trim() || busy === 'send'} aria-label={tr(lang, 'إرسال', 'Send')}>
          {busy === 'send' ? <LoaderCircle className="thread-spin" /> : <Send />}
        </button>
        <small className="thread-composer__hint">
          {assistant
            ? tr(lang, 'ردّك يوقف المساعد في هذه المحادثة حتى تعيده.', 'Your reply pauses the assistant in this chat until you hand it back.')
            : tr(lang, 'Enter للإرسال · Shift+Enter لسطر جديد', 'Enter to send · Shift+Enter for a new line')}
          {text.length > MESSAGE_LIMIT - 500 && <span dir="ltr"> · {text.length}/{MESSAGE_LIMIT}</span>}
        </small>
      </form>
    </>
  );
}

function Bubble({ lang, message, group }: { lang: Lang; message: ChatMessage; group: boolean }) {
  const outbound = message.direction === 'outbound';
  return (
    <article className="bubble" data-direction={message.direction}>
      {group && !outbound && (message.sender_name || message.sender_phone) && <span className="bubble__sender">
        <bdi dir="auto">{message.sender_name || formatPhone(message.sender_phone || null)}</bdi>
        {message.sender_name && message.sender_phone ? <small dir="ltr">{formatPhone(message.sender_phone)}</small> : null}
      </span>}
      {message.media_kind && (
        <span className="bubble__media">
          {message.media_kind === 'audio' ? <Mic aria-hidden="true" /> : message.media_kind === 'document' ? <FileText aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
          {message.media_kind === 'audio'
            ? tr(lang, 'رسالة صوتية، مفرّغة نصًا', 'Voice note, transcribed')
            : message.media_kind === 'document'
              ? tr(lang, 'ملف، تمت قراءة محتواه', 'Document, content extracted')
              : tr(lang, 'صورة، موصوفة نصًا', 'Photo, described')}
        </span>
      )}
      <p dir="auto">{message.body}</p>
      <small>
        {clock(message.created_at, lang)}
        {outbound && <> · {deliveryLabel(message.status, lang)}</>}
      </small>
    </article>
  );
}

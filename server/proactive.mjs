// The difference between an assistant and a command line is that an assistant
// occasionally speaks first. Every guard here exists so that it stays welcome:
// opt-in, quiet hours, one message a day per kind, and a row for every one.
const muscatOffset = 4 * 60 * 60_000;

export const muscatParts = (now = Date.now()) => {
  const shifted = new Date(now + muscatOffset);
  return { hour: shifted.getUTCHours(), day: shifted.toISOString().slice(0, 10) };
};

export const withinQuietHours = (now = Date.now(), { from = 21, to = 7 } = {}) => {
  const { hour } = muscatParts(now);
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
};

export const briefingDue = (briefingHour, now = Date.now()) => {
  const { hour } = muscatParts(now);
  const wanted = Number.isInteger(briefingHour) ? briefingHour : 8;
  // A brief is due from its hour until the quiet window, so a service that was
  // asleep at 08:00 still delivers it at 10:00 rather than skipping the day.
  return hour >= wanted && !withinQuietHours(now);
};

const dayName = value => new Intl.DateTimeFormat('ar-OM', { timeZone: 'Asia/Muscat', dateStyle: 'full' }).format(new Date(value));
const shortTime = value => new Intl.DateTimeFormat('ar-OM', { timeZone: 'Asia/Muscat', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function composeBrief({ name, tasks = [], workshops = [], pending = [], now = Date.now() }) {
  const today = new Date(now + muscatOffset).toISOString().slice(0, 10);
  const overdue = tasks.filter(task => task.due_at && task.due_at.slice(0, 10) < today);
  const dueToday = tasks.filter(task => task.due_at && task.due_at.slice(0, 10) === today);
  const soon = workshops.filter(workshop => workshop.start_at);
  // Nothing to say is a valid outcome. A daily message with no content is how
  // proactive assistants get muted.
  if (!overdue.length && !dueToday.length && !soon.length && !pending.length) return null;
  const lines = [`صباح الخير${name ? ` ${name}` : ''} ☀️`, dayName(now), ''];
  if (dueToday.length) lines.push(`مهام اليوم (${dueToday.length}):`, ...dueToday.slice(0, 5).map(task => `• ${task.title}`), '');
  if (overdue.length) lines.push(`متأخرة (${overdue.length}):`, ...overdue.slice(0, 5).map(task => `• ${task.title} — كان ${task.due_at.slice(0, 10)}`), '');
  if (soon.length) lines.push('ورش قريبة:', ...soon.slice(0, 3).map(workshop => `• ${workshop.title_ar} — ${shortTime(workshop.start_at)}`), '');
  if (pending.length) lines.push(`عندك ${pending.length} طلب ينتظر تأكيدك. اكتب «طلباتي» تشوفها.`);
  return lines.join('\n').trim();
}

export function staleActionNote(actions = [], now = Date.now()) {
  const stale = actions.filter(action => action.status === 'uncertain' || (action.status === 'queued' && now - Date.parse(action.updated_at || action.created_at) > 30 * 60_000));
  if (!stale.length) return null;
  const first = stale[0];
  return `طلب ${first.id.slice(0, 8)} (${first.recipient_name || 'بلا مستلم'}) ما زال بحالة ${first.status}. ما أعدته تلقائيًا عشان ما تتكرر الرسالة — تبيني أتابعه؟`;
}

export function createProactive({ admin, check, queueText, ensureConversation }) {
  async function nudge(profile, kind, body, day) {
    // The unique key is the cap. A duplicate insert means it was already said
    // today, and the message is never queued twice.
    const inserted = await admin.from('assistant_nudges').insert({ owner_id: profile.user_id, kind, subject_day: day, body }).select('id').maybeSingle();
    if (inserted.error) { if (inserted.error.code === '23505') return false; throw inserted.error; }
    const chat = await ensureConversation(profile.phone_e164, profile.full_name || `+${profile.phone_e164}`);
    await queueText(chat, body, { dedupeKey: `nudge:${inserted.data.id}` });
    return true;
  }

  return async function run(now = Date.now()) {
    if (withinQuietHours(now)) return 0;
    const { day } = muscatParts(now);
    const profiles = await check(admin.from('whatsapp_admin_profiles').select('user_id,phone_e164,briefing_hour').eq('enabled', true).eq('proactive_enabled', true).limit(25));
    let sent = 0;
    for (const profile of profiles) {
      const control = await check(admin.from('account_controls').select('status').eq('user_id', profile.user_id).maybeSingle());
      if (control?.status !== 'active') continue;
      const person = await check(admin.from('profiles').select('full_name').eq('id', profile.user_id).maybeSingle());
      const [tasks, workshops, pending, actions] = await Promise.all([
        check(admin.from('tasks').select('title,due_at,status').eq('assignee_id', profile.user_id).not('status', 'in', '("done","cancelled")').order('due_at').limit(20)),
        check(admin.from('workshops').select('title_ar,start_at').eq('status', 'published').gte('start_at', new Date(now).toISOString()).lte('start_at', new Date(now + 3 * 24 * 60 * 60_000).toISOString()).order('start_at').limit(5)),
        check(admin.from('whatsapp_actions').select('id').eq('requester_id', profile.user_id).eq('status', 'pending_confirmation').limit(10)),
        check(admin.from('whatsapp_actions').select('id,status,recipient_name,created_at,updated_at').eq('requester_id', profile.user_id).in('status', ['uncertain', 'queued']).order('created_at', { ascending: false }).limit(5)),
      ]);
      if (briefingDue(profile.briefing_hour, now)) {
        const brief = composeBrief({ name: person?.full_name, tasks, workshops, pending, now });
        if (brief && await nudge(profile, 'morning_brief', brief, day)) sent += 1;
      }
      const stale = staleActionNote(actions, now);
      if (stale && await nudge(profile, 'stale_action', stale, day)) sent += 1;
    }
    return sent;
  };
}

import { normalizeCommand } from './operations.mjs';

// A language model has no clock. Asked for the time, it reuses whatever time
// appears in its context or memory, which is how a stale "2:45" was repeated
// as the current time. Time and date questions are answered from the server
// clock instead, and every prompt states the current Muscat time.
const timeQuestion = /^(?:(?:كم|قديش|ايش|وش|شو)\s+(?:الساعة|الساعه|الوقت)|(?:الساعة|الساعه|الوقت)\s+(?:كم|الحين|الان))(?:\s+(?:الحين|الان|عندك|عندكم|في\s+عمان|بعمان|في\s+مسقط))*$|^و?\s*الحين\s+كم$|^(?:what(?:'s| is)\s+the\s+time|what\s+time\s+is\s+it)(?:\s+now)?$/u;
const dateQuestion = /^(?:(?:كم|وش|ايش|شو)\s+(?:التاريخ|تاريخ\s+اليوم)|التاريخ\s+(?:اليوم|كم)|(?:وش|ايش|شو)\s+اليوم|اليوم\s+(?:وش|ايش|كم))(?:\s+(?:الحين|الان|عندك|اليوم))*$|^(?:what(?:'s| is)\s+(?:the\s+)?(?:date|day)(?:\s+today)?|what\s+day\s+is\s+it)$/u;

export function parseClockQuestion(text) {
  const value = normalizeCommand(text);
  if (value.length > 60) return null;
  if (timeQuestion.test(value)) return 'time';
  if (dateQuestion.test(value)) return 'date';
  return null;
}

export function muscatNow(now = new Date(), lang = 'ar') {
  const locale = lang === 'ar' ? 'ar-OM' : 'en-GB';
  const time = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Muscat', hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  const date = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Muscat', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return { time, date };
}

export function clockReply(kind, now = new Date()) {
  const { time, date } = muscatNow(now);
  return kind === 'date'
    ? `اليوم ${date} 📅`
    : `الساعة الحين ${time} بتوقيت مسقط 🕒\n${date}`;
}

// One line every system prompt carries, so a model never has to guess.
export function clockContext(now = new Date()) {
  const { time, date } = muscatNow(now);
  return `الوقت الحالي الموثوق: ${date}، الساعة ${time} بتوقيت مسقط (UTC+4). استخدمه لأي سؤال عن الوقت أو التاريخ، ولا تعتمد على أوقات مذكورة في الذاكرة أو المحادثة.`;
}

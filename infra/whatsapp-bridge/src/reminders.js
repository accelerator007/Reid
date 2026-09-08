import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function asciiDigits(value) {
  return String(value).replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function muscatNow(date = new Date()) {
  return new Intl.DateTimeFormat('ar-OM', {
    timeZone: 'Asia/Muscat', dateStyle: 'full', timeStyle: 'medium', hour12: true,
  }).format(date);
}

function muscatParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function muscatDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - MUSCAT_OFFSET_MS);
}

function normalizeHour(hour, meridiem = '') {
  let value = Number(hour);
  const marker = meridiem.toLowerCase();
  if (/(م|مساء|pm)/.test(marker) && value < 12) value += 12;
  if (/(ص|صباح|am)/.test(marker) && value === 12) value = 0;
  return value;
}

function reminderBody(text) {
  return text
    .replace(/(?:^|\s)(?:يا\s+)?(?:ريد|ريّد|reid)(?=\s|$|[،,:-])/ig, ' ')
    .replace(/(?:ذكرني|ذكّرني|سوي\s+لي\s+تذكير|سوي\s+تذكير|تذكير)/ig, ' ')
    .replace(/بعد\s+[\d٠-٩]+\s*(?:دق(?:يقة|ايق)|دقائق?|ساع(?:ة|ات)|يوم|أيام)/ig, ' ')
    .replace(/(?:اليوم|بكرة|باكر|غد(?:ا|ًا)?)/ig, ' ')
    .replace(/(?:الساعة|ساعه)\s*[\d٠-٩]{1,2}(?::[\d٠-٩]{1,2})?\s*(?:صباح(?:اً|ا)?|مساء(?:ً|ا)?|ص|م|am|pm)?/ig, ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[،,:\s-]+|[،,:\s-]+$/g, '').trim() || 'التذكير المطلوب';
}

export function parseReminder(text, now = new Date()) {
  const value = asciiDigits(text);
  if (!/(ذكرني|ذكّرني|تذكير)/i.test(value)) return null;
  const relative = value.match(/بعد\s+(\d+)\s*(دق(?:يقة|ايق)|دقائق?|ساع(?:ة|ات)|يوم|أيام)/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = /دق/.test(unit) ? 60_000 : /ساع/.test(unit) ? 3_600_000 : 86_400_000;
    return { due: new Date(now.getTime() + amount * multiplier), text: reminderBody(value) };
  }

  const clock = value.match(/(?:الساعة|ساعه)\s*(\d{1,2})(?::(\d{1,2}))?\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?|ص|م|am|pm)?/i);
  if (!clock) return { missing: true };
  const current = muscatParts(now);
  let year = current.year;
  let month = current.month;
  let day = current.day;
  const explicit = value.match(/(?:يوم|بتاريخ)?\s*(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (explicit) {
    day = Number(explicit[1]); month = Number(explicit[2]);
    if (explicit[3]) year = Number(explicit[3]) < 100 ? 2000 + Number(explicit[3]) : Number(explicit[3]);
  }
  const hour = normalizeHour(clock[1], clock[3] || '');
  const minute = Number(clock[2] || 0);
  let due = muscatDate(year, month, day, hour, minute);
  if (/(بكرة|باكر|غد(?:ا|ًا)?)/i.test(value)) due = new Date(due.getTime() + 86_400_000);
  else if (!explicit && !/اليوم/i.test(value) && due <= now) due = new Date(due.getTime() + 86_400_000);
  if (hour > 23 || minute > 59 || Number.isNaN(due.getTime()) || due <= now) return { missing: true };
  return { due, text: reminderBody(value) };
}

export function formatMuscat(date) {
  return new Intl.DateTimeFormat('ar-OM', {
    timeZone: 'Asia/Muscat', dateStyle: 'full', timeStyle: 'short', hour12: true,
  }).format(new Date(date));
}

export class ReminderStore {
  constructor(path) { this.path = path; this.items = []; this.writeQueue = Promise.resolve(); }

  async load() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try { this.items = JSON.parse(await readFile(this.path, 'utf8')); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.items = [];
    }
    // A process interruption must not strand an already claimed reminder.
    for (const item of this.items) if (item.status === 'sending') item.status = 'scheduled';
    await this.save();
  }

  save() {
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.items, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    return this.writeQueue;
  }

  async create({ sender, chatId, text, due }) {
    const item = { id: randomUUID(), sender, chatId, text, dueAt: due.toISOString(), status: 'scheduled', attempts: 0, createdAt: new Date().toISOString() };
    this.items.push(item); await this.save(); return item;
  }

  async claimDue(now = new Date()) {
    const item = this.items.find((candidate) => candidate.status === 'scheduled' && new Date(candidate.dueAt) <= now);
    if (!item) return null;
    item.status = 'sending'; item.attempts += 1; await this.save(); return { ...item };
  }

  async complete(id) { const item = this.items.find((row) => row.id === id); if (item) { item.status = 'sent'; item.sentAt = new Date().toISOString(); await this.save(); } }
  async fail(id, error) {
    const item = this.items.find((row) => row.id === id);
    if (item) { item.status = item.attempts < 3 ? 'scheduled' : 'failed'; item.dueAt = item.status === 'scheduled' ? new Date(Date.now() + 5 * 60_000).toISOString() : item.dueAt; item.lastError = String(error).slice(0, 120); await this.save(); }
  }
}

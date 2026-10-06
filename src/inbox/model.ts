// WhatsApp inbox (/inbox): who a chat is with, searching, day grouping and
// what a message's delivery state means. Pure, so it is tested.
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };

export type Connection = { connection: string; qr: string | null; number: string | null; lastError: string | null };
export type Chat = {
  id: string; jid: string; display_name: string; bot_mode: 'active' | 'human'; last_message: string; updated_at: string;
  summary?: string; mood?: string; message_count?: number;
};
export type ChatMessage = {
  id: string; direction: 'inbound' | 'outbound'; body: string; status: string; created_at: string;
  media_kind?: 'audio' | 'image' | 'document' | null; sender_phone?: string | null; sender_name?: string | null; quality_score?: number | null;
};
export type OutboxItem = { id: string; conversation_id: string; status: string; origin?: 'human' | 'bot'; error: string | null; created_at: string };

export const isGroup = (jid: string) => jid.endsWith('@g.us');

/** The digits before the @ of a person's chat; groups have no phone. */
export const phoneOf = (jid: string) => (isGroup(jid) ? null : jid.split('@')[0].split(':')[0].replace(/\D/g, '') || null);

/** +968 9123 4567 for Omani numbers, +<digits> otherwise. */
export function formatPhone(digits: string | null): string {
  if (!digits) return '';
  if (digits.startsWith('968') && digits.length === 11) return `+968 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export function chatName(chat: Pick<Chat, 'display_name' | 'jid'>, lang: Lang): string {
  const name = chat.display_name.trim();
  if (name) return name;
  if (isGroup(chat.jid)) return lang === 'ar' ? 'مجموعة' : 'Group';
  return formatPhone(phoneOf(chat.jid)) || (lang === 'ar' ? 'محادثة' : 'Chat');
}

/** The first letter of the name for the avatar, or nothing to show an icon. */
export function avatarLetter(chat: Pick<Chat, 'display_name'>): string {
  const letter = Array.from(chat.display_name.trim())[0] ?? '';
  return /[\p{L}]/u.test(letter) ? letter.toLocaleUpperCase() : '';
}

const fold = (text: string) => text.toLocaleLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

export type ChatFilter = 'all' | 'assistant' | 'team';

/** Search by name, number or the last message; Arabic spelling variants match. */
export function filterChats(chats: readonly Chat[], query: string, filter: ChatFilter = 'all'): Chat[] {
  const wanted = fold(query.trim());
  const digits = query.replace(/\D/g, '');
  return chats.filter(chat => {
    if (filter === 'assistant' && chat.bot_mode !== 'active') return false;
    if (filter === 'team' && chat.bot_mode !== 'human') return false;
    if (!wanted) return true;
    if (fold(`${chat.display_name} ${chat.last_message}`).includes(wanted)) return true;
    return digits.length >= 3 && (phoneOf(chat.jid) ?? '').includes(digits);
  });
}

const muscatDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(date);

/** "اليوم", "أمس", a weekday this week, or a date — in Muscat time. */
export function dayLabel(iso: string, now: Date, lang: Lang): string {
  const day = muscatDay(new Date(iso));
  if (day === muscatDay(now)) return lang === 'ar' ? 'اليوم' : 'Today';
  if (day === muscatDay(new Date(now.getTime() - 86_400_000))) return lang === 'ar' ? 'أمس' : 'Yesterday';
  const ageDays = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  const locale = lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB';
  if (ageDays < 6) return new Date(iso).toLocaleDateString(locale, { weekday: 'long', timeZone: 'Asia/Muscat' });
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: ageDays > 300 ? 'numeric' : undefined, timeZone: 'Asia/Muscat' });
}

export const clock = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });

/** A chat list stamp: the time today, otherwise the day. */
export function listStamp(iso: string, now: Date, lang: Lang): string {
  return muscatDay(new Date(iso)) === muscatDay(now) ? clock(iso, lang) : dayLabel(iso, now, lang);
}

/** Messages in time order, cut into Muscat days. */
export function groupByDay(messages: readonly ChatMessage[], now: Date, lang: Lang): Array<{ key: string; label: string; items: ChatMessage[] }> {
  const groups: Array<{ key: string; label: string; items: ChatMessage[] }> = [];
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const message of ordered) {
    const key = muscatDay(new Date(message.created_at));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(message);
    else groups.push({ key, label: dayLabel(message.created_at, now, lang), items: [message] });
  }
  return groups;
}

export const deliveryStates: Record<string, { label: Label; tone: Tone }> = {
  received: { label: { ar: 'واردة', en: 'Received' }, tone: 'neutral' },
  sent: { label: { ar: 'أُرسلت', en: 'Sent' }, tone: 'success' },
  delivered: { label: { ar: 'وصلت', en: 'Delivered' }, tone: 'success' },
  read: { label: { ar: 'قُرئت', en: 'Read' }, tone: 'success' },
  failed: { label: { ar: 'لم تُرسل', en: 'Not sent' }, tone: 'danger' },
};

export const deliveryLabel = (status: string, lang: Lang) => deliveryStates[status]?.label[lang] ?? status;

/** Outgoing rows for this chat that have not been confirmed delivered. */
export function pendingOutbox(outbox: readonly OutboxItem[], chatId: string): { waiting: OutboxItem[]; unconfirmed: OutboxItem[] } {
  const mine = outbox.filter(item => item.conversation_id === chatId);
  return {
    waiting: mine.filter(item => ['queued', 'sending'].includes(item.status)),
    unconfirmed: mine.filter(item => ['uncertain', 'failed'].includes(item.status)),
  };
}

export const connectionStates: Record<string, { label: Label; tone: Tone }> = {
  connected: { label: { ar: 'متصل', en: 'Connected' }, tone: 'success' },
  connecting: { label: { ar: 'جارٍ الاتصال', en: 'Connecting' }, tone: 'warning' },
  qr: { label: { ar: 'بانتظار مسح الكود', en: 'Waiting for the QR scan' }, tone: 'warning' },
  disconnected: { label: { ar: 'غير متصل', en: 'Disconnected' }, tone: 'danger' },
};

export const connectionLabel = (connection: string | undefined, lang: Lang) =>
  connectionStates[connection ?? '']?.label[lang] ?? (lang === 'ar' ? 'غير متصل' : 'Disconnected');

export const moodTones: Record<string, Tone> = { 'محايد': 'neutral', 'ودّي': 'success', 'مستعجل': 'warning', 'محبط': 'danger', 'مبسوط': 'success', 'جاد': 'info' };
const moodEnglish: Record<string, string> = { 'محايد': 'Neutral', 'ودّي': 'Friendly', 'مستعجل': 'In a hurry', 'محبط': 'Frustrated', 'مبسوط': 'Pleased', 'جاد': 'Serious' };
export const moodLabel = (mood: string, lang: Lang) => (lang === 'ar' ? mood : moodEnglish[mood] ?? mood);

export const MESSAGE_LIMIT = 8000;

import { describe, expect, it } from 'vitest';
import {
  avatarLetter, chatName, dayLabel, deliveryLabel, filterChats, formatPhone, groupByDay, isGroup, listStamp, pendingOutbox, phoneOf,
  type Chat, type ChatMessage,
} from './model';

const chat = (over: Partial<Chat>): Chat => ({ id: 'c', jid: '96891234567@s.whatsapp.net', display_name: '', bot_mode: 'human', last_message: '', updated_at: '2026-09-29T08:00:00Z', ...over });
const message = (id: string, created_at: string): ChatMessage => ({ id, direction: 'inbound', body: id, status: 'received', created_at });
// 12:00 in Muscat.
const now = new Date('2026-09-29T08:00:00Z');

describe('who a chat is with', () => {
  it('tells groups from people and reads the phone from the chat id', () => {
    expect(isGroup('120363412585944970@g.us')).toBe(true);
    expect(phoneOf('120363412585944970@g.us')).toBeNull();
    expect(phoneOf('96891234567:12@s.whatsapp.net')).toBe('96891234567');
  });

  it('writes Omani numbers in groups and others as dialled', () => {
    expect(formatPhone('96891234567')).toBe('+968 9123 4567');
    expect(formatPhone('447700900123')).toBe('+447700900123');
    expect(formatPhone(null)).toBe('');
  });

  it('prefers the saved name, then the number, then a generic label', () => {
    expect(chatName(chat({ display_name: ' سالم ' }), 'ar')).toBe('سالم');
    expect(chatName(chat({}), 'ar')).toBe('+968 9123 4567');
    expect(chatName(chat({ jid: 'x@g.us' }), 'ar')).toBe('مجموعة');
  });

  it('uses a letter for the avatar only when the name starts with one', () => {
    expect(avatarLetter({ display_name: 'reem' })).toBe('R');
    expect(avatarLetter({ display_name: 'عائشة' })).toBe('ع');
    expect(avatarLetter({ display_name: '+968' })).toBe('');
    expect(avatarLetter({ display_name: '' })).toBe('');
  });
});

describe('searching chats', () => {
  const chats = [
    chat({ id: 'a', display_name: 'أحمد البلوشي', bot_mode: 'active', last_message: 'متى الموعد؟' }),
    chat({ id: 'b', display_name: 'Fatma', jid: '96899887766@s.whatsapp.net' }),
    chat({ id: 'c', display_name: 'مدرسة النور', last_message: 'شكرًا على العرض' }),
  ];
  const ids = (list: Chat[]) => list.map(item => item.id);

  it('matches Arabic names without caring about hamza or taa marbuta spelling', () => {
    expect(ids(filterChats(chats, 'احمد'))).toEqual(['a']);
    expect(ids(filterChats(chats, 'مدرسه'))).toEqual(['c']);
  });

  it('matches the last message, a number fragment, and case', () => {
    expect(ids(filterChats(chats, 'العرض'))).toEqual(['c']);
    expect(ids(filterChats(chats, '9988'))).toEqual(['b']);
    expect(ids(filterChats(chats, 'fatma'))).toEqual(['b']);
  });

  it('filters by who replies', () => {
    expect(ids(filterChats(chats, '', 'assistant'))).toEqual(['a']);
    expect(ids(filterChats(chats, '', 'team'))).toEqual(['b', 'c']);
  });
});

describe('days and times in Muscat', () => {
  it('labels today, yesterday and older days', () => {
    expect(dayLabel('2026-09-29T02:00:00Z', now, 'ar')).toBe('اليوم');
    // 23:30 on the 28th in Muscat is still yesterday even though it is the 28th in UTC.
    expect(dayLabel('2026-09-28T19:30:00Z', now, 'ar')).toBe('أمس');
    expect(dayLabel('2026-09-28T20:30:00Z', now, 'en')).toBe('Today');
    expect(dayLabel('2026-08-01T08:00:00Z', now, 'en')).toBe('1 August');
  });

  it('stamps today with a time and older chats with the day', () => {
    expect(listStamp('2026-09-29T05:05:00Z', now, 'en')).toBe('09:05');
    expect(listStamp('2026-09-28T08:00:00Z', now, 'ar')).toBe('أمس');
  });

  it('orders messages and cuts them into days', () => {
    const groups = groupByDay([message('late', '2026-09-29T07:00:00Z'), message('early', '2026-09-28T07:00:00Z'), message('mid', '2026-09-29T06:00:00Z')], now, 'en');
    expect(groups.map(group => [group.label, group.items.map(item => item.id)])).toEqual([
      ['Yesterday', ['early']],
      ['Today', ['mid', 'late']],
    ]);
  });
});

describe('delivery', () => {
  it('translates delivery states and keeps unknown ones visible', () => {
    expect(deliveryLabel('sent', 'ar')).toBe('أُرسلت');
    expect(deliveryLabel('odd', 'ar')).toBe('odd');
  });

  it('separates messages still sending from ones that could not be confirmed', () => {
    const { waiting, unconfirmed } = pendingOutbox([
      { id: '1', conversation_id: 'c', status: 'queued', error: null, created_at: '' },
      { id: '2', conversation_id: 'c', status: 'uncertain', error: null, created_at: '' },
      { id: '3', conversation_id: 'c', status: 'sent', error: null, created_at: '' },
      { id: '4', conversation_id: 'other', status: 'failed', error: null, created_at: '' },
    ], 'c');
    expect(waiting.map(item => item.id)).toEqual(['1']);
    expect(unconfirmed.map(item => item.id)).toEqual(['2']);
  });
});

// The inbox talks to the WhatsApp service on the Reid host (/api/whatsapp/*),
// which holds the linked phone. The service checks the owner role on every
// request; nothing here reaches the phone directly.
import { localApi } from '../local-api';
import type { Chat, ChatMessage, Connection, OutboxItem } from './model';

export const loadStatus = () => localApi<Connection>('whatsapp/status');
export const loadChats = () => localApi<Chat[]>('whatsapp/conversations');
export const loadOutbox = () => localApi<OutboxItem[]>('whatsapp/outbox');

/** The service returns the newest hundred first; the thread reads oldest first. */
export const loadMessages = async (chatId: string) => (await localApi<ChatMessage[]>(`whatsapp/conversations/${chatId}/messages`)).reverse();

/** requestId makes a retried send land once: the service dedupes on it. */
export const sendMessage = (chatId: string, text: string, requestId: string) =>
  localApi<{ ok: boolean; status: string }>(`whatsapp/conversations/${chatId}/send`, { text, requestId });

/** "human" also cancels the assistant's queued replies for this chat. */
export const setMode = (chatId: string, mode: 'active' | 'human') =>
  localApi<{ ok: boolean }>(`whatsapp/conversations/${chatId}/mode`, { mode });

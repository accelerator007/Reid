// The inbox talks to the WhatsApp service on the Reid host (/api/whatsapp/*),
// which holds the linked phone. The service checks the owner role on every
// request; nothing here reaches the phone directly.
import { localApi } from '../local-api';
import type { AiHealth, AssistantAction, Chat, ChatMessage, Connection, OperationsHealth, OutboxItem, WhatsappSettings } from './model';

export const loadStatus = () => localApi<Connection>('whatsapp/status');
export const loadChats = () => localApi<Chat[]>('whatsapp/conversations');
export const loadOutbox = () => localApi<OutboxItem[]>('whatsapp/outbox');
export const loadActions = () => localApi<AssistantAction[]>('whatsapp/actions');
export const loadSettings = () => localApi<WhatsappSettings>('whatsapp/settings');
export const loadAiHealth = () => localApi<AiHealth>('ai/health');
export const loadOperationsHealth = () => localApi<OperationsHealth>('operations/status');
export const saveSettings = (settings: WhatsappSettings) => localApi<WhatsappSettings>('whatsapp/settings',{
  assistant_enabled:settings.assistant_enabled,customer_auto_reply:settings.customer_auto_reply,
  customer_voice_enabled:settings.customer_voice_enabled,customer_reply_mode:settings.customer_reply_mode,
  customer_tone:settings.customer_tone,customer_dialect:settings.customer_dialect,response_length:settings.response_length,
  custom_instructions:settings.custom_instructions,fallback_message:settings.fallback_message,
},'PATCH');
export const setAllModes = (mode:'active'|'human',scope:'all'|'customer'|'internal'|'group'='all') =>
  localApi<{ok:boolean;count:number}>('whatsapp/conversations/bulk-mode',{mode,scope});

/** The service returns the newest hundred first; the thread reads oldest first. */
export const loadMessages = async (chatId: string) => (await localApi<ChatMessage[]>(`whatsapp/conversations/${chatId}/messages`)).reverse();

/** requestId makes a retried send land once: the service dedupes on it. */
export const sendMessage = (chatId: string, text: string, requestId: string) =>
  localApi<{ ok: boolean; status: string }>(`whatsapp/conversations/${chatId}/send`, { text, requestId });

/** "human" also cancels the assistant's queued replies for this chat. */
export const setMode = (chatId: string, mode: 'active' | 'human') =>
  localApi<{ ok: boolean }>(`whatsapp/conversations/${chatId}/mode`, { mode });

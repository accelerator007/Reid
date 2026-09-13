import { AsyncLocalStorage } from 'node:async_hooks';

// Request-local sequencing makes webhook replies idempotent without sharing
// mutable sender state between concurrent requests.
const dispatch = new AsyncLocalStorage<{ id: string; sequence: number; conversationId?: string }>();
export const withQrDispatch = <T>(id: string, action: () => Promise<T>) =>
  dispatch.run({ id, sequence: 0 }, action);

export function targetQrConversation(conversationId: string) {
  if(!/^[0-9a-f-]{36}$/i.test(conversationId))throw new Error('invalid_qr_conversation');
  const context=dispatch.getStore();
  if(!context)throw new Error('qr_dispatch_context_required');
  context.conversationId=conversationId;
}

export async function queueQrText(admin: any, phone: string, body: string, key?: string, conversationId?: string) {
  const context = dispatch.getStore();
  const target=conversationId||context?.conversationId;
  if (!target&&!/^[0-9]{7,15}$/.test(phone)) throw new Error('invalid_qr_recipient');
  const query=admin.from('qr_conversations').select('id,bot_mode');
  const chat = await (target?query.eq('id',target):query.eq('jid', `${phone}@s.whatsapp.net`)).single();
  if (chat.error || chat.data.bot_mode !== 'active') throw new Error('qr_human_handoff');
  const dedupe = key || (context ? `owner:${context.id}:${context.sequence++}` : null);
  if (!dedupe) throw new Error('qr_dispatch_context_required');
  const result = await admin.from('qr_outbox').upsert({
    conversation_id: chat.data.id, body: body.slice(0,8000), origin: 'bot', dedupe_key: dedupe,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (result.error) throw new Error('qr_queue_failed');
  return `queued:${dedupe}`;
}

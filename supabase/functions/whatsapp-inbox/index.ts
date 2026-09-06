import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return reply({ ok: true });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const userResult = await admin.auth.getUser(jwt);
  const user = userResult.data.user;
  if (!user) return reply({ error: 'unauthenticated' }, 401);
  const role = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'owner').maybeSingle();
  if (!role.data) return reply({ error: 'owner_required' }, 403);

  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId || '');
  const conversation = await admin.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conversation.data) return reply({ error: 'conversation_not_found' }, 404);

  if (body.action === 'configure') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (['active', 'paused', 'human'].includes(body.botMode)) patch.bot_mode = body.botMode;
    if ('assignedTo' in body) {
      if (body.assignedTo) {
        const target = await admin.from('user_roles').select('user_id').eq('user_id', body.assignedTo).eq('role', 'owner').maybeSingle();
        if (!target.data) return reply({ error: 'assignee_must_be_owner' }, 400);
      }
      patch.assigned_to = body.assignedTo || null;
    }
    const updated = await admin.from('whatsapp_conversations').update(patch).eq('id', conversationId).select().single();
    return updated.error ? reply({ error: updated.error.message }, 400) : reply({ conversation: updated.data });
  }

  if (body.action === 'mark_read') {
    await admin.from('whatsapp_conversations').update({ unread_count: 0, updated_at: new Date().toISOString() }).eq('id', conversationId);
    return reply({ ok: true });
  }

  if (body.action !== 'send') return reply({ error: 'invalid_action' }, 400);
  const text = String(body.text || '').trim();
  if (!text || text.length > 4000) return reply({ error: 'invalid_message' }, 400);
  const lastInbound = conversation.data.last_inbound_at ? new Date(conversation.data.last_inbound_at).getTime() : 0;
  if (Date.now() - lastInbound > 24 * 60 * 60 * 1000) return reply({ error: 'outside_24h_window' }, 409);

  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) return reply({ error: 'whatsapp_delivery_not_configured' }, 503);
  const sent = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: conversation.data.sender_phone, type: 'text', text: { preview_url: false, body: text } }),
  });
  const payload = await sent.json().catch(() => ({}));
  if (!sent.ok) return reply({ error: payload?.error?.message || `whatsapp_delivery_${sent.status}` }, 502);
  const messageId = payload?.messages?.[0]?.id || null;
  await admin.from('whatsapp_messages').insert({ conversation_id: conversationId, meta_message_id: messageId, direction: 'outbound', message_type: 'text', body: text, delivery_status: 'sent', sent_by: user.id });
  await admin.from('whatsapp_conversations').update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conversationId);
  return reply({ ok: true, messageId });
});


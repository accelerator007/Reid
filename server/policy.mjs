export function isOwner(roles, status) {
  return status === 'active' && roles.includes('owner');
}

export function inboundText(message) {
  // Process newly received direct messages only. History, status, groups and
  // protocol events must never trigger autonomous replies.
  if (!message?.key?.id || message.key.fromMe || message.requestId) return null;
  let jid = message.key.remoteJid || '';
  if (!/^[0-9]+@(s\.whatsapp\.net|lid)$/.test(jid)) return null;
  // PN alternative is authenticated by the linked-device protocol, never
  // inferred from a display name or text supplied by a sender.
  if (jid.endsWith('@lid') && /^[0-9]{7,15}@s\.whatsapp\.net$/.test(message.key.remoteJidAlt||'')) jid=message.key.remoteJidAlt;
  if (message.messageStubType || message.message?.protocolMessage) return null;
  const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
  return typeof text === 'string' && text.trim() ? { jid, text: text.trim().slice(0, 8000), id: message.key.id } : null;
}

export function cleanReply(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('empty_ai_reply');
  return value.trim().slice(0, 4000);
}

export function maySend(row, conversation, connected) {
  return connected && row.status === 'queued' &&
    (row.origin === 'human' || conversation.bot_mode === 'active') &&
    Date.now() < Date.parse(row.expires_at);
}

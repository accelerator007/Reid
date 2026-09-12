export function isOwner(roles, status) {
  return status === 'active' && roles.includes('owner');
}

const jidPhone=value=>String(value||'').split('@')[0].split(':')[0].replace(/\D/g,'');
const reidName=/(?:^|[\s@])(?:reid|ري[ّ]?د)(?=$|\s)/iu;

export function inboundText(message, botJids=[]) {
  // Surface fresh group text to the service's exact-JID/Owner allow-list. History,
  // status and protocol events must never trigger autonomous replies.
  if (!message?.key?.id || message.key.fromMe || message.requestId) return null;
  let jid = message.key.remoteJid || '';
  const isGroup=/^[0-9]+@g\.us$/.test(jid);
  if (!isGroup && !/^[0-9]+@(s\.whatsapp\.net|lid)$/.test(jid)) return null;
  // PN alternative is authenticated by the linked-device protocol, never
  // inferred from a display name or text supplied by a sender.
  if (jid.endsWith('@lid') && /^[0-9]{7,15}@s\.whatsapp\.net$/.test(message.key.remoteJidAlt||'')) jid=message.key.remoteJidAlt;
  if (message.messageStubType || message.message?.protocolMessage) return null;
  const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
  if(typeof text !== 'string'||!text.trim())return null;
  if(isGroup){
    const senderPhone=jidPhone(message.key.participantPn||message.key.participantAlt||message.key.participant);
    if(!/^[1-9][0-9]{7,14}$/.test(senderPhone))return null;
    const context=message.message?.extendedTextMessage?.contextInfo||{};
    const botPhones=new Set((Array.isArray(botJids)?botJids:[botJids]).map(jidPhone).filter(Boolean));
    const mentioned=(context.mentionedJid||[]).some(value=>botPhones.has(jidPhone(value)));
    const addressed=mentioned||reidName.test(text);
    return {jid,text:text.trim().slice(0,8000),id:message.key.id,senderPhone,isGroup:true,addressed};
  }
  return { jid, text: text.trim().slice(0, 8000), id: message.key.id, senderPhone:jidPhone(jid),isGroup:false,addressed:true };
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

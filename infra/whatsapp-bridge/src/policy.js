export const digits = (value = '') => String(value).replace(/\D/g, '');

export function jidPhone(jid = '') {
  return digits(String(jid).split('@')[0].split(':')[0]);
}

export function messageContent(message = {}) {
  return message.ephemeralMessage?.message || message.viewOnceMessage?.message || message.viewOnceMessageV2?.message || message;
}

export function mediaKind(message = {}) {
  const value = messageContent(message);
  if (value.imageMessage) return 'image';
  if (value.audioMessage) return 'audio';
  return null;
}

export function messageText(message = {}) {
  const value = messageContent(message);
  const text = String(value.conversation || value.extendedTextMessage?.text || value.imageMessage?.caption || value.videoMessage?.caption || value.documentMessage?.caption || '').trim();
  if (text) return text;
  if (value.imageMessage) return 'حلل هذه الصورة';
  if (value.audioMessage) return 'حلل هذا التسجيل الصوتي';
  return '';
}

export function messageContext(message = {}) {
  const value = messageContent(message);
  return value.extendedTextMessage?.contextInfo || value.imageMessage?.contextInfo || value.audioMessage?.contextInfo || value.videoMessage?.contextInfo || value.documentMessage?.contextInfo || {};
}

export function messageAgeMs(timestamp, now = Date.now()) {
  if (timestamp == null) return Number.POSITIVE_INFINITY;
  const seconds = typeof timestamp === 'number'
    ? timestamp
    : Number(timestamp?.toNumber?.() ?? timestamp);
  return Number.isFinite(seconds) ? Math.max(0, now - (seconds * 1000)) : Number.POSITIVE_INFINITY;
}

export function shouldProcessUpsert(type, timestamp, maxAppendAgeMs = 120000, now = Date.now()) {
  return type === 'notify' || (type === 'append' && messageAgeMs(timestamp, now) <= maxAppendAgeMs);
}

export function shouldHandle({ key, message, botJid, owners, groups, trigger = 'ريد', groupParticipation = false, groupReplyAll = false, trustGroupMembers = false }) {
  if (!key || key.fromMe || !key.remoteJid || !message) return { allow: false, reason: 'ignored' };
  const text = messageText(message);
  if (!text) return { allow: false, reason: 'unsupported' };
  // Multi-device group events commonly expose a LID in `participant` and the
  // actual phone identity in `participantPn`. Authorization must use the PN.
  const sender = jidPhone(key.participantPn || key.participantAlt || key.participant || key.remoteJid);
  const isGroup = key.remoteJid.endsWith('@g.us');
  let isOwner = owners.has(sender);
  if (!isGroup) return isOwner
    ? { allow: true, text, sender, chatId: key.remoteJid, isOwner, addressed: true, proactive: false }
    : { allow: false, reason: 'owner_denied' };
  if (!groups.has(key.remoteJid)) return { allow: false, reason: 'group_denied' };
  if (trustGroupMembers) isOwner = true;
  if (!isOwner && !groupParticipation) return { allow: false, reason: 'owner_denied' };
  const context = messageContext(message);
  const botPhones = new Set((Array.isArray(botJid) ? botJid : [botJid]).map(jidPhone).filter(Boolean));
  const mentioned = (context.mentionedJid || []).some((jid) => botPhones.has(jidPhone(jid)));
  const replied = Boolean(context.participant) && botPhones.has(jidPhone(context.participant));
  const invocation = new RegExp(`(?:^|[\\s,:،-])@?(?:${trigger}|ر[يی]ّ?د|reid)(?=[\\s,:،-]|$)`, 'i');
  const named = invocation.test(text);
  const addressed = mentioned || replied || named || (trustGroupMembers && Boolean(mediaKind(message)));
  if (!addressed && !groupParticipation) return { allow: false, reason: 'not_addressed' };
  return {
    allow: true,
    text: text.replace(invocation, ' ').replace(/\s{2,}/g, ' ').trim() || 'مساعدة',
    sender,
    chatId: key.remoteJid,
    isOwner,
    addressed,
    proactive: !addressed && !groupReplyAll,
  };
}

export function boundedHistory(items, limit = 12) {
  return items.slice(-limit).map(({ role, content }) => ({ role, content: String(content).slice(0, 2000) }));
}

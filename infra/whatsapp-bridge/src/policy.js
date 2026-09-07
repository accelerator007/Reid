export const digits = (value = '') => String(value).replace(/\D/g, '');

export function jidPhone(jid = '') {
  return digits(String(jid).split('@')[0].split(':')[0]);
}

export function messageText(message = {}) {
  const value = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message;
  return String(value.conversation || value.extendedTextMessage?.text || value.imageMessage?.caption || value.videoMessage?.caption || '').trim();
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
  const context = message.extendedTextMessage?.contextInfo || {};
  const botPhone = jidPhone(botJid);
  const mentioned = Boolean(botPhone) && (context.mentionedJid || []).some((jid) => jidPhone(jid) === botPhone);
  const replied = Boolean(botPhone && context.participant) && jidPhone(context.participant) === botPhone;
  const invocation = new RegExp(`^(?:@?(?:${trigger}|ر[يی]ّ?د)|reid)(?:[\\s,:،-]+|$)`, 'i');
  const named = invocation.test(text);
  const addressed = mentioned || replied || named;
  if (!addressed && !groupParticipation) return { allow: false, reason: 'not_addressed' };
  return {
    allow: true,
    text: text.replace(invocation, '').trim() || 'مساعدة',
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

// The cheapest and most accurate signal the assistant can get: a thumb on the
// message it just sent, or a person saying "no, I meant". Stored against the
// reply it judges, never used to rewrite the assistant's own instructions.
const positive = /[\u{1F44D}\u{2764}\u{1F525}\u{2705}\u{1F4AF}\u{1F64F}\u{1F602}\u{1F44F}\u{1F929}]/u;
const negative = /[\u{1F44E}\u{1F621}\u{1F926}\u{274C}\u{1F612}\u{1F44E}]/u;

const jidPhone = value => String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export function readReaction(message) {
  const node = message?.message?.reactionMessage;
  if (!node?.key?.id) return null;
  // Only a reaction on something the assistant said is feedback about it.
  if (!node.key.fromMe) return null;
  const emoji = String(node.text || '');
  if (!emoji) return null;
  const signal = positive.test(emoji) ? 'positive' : negative.test(emoji) ? 'negative' : null;
  if (!signal) return null;
  const remoteJid = message.key?.remoteJid || '';
  const senderPhone = jidPhone(remoteJid.endsWith('@g.us')
    ? (message.key?.participantPn || message.key?.participantAlt || message.key?.participant)
    : remoteJid);
  if (!/^[1-9][0-9]{7,14}$/.test(senderPhone)) return null;
  return { jid: remoteJid, targetId: node.key.id, signal, emoji: emoji.slice(0, 8), senderPhone };
}

const correction = /^(?:لا|لأ|no|not)[\s،,.!]*(?:قصدي|أقصد|اقصدي|اقصد|ما\s*قصدت|مو\s*(?:هذا|كذا|قصدي)|مب\s*(?:هذا|كذا)|i\s*meant|that'?s not)/iu;

export function readCorrection(text) {
  const value = String(text ?? '').trim();
  if (value.length < 6 || value.length > 2000) return null;
  return correction.test(value) ? { signal: 'correction', detail: value.slice(0, 2000) } : null;
}

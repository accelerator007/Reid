import { timingSafeEqual } from 'node:crypto';

// A service-to-service token check that fails closed: no configured token, a
// missing header or any length mismatch is a refusal, and equal lengths are
// compared in constant time.
export function internalTokenValid(expected, supplied) {
  if (typeof expected !== 'string' || !expected || typeof supplied !== 'string') return false;
  const left = Buffer.from(expected), right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isOwner(roles, status) {
  return status === 'active' && roles.includes('owner');
}

const jidPhone=value=>String(value||'').split('@')[0].split(':')[0].replace(/\D/g,'');
const reidName=/(?:^|[\s@])(?:reid|ري[ّ]?د)(?=$|\s)/iu;

// The owner can switch an allow-listed group between ambient participation
// and call-only participation with a short, natural command. Keep this parser
// deliberately narrow so ordinary phrases such as "تكلم عن المشروع" never
// change a durable group setting.
export function groupParticipationCommand(text) {
  const value=String(text||'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/[.!؟?،,]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/^(?:يا\s+)?(?:ريد|ريّد|reid)\s+/iu,'')
    .trim();
  if(!value||value.length>90)return null;
  if(/^(?:خذ\s+راحتك|تكلم|تكلّم|تكلم\s+براحتك|شارك(?:نا)?|رد\s+على\s+(?:الكل|الجميع)|reply\s+to\s+everyone)$/iu.test(value))return 'ambient';
  if(/^(?:اسكت|اصمت|لا\s+تتكلم|لا\s+ترد(?:\s+إلا\s+(?:إذا|اذا)\s+(?:ناديتك|قلت\s+ريد))?|only\s+reply\s+when\s+(?:mentioned|called)|be\s+quiet)$/iu.test(value))return 'call_only';
  return null;
}

// Audio, image and document messages carry the same authorization surface as text: the
// sender is still the authenticated participant, and a caption is still
// untrusted content. Only the payload shape differs.
const mediaNode = value => {
  if (value?.audioMessage) return { kind: 'audio', node: value.audioMessage };
  if (value?.imageMessage) return { kind: 'image', node: value.imageMessage };
  if (value?.documentMessage) return { kind: 'document', node: value.documentMessage };
  return null;
};

export function inboundText(message, botJids=[]) {
  // Process only new direct or allow-list-eligible group content. Whether an
  // unaddressed group message may reply is decided against the durable group
  // record later; protocol parsing alone must not make that authorization call.
  if (!message?.key?.id || message.key.fromMe || message.requestId) return null;
  let jid = message.key.remoteJid || '';
  const isGroup=/^[0-9]+@g\.us$/.test(jid);
  if (!isGroup && !/^[0-9]+@(s\.whatsapp\.net|lid)$/.test(jid)) return null;
  // PN alternative is authenticated by the linked-device protocol, never
  // inferred from a display name or text supplied by a sender.
  if (jid.endsWith('@lid') && /^[0-9]{7,15}@s\.whatsapp\.net$/.test(message.key.remoteJidAlt||'')) jid=message.key.remoteJidAlt;
  if (message.messageStubType || message.message?.protocolMessage) return null;
  const media = mediaNode(message.message);
  const written = message.message?.conversation || message.message?.extendedTextMessage?.text;
  const caption = media ? String(media.node?.caption||'') : '';
  const supplied = typeof written === 'string' && written.trim() ? written : caption;
  if(!media && (typeof supplied !== 'string'||!supplied.trim()))return null;
  const text = String(supplied||'').trim().slice(0, 8000);
  const carried = media ? { media: {
    kind: media.kind,
    mimetype: String(media.node?.mimetype||'').split(';')[0] || null,
    ...(media.kind==='document'?{fileName:String(media.node?.fileName||'').slice(0,180)}:{}),
  } } : {};
  if(isGroup){
    const senderPhone=jidPhone(message.key.participantPn||message.key.participantAlt||message.key.participant);
    if(!/^[1-9][0-9]{7,14}$/.test(senderPhone))return null;
    const context=message.message?.extendedTextMessage?.contextInfo||media?.node?.contextInfo||{};
    const botPhones=new Set((Array.isArray(botJids)?botJids:[botJids]).map(jidPhone).filter(Boolean));
    const mentioned=(context.mentionedJid||[]).some(value=>botPhones.has(jidPhone(value)));
    const repliedToBot=Boolean(context.stanzaId)&&botPhones.has(jidPhone(context.participantPn||context.participant));
    const addressed=mentioned||reidName.test(text)||repliedToBot;
    return {jid,text,id:message.key.id,senderPhone,isGroup:true,addressed,repliedToBot,...carried};
  }
  return { jid, text, id: message.key.id, senderPhone:jidPhone(jid),isGroup:false,addressed:true,...carried };
}

export function cleanReply(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('empty_ai_reply');
  return value.trim().slice(0, 4000);
}

// Grounded answers carry [Reid:collection:id] markers so the quality gate can
// verify them. They are evidence for the gate, not something a person should
// read on a phone, so they are removed at the last step before WhatsApp, and
// Markdown is rewritten into the formatting WhatsApp actually renders.
export function whatsappText(value) {
  const original = String(value || '').trim();
  const text = original
    .replace(/[ \t]*\[Reid:[^\]\n]{1,160}\]/g, '')
    .replace(/[ \t]+([.،,؛:!؟?])/g, '$1')
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, '*$1*')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '_$1_')
    .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || original;
}

export function maySend(row, conversation, connected) {
  return connected && row.status === 'queued' &&
    (row.origin === 'human' || conversation.bot_mode === 'active') &&
    Date.now() < Date.parse(row.expires_at);
}

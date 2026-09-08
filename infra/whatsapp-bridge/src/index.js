import { mkdir, chmod } from 'node:fs/promises';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import { generateArtifact, requestedArtifactType } from './artifacts.js';
import { openSocket, rememberMessage } from './socket.js';
import { boundedHistory, digits, mediaKind, messageContent, messageContext, shouldHandle, shouldProcessUpsert } from './policy.js';
import { formatMuscat, muscatNow, parseReminder, ReminderStore } from './reminders.js';

// libsignal logs complete session objects (including key material) with
// console.info while rotating sessions. Suppress only that unsafe diagnostic.
const safeConsoleInfo = console.info.bind(console);
console.info = (first, ...rest) => {
  if (String(first).startsWith('Closing session:')) return;
  safeConsoleInfo(first, ...rest);
};

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const list = (name) => new Set((process.env[name] || '').split(',').map((value) => value.trim()).filter(Boolean));
const owners = new Set([
  ...[...list('REID_BRIDGE_ALLOWED_OWNERS')].map(digits),
  ...[...list('REID_BRIDGE_ALLOWED_OWNER_LIDS')].map(digits),
]);
const groups = list('REID_BRIDGE_ALLOWED_GROUPS');
if (!owners.size) throw new Error('REID_BRIDGE_ALLOWED_OWNERS is required');
if (!groups.size) throw new Error('REID_BRIDGE_ALLOWED_GROUPS is required');
const adapterUrl = required('REID_ADAPTER_URL').replace(/\/$/, '');
const originToken = required('REID_ORIGIN_TOKEN');
const authDir = process.env.REID_BRIDGE_AUTH_DIR || './auth';
const trigger = process.env.REID_BRIDGE_TRIGGER || 'ريد';
const groupParticipation = process.env.REID_BRIDGE_GROUP_PARTICIPATION === 'true';
const groupReplyAll = process.env.REID_BRIDGE_GROUP_REPLY_MODE === 'all';
const trustGroupMembers = process.env.REID_BRIDGE_TRUST_ALLOWED_GROUP_MEMBERS === 'true';
const groupReplyCooldownMs = Math.max(30000, Number(process.env.REID_BRIDGE_GROUP_REPLY_COOLDOWN_MS || 90000));
const conversations = new Map();
const seen = new Map();
const lastGroupReply = new Map();
const pendingReminders = new Map();
let responseQueue = Promise.resolve();
let activeSocket;

await mkdir(authDir, { recursive: true, mode: 0o700 });
await chmod(authDir, 0o700);
const reminderStore = new ReminderStore(process.env.REID_BRIDGE_REMINDERS_FILE || `${authDir}/reminders.json`);
await reminderStore.load();

async function answer(sender, chatId, input, context = {}, images = []) {
  const key = chatId.endsWith('@g.us') ? `group:${chatId}` : `${sender}:${chatId}`;
  const history = boundedHistory(conversations.get(key) || []);
  const messages = [
    { role: 'system', content: `أنت ريّد، مساعد ذكي ومختص بنظام شركة Reid. الوقت المرجعي الحقيقي الآن في سلطنة عُمان (Asia/Muscat، UTC+4) هو: ${muscatNow()}. استخدم هذا الوقت عند تفسير اليوم وغدًا والوقت والتاريخ، ولا تخمّن وقتًا غيره. افهم اللهجة العُمانية والخليجية والأخطاء الإملائية، وتكلم بلهجة خليجية بطابع عُماني طبيعي من غير تصنع. تكلم بطبيعية ودفء، وطابق نبرة المحادثة. استخدم من صفر إلى إيموجيين مناسبين عندما يضيفان معنى أو ودًا، ويمكن أن يكون الرد إيموجيًا قصيرًا عندما يكفي، لكن لا تبالغ ولا تكرر نفس الإيموجي. أجب مباشرة وباختصار، واسأل سؤالًا واحدًا فقط إذا نقصت معلومة مهمة. ناقش الطلبات العادية والحساسة وساعد في توضيحها، ولا تعرض كلمات مرور أو رموز OTP أو مفاتيح وصول مطلقًا. لا تدّع تنفيذ مهمة أو تعديل بيانات الشركة؛ التنفيذ الفعلي يمر عبر الأدوات ويسجل للتدقيق. سياق كل شخص ومجموعة معزول. ${context.proactive ? 'هذه رسالة عامة في مجموعة ولم ينادك أحد مباشرة. شارك فقط إن كانت لديك إضافة مفيدة وواضحة للمحادثة؛ وإلا أخرج النص الحرفي <NO_REPLY> دون أي كلام آخر.' : ''} ${context.isOwner ? 'المرسل مالك مصرح؛ استخدم معه سياق الشركة الداخلي المتاح لك ضمن الأدوات.' : 'المرسل عضو مجموعة عادي؛ رد عليه وساعده بالمحادثة، ولا تمنحه صلاحيات أو معلومات داخلية.'}` },
    ...history,
    { role: 'user', content: input.slice(0, 3000), ...(images.length ? { images } : {}) },
  ];
  const response = await fetch(`${adapterUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reid-origin-token': originToken },
    body: JSON.stringify({ messages, think: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`adapter_${response.status}`);
  const payload = await response.json();
  const output = String(payload?.message?.content || '').trim().slice(0, 4000);
  if (!output) throw new Error('empty_model_output');
  if (output === '<NO_REPLY>') return null;
  conversations.set(key, boundedHistory([...history, { role: 'user', content: input }, { role: 'assistant', content: output }]));
  return output;
}

async function prepareMedia(socket, item, instruction) {
  const currentKind = mediaKind(item.message);
  const quotedMessage = messageContext(item.message)?.quotedMessage;
  const quotedKind = quotedMessage ? mediaKind(quotedMessage) : null;
  const kind = currentKind || quotedKind;
  if (!kind) return { input: instruction, images: [] };
  let buffer;
  let content;
  if (currentKind) {
    buffer = await downloadMediaMessage(item, 'buffer', {}, { reuploadRequest: socket.updateMediaMessage });
    const value = messageContent(item.message);
    content = value.imageMessage || value.audioMessage;
  } else {
    const value = messageContent(quotedMessage);
    content = value.imageMessage || value.audioMessage;
    const stream = await downloadContentFromMessage(content, kind);
    const chunks = [];
    let size = 0;
    const limit = kind === 'image' ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > limit) throw new Error(`${kind}_too_large`);
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  }
  if (kind === 'image') {
    if (buffer.length > 5 * 1024 * 1024) throw new Error('image_too_large');
    return { input: instruction || 'حلل هذه الصورة', images: [buffer.toString('base64')] };
  }
  if (buffer.length > 16 * 1024 * 1024) throw new Error('audio_too_large');
  const response = await fetch(`${adapterUrl}/api/transcribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reid-origin-token': originToken },
    body: JSON.stringify({ audio: buffer.toString('base64'), mimetype: content?.mimetype || 'audio/ogg' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`transcribe_${response.status}`);
  const payload = await response.json();
  const transcript = String(payload?.text || '').trim();
  if (!transcript) throw new Error('empty_transcript');
  return { input: `${instruction || 'حلل هذا التسجيل الصوتي'}\n\nتفريغ التسجيل:\n${transcript}`.slice(0, 16000), images: [] };
}

async function respond(socket, item, decision) {
  try {
    if (decision.proactive && Date.now() - (lastGroupReply.get(decision.chatId) || 0) < groupReplyCooldownMs) return;
    await socket.sendPresenceUpdate('composing', decision.chatId);
    const prepared = await prepareMedia(socket, item, decision.text);
    const reminderKey = `${decision.sender}:${decision.chatId}`;
    const pending = pendingReminders.get(reminderKey);
    const reminderInput = pending ? `ذكرني ${pending} ${prepared.input}` : prepared.input;
    const reminder = parseReminder(reminderInput);
    if (reminder) {
      if ('missing' in reminder) {
        pendingReminders.set(reminderKey, prepared.input.replace(/(?:ذكرني|ذكّرني|تذكير)/ig, '').trim());
        await socket.sendMessage(decision.chatId, { text: 'أكيد، في أي يوم وساعة؟ مثال: بكرة الساعة 9 صباحًا.' }, { quoted: item });
        return;
      }
      pendingReminders.delete(reminderKey);
      const created = await reminderStore.create({ sender: decision.sender, chatId: decision.chatId, text: reminder.text, due: reminder.due });
      await socket.sendMessage(decision.chatId, { text: `تم ضبط التذكير ✅\n${created.text}\n${formatMuscat(created.dueAt)}` }, { quoted: item });
      return;
    }
    const output = await answer(decision.sender, decision.chatId, prepared.input, decision, prepared.images);
    if (!output) return;
    const artifactType = requestedArtifactType(prepared.input);
    if (artifactType) {
      const artifact = await generateArtifact(artifactType, output);
      await socket.sendMessage(decision.chatId, {
        document: artifact.buffer,
        mimetype: artifact.mimetype,
        fileName: artifact.fileName,
        caption: 'تفضل، جهزت لك الملف المطلوب 📎',
      }, { quoted: item });
    } else {
      await socket.sendMessage(decision.chatId, { text: output }, { quoted: item });
    }
    if (decision.chatId.endsWith('@g.us')) lastGroupReply.set(decision.chatId, Date.now());
    console.log('bridge_reply_sent', JSON.stringify({ chatKind: decision.chatId.endsWith('@g.us') ? 'group' : 'direct' }));
  } catch (error) {
    console.error('bridge_request_failed', error instanceof Error ? error.message : 'unknown');
    await socket.sendMessage(decision.chatId, { text: 'تعذر الرد الحين، جرّب مرة ثانية بعد شوي 🙏' }, { quoted: item });
  } finally {
    await socket.sendPresenceUpdate('paused', decision.chatId);
  }
}

async function run() {
  const { socket, DisconnectReason } = await openSocket(authDir, false);
  socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') { activeSocket = socket; console.log('reid_whatsapp_bridge_ready'); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('reid_whatsapp_bridge_logged_out');
        process.exit(1);
      }
      setTimeout(() => run().catch(() => process.exit(1)), 3000);
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log('bridge_upsert', JSON.stringify({ type, count: messages.length }));
    for (const item of messages) {
      rememberMessage(item);
      if (!shouldProcessUpsert(type, item.messageTimestamp)) continue;
      const id = item.key?.id;
      if (!id || seen.has(id)) continue;
      seen.set(id, Date.now());
      for (const [known, at] of seen) if (Date.now() - at > 3600000) seen.delete(known);
      const decision = shouldHandle({ key: item.key, message: item.message, botJid: [socket.user?.id, socket.user?.lid], owners, groups, trigger, groupParticipation, groupReplyAll, trustGroupMembers });
      if (!decision.allow) {
        console.log('bridge_message_skipped', JSON.stringify({ reason: decision.reason, type, chatKind: item.key?.remoteJid?.endsWith('@g.us') ? 'group' : 'direct' }));
        continue;
      }
      console.log('bridge_message_accepted', JSON.stringify({ type, chatKind: decision.chatId.endsWith('@g.us') ? 'group' : 'direct' }));
      responseQueue = responseQueue.then(() => respond(socket, item, decision)).catch((error) => {
        console.error('bridge_queue_failed', error instanceof Error ? error.message : 'unknown');
      });
    }
  });
}

setInterval(async () => {
  if (!activeSocket) return;
  const reminder = await reminderStore.claimDue();
  if (!reminder) return;
  try {
    await activeSocket.sendMessage(reminder.chatId, { text: `⏰ تذكيرك:\n${reminder.text}` });
    await reminderStore.complete(reminder.id);
    console.log('bridge_reminder_sent', JSON.stringify({ chatKind: reminder.chatId.endsWith('@g.us') ? 'group' : 'direct' }));
  } catch (error) {
    await reminderStore.fail(reminder.id, error instanceof Error ? error.message : 'send_failed');
    console.error('bridge_reminder_failed');
  }
}, 15_000).unref();

await run();

import { mkdir, chmod } from 'node:fs/promises';
import { openSocket } from './socket.js';
import { boundedHistory, digits, shouldHandle } from './policy.js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const list = (name) => new Set((process.env[name] || '').split(',').map((value) => value.trim()).filter(Boolean));
const owners = new Set([...list('REID_BRIDGE_ALLOWED_OWNERS')].map(digits));
const groups = list('REID_BRIDGE_ALLOWED_GROUPS');
if (!owners.size) throw new Error('REID_BRIDGE_ALLOWED_OWNERS is required');
if (!groups.size) throw new Error('REID_BRIDGE_ALLOWED_GROUPS is required');
const adapterUrl = required('REID_ADAPTER_URL').replace(/\/$/, '');
const originToken = required('REID_ORIGIN_TOKEN');
const authDir = process.env.REID_BRIDGE_AUTH_DIR || './auth';
const trigger = process.env.REID_BRIDGE_TRIGGER || 'ريد';
const conversations = new Map();
const seen = new Map();

await mkdir(authDir, { recursive: true, mode: 0o700 });
await chmod(authDir, 0o700);

async function answer(sender, chatId, input) {
  const key = `${sender}:${chatId}`;
  const history = boundedHistory(conversations.get(key) || []);
  const messages = [
    { role: 'system', content: `أنت ريّد، مساعد شخصي ذكي للمسؤول الحالي ومختص بنظام شركة Reid. افهم العربية العُمانية والأخطاء الإملائية. أجب مباشرة وباختصار، واسأل سؤالًا واحدًا فقط إذا نقصت معلومة مهمة. لا تدّع تنفيذ مهمة أو تعديل بيانات الشركة من هذه القناة؛ وضّح أن التنفيذ الحساس يمر عبر نظام الموافقات. سياق كل مسؤول ومجموعة معزول.` },
    ...history,
    { role: 'user', content: input.slice(0, 3000) },
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
  conversations.set(key, boundedHistory([...history, { role: 'user', content: input }, { role: 'assistant', content: output }]));
  return output;
}

async function run() {
  const { socket, DisconnectReason } = await openSocket(authDir, false);
  socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('reid_whatsapp_bridge_ready');
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
    if (type !== 'notify') return;
    for (const item of messages) {
      const id = item.key?.id;
      if (!id || seen.has(id)) continue;
      seen.set(id, Date.now());
      for (const [known, at] of seen) if (Date.now() - at > 3600000) seen.delete(known);
      const decision = shouldHandle({ key: item.key, message: item.message, botJid: socket.user?.id, owners, groups, trigger });
      if (!decision.allow) continue;
      try {
        await socket.sendPresenceUpdate('composing', decision.chatId);
        const output = await answer(decision.sender, decision.chatId, decision.text);
        await socket.sendMessage(decision.chatId, { text: output }, { quoted: item });
      } catch (error) {
        console.error('bridge_request_failed', error instanceof Error ? error.message : 'unknown');
        await socket.sendMessage(decision.chatId, { text: 'تعذر الرد الآن. تم تسجيل المشكلة وسأحاول عند عودة خدمة ريّد.' }, { quoted: item });
      } finally {
        await socket.sendPresenceUpdate('paused', decision.chatId);
      }
    }
  });
}

await run();

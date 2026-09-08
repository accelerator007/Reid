import { mkdir, chmod } from 'node:fs/promises';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import { generateArtifact, requestedArtifactType } from './artifacts.js';
import { openSocket, rememberMessage } from './socket.js';
import { boundedHistory, digits, mediaKind, messageContent, messageContext, shouldHandle, shouldProcessUpsert } from './policy.js';
import { formatMuscat, muscatNow, parseReminder, ReminderStore } from './reminders.js';
import { ActionStore, planAction } from './actions.js';
import { CompanyClient } from './company.js';

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
const company = new CompanyClient({ url: process.env.REID_RUNNER_URL, token: process.env.REID_RUNNER_TOKEN });
const actionStore = new ActionStore(process.env.REID_BRIDGE_ACTIONS_FILE || `${authDir}/actions.json`);
let responseQueue = Promise.resolve();
let activeSocket;

await mkdir(authDir, { recursive: true, mode: 0o700 });
await chmod(authDir, 0o700);
const reminderStore = new ReminderStore(process.env.REID_BRIDGE_REMINDERS_FILE || `${authDir}/reminders.json`);
await reminderStore.load();
await actionStore.load();

async function chatModel(system, input, images = []) {
  const response = await fetch(`${adapterUrl}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-reid-origin-token': originToken },
    body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: input.slice(0, 16000), ...(images.length ? { images } : {}) }], think: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`adapter_${response.status}`);
  const payload = await response.json();
  const output = String(payload?.message?.content || '').trim();
  if (!output) throw new Error('empty_model_output');
  return output;
}

async function generateLocalImages(prompt, aspectRatio, count, source = '') {
  const brand = `Create a polished production-ready visual for Reid (ريّد), an Omani technology and AI company. Brand palette: deep plum #2B1D3C, Reid purple #5E3F9E and #7C5AB5, pale lavender #F0EBF7, warm white. Minimal premium composition, clear hierarchy and generous whitespace. Never invent or distort a logo. Do not render text unless the request provides the exact text. No third-party marks. Request: ${prompt}`;
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const response = await fetch(`${adapterUrl}/api/images`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-reid-origin-token': originToken },
      body: JSON.stringify({ prompt: `${brand}\nVariation ${index + 1} of ${count}.`, aspect_ratio: aspectRatio, ...(source ? { image: source } : {}) }),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.image) throw new Error(payload.error || `local_image_${response.status}`);
    results.push(payload.image);
  }
  return results;
}

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

const actionLike = (text) => /(اجتماع|مشروع|المشاريع|تتذكر|احفظ|انس|ملف|عرض سعر|اتفقنا|محتوى|منشور|صورة|صور|صمم|تصميم|ستوري|بنر|خلفية|انستغرام|instagram|linkedin|لينكد|فاتور|لقطة|خطأ|تقرير)/i.test(text);
const approval = (text) => /^(?:اعتمد|موافق|موافقة|نفذ|انشره)\s*[.!؟]*$/i.test(text.trim());
const rejection = (text) => /^(?:رفض|الغ|إلغاء|لا)\s*[.!؟]*$/i.test(text.trim());

async function smartAction(decision, prepared) {
  if (!company.enabled || (!actionLike(prepared.input) && !approval(prepared.input) && !rejection(prepared.input))) return null;
  const key = `${decision.sender}:${decision.chatId}`;
  const previousArtifact = await actionStore.artifact(key);
  const previousImage = await actionStore.artifact(`image:${key}`);
  const rollback = prepared.input.match(/(?:ارجع|استرجع).*(?:إصدار|نسخة)\s*(\d+)/i);
  if (previousImage?.assetId && rollback) {
    const result = await company.call(decision.sender, 'image.rollback', { asset_id: previousImage.assetId, version: Number(rollback[1]) }, decision.chatId);
    return `رجعت الأصل للإصدار ${result.active_version}، وألغيت اعتماده السابق حتى تراجعه من جديد ✅`;
  }
  if (previousImage?.assetId && /(?:اعرض|وش|ما هي).*(?:الإصدارات|النسخ)/i.test(prepared.input)) {
    const result = await company.call(decision.sender, 'image.versions', { asset_id: previousImage.assetId }, decision.chatId);
    return `إصدارات ${result.asset.title} (النشط ${result.asset.active_version}):\n${result.versions.map((row) => `v${row.version} — ${new Date(row.created_at).toLocaleString('ar-OM', { timeZone: 'Asia/Muscat' })}`).join('\n')}`;
  }
  if (previousArtifact && /(عدّل|عدل|أضف|اضف|احذف|غيّر|غير).*(?:تقرير|ملف|مقارنة)|(?:تقرير|ملف).*(عدّل|عدل|أضف|اضف|احذف|غيّر|غير)/i.test(prepared.input)) {
    const body = await chatModel('عدّل التقرير السابق حسب تعليمات المستخدم. أعد التقرير كاملًا فقط، منظمًا بعناوين ونقاط، وحافظ على الأرقام التي لم يطلب تغييرها.', `التقرير السابق:\n${previousArtifact.body}\n\nالتعديل المطلوب:\n${prepared.input}`);
    return { artifact: { type: previousArtifact.type, body }, text: 'حدثت نفس التقرير حسب طلبك ✅' };
  }
  const pending = await actionStore.pending(key);
  if (pending && rejection(prepared.input)) { await actionStore.pending(key, null); return 'تم إلغاء الطلب، ولا تغيّر شيء 👍'; }
  if (pending && approval(prepared.input)) {
    const job = await actionStore.job(pending.kind, pending);
    try {
      let result;
      if (pending.kind === 'meeting') result = await company.call(decision.sender, 'tasks.create_batch', { project: pending.project, tasks: pending.tasks }, decision.chatId);
      else if (pending.kind === 'content') result = await company.call(decision.sender, 'content.draft.create', pending.draft, decision.chatId);
      else if (pending.kind === 'image_approval') result = await company.call(decision.sender, 'image.approve', { asset_id: pending.assetId }, decision.chatId);
      else return null;
      await actionStore.pending(key, null); await actionStore.finish(job.id, 'completed', result);
      if (pending.kind === 'image_approval') return `✅ سُجل اعتماد L2 للصورة (${job.id}). ما تم نشرها تلقائيًا. تقدر الحين تطلب جدولتها بعد ربط المنصة.`;
      return `✅ اكتمل (${job.id})\n${pending.kind === 'meeting' ? `حفظت ${result.created.length} مهام في مشروع ${result.project.name}.` : `حفظت المسودة: ${result.title_ar}. النشر الخارجي يحتاج ربط المنصة وموافقة L2.`}\n${result.url}`;
    } catch (error) { await actionStore.finish(job.id, 'failed', String(error)); return `❌ فشل الطلب (${job.id}): ${error.message}\nتقدر تقول: أعد المحاولة.`; }
  }

  const plan = await planAction(chatModel, prepared.input, prepared.images);
  if (plan.intent === 'image_schedule') {
    if (!previousImage?.assetId) return 'ما لقيت صورة سابقة في هذه المحادثة عشان أجدولها.';
    const result = await company.call(decision.sender, 'image.schedule', { asset_id: previousImage.assetId, scheduled_at: plan.scheduled_at }, decision.chatId);
    return `سجلت الجدولة بتاريخ ${new Date(result.scheduled_at).toLocaleString('ar-OM', { timeZone: 'Asia/Muscat' })}. الإرسال للمنصة يبدأ بعد ربط حسابها؛ ما نشرت شيء الآن.`;
  }
  if (plan.intent === 'project_status') {
    const data = await company.call(decision.sender, 'projects.summary', { query: plan.query || prepared.input, project: plan.project }, decision.chatId);
    return chatModel('أنت مدير عمليات. لخّص بيانات المشاريع التالية بالعربية بوضوح: الحالة، المتأخر، السبب المستنتج فقط إن كان مدعومًا، والخطوة التالية. اذكر رابط المشروع. لا تخترع.', JSON.stringify(data));
  }
  if (plan.intent === 'meeting') {
    if (!plan.project) return 'حللت الاجتماع، بس أحتاج اسم المشروع عشان أربط المهام بالمكان الصحيح. وش اسم المشروع؟';
    const value = { kind: 'meeting', project: plan.project, summary: plan.summary, decisions: plan.decisions || [], tasks: plan.tasks || [] };
    await actionStore.pending(key, value);
    return `📋 معاينة الاجتماع\n\nالملخص: ${value.summary || '—'}\nالقرارات: ${(value.decisions || []).join('، ') || '—'}\nالمهام:\n${value.tasks.map((task, index) => `${index + 1}. ${task.title}${task.assignee ? ` — ${task.assignee}` : ''}${task.due_at ? ` — ${task.due_at}` : ''}`).join('\n') || 'لا توجد مهام واضحة'}\n\nاكتب «اعتمد» للحفظ في ${value.project} أو «إلغاء».`;
  }
  if (plan.intent === 'memory_list') {
    const rows = await company.call(decision.sender, 'memory.list', { scope: decision.chatId.endsWith('@g.us') ? 'group' : 'user' }, decision.chatId);
    return rows.length ? `هذا اللي أتذكره:\n${rows.map((row, i) => `${i + 1}. ${row.content} [${row.id.slice(0, 8)}]`).join('\n')}` : 'ما عندي ذاكرة محفوظة لك في هذا السياق للحين.';
  }
  if (plan.intent === 'memory_save') {
    const row = await company.call(decision.sender, 'memory.save', { scope: decision.chatId.endsWith('@g.us') ? 'group' : 'user', content: plan.memory || prepared.input }, decision.chatId);
    return `حفظتها في ذاكرتك المنفصلة ✅\n${row.content}`;
  }
  if (plan.intent === 'memory_delete') return 'اعرض ذاكرتك أول بعبارة «وش تتذكر عني؟»، وبعدها قل «انسَ» مع رقم الذاكرة الظاهر.';
  if (plan.intent === 'knowledge') {
    const sources = await company.call(decision.sender, 'knowledge.search', { query: plan.query || prepared.input }, decision.chatId);
    return chatModel('أجب اعتمادًا على النتائج فقط. اذكر اسم كل مصدر ومعرّفه، وقل بوضوح إن لم تكف النتائج. لا تخترع رابطًا أو صفحة.', `${prepared.input}\n\nالمصادر:\n${JSON.stringify(sources)}`);
  }
  if (plan.intent === 'content') {
    const draftText = await chatModel('أنشئ مسودة محتوى Reid احترافية بالعربية والإنجليزية مناسبة لـInstagram وLinkedIn. أعط عنوانين ثم النصين ثم اقتراحًا بصريًا، دون الادعاء بالنشر.', prepared.input, prepared.images);
    const value = { kind: 'content', draft: { title_ar: 'مسودة محتوى ريّد', title_en: 'Reid content draft', body_ar: draftText, body_en: draftText } };
    await actionStore.pending(key, value);
    return `${draftText}\n\nاكتب «اعتمد» لحفظها كمسودة، أو «إلغاء». النشر والجدولة الخارجية يظهران بعد ربط حسابات المنصات.`;
  }
  if (plan.intent === 'image_generate' || plan.intent === 'image_edit') {
    const prior = await actionStore.artifact(`image:${key}`);
    const source = prepared.images[0] || (plan.intent === 'image_edit' ? prior?.data : '');
    if (plan.intent === 'image_edit' && !source) return 'أرسل الصورة أو رد عليها، واكتب التعديل اللي تريده.';
    const count = Math.min(3, Math.max(1, Number(plan.count) || 1));
    const aspectRatio = plan.aspect_ratio || '1:1';
    const generatedImages = await generateLocalImages(plan.prompt || prepared.input, aspectRatio, count, source);
    const result = await company.call(decision.sender, plan.intent === 'image_edit' ? 'image.edit' : 'image.generate', {
      prompt: plan.prompt || prepared.input, title: plan.title || 'تصميم ريّد', project: plan.project || '',
      platforms: plan.platforms || [], aspect_ratio: aspectRatio, count,
      image: source || undefined, mime_type: 'image/png', image_size: '1K',
      asset_id: plan.intent === 'image_edit' ? prior?.assetId : undefined,
      generated_images: generatedImages, generated_model: 'stabilityai/sdxl-turbo',
    }, decision.chatId);
    const images = result.versions.map((version) => ({ data: version.data, caption: `اقتراح ${version.version} • ${result.asset.title}\nالأصل ${result.asset.id.slice(0, 8)} • المتبقي اليوم ${result.remaining}` }));
    await actionStore.artifact(`image:${key}`, { assetId: result.asset.id, data: result.versions.at(-1)?.data, updatedAt: new Date().toISOString() });
    await actionStore.pending(key, { kind: 'image_approval', assetId: result.asset.id });
    return { images, text: `جهزت ${images.length} اقتراح. اكتب «اعتمد» لتسجيل موافقة L2 على الأصل ${result.asset.id.slice(0, 8)}، أو أرسل تعديلك. ما راح يُنشر تلقائيًا.\n${result.url}` };
  }
  if (plan.intent === 'invoice') return chatModel('استخرج بيانات الفاتورة من الصورة: المورد، الرقم، التاريخ، البنود، الضريبة، الإجمالي، العملة. ضع علامة يحتاج مراجعة أمام أي قيمة غير مؤكدة. لا تدّع حفظها.', prepared.input, prepared.images);
  if (plan.intent === 'troubleshoot') return chatModel('حلل لقطة الخطأ كمختص تقني: ما الظاهر، السبب المرجح، خطوات آمنة مرتبة، وما الدليل الإضافي المطلوب. لا تخترع نصًا غير ظاهر.', prepared.input, prepared.images);
  return null;
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
    if (/(تذكيراتي|قائمة التذكير|اعرض.*تذكير)/i.test(prepared.input)) {
      const rows = reminderStore.list(decision.sender, decision.chatId);
      await socket.sendMessage(decision.chatId, { text: rows.length ? `⏰ تذكيراتك:\n${rows.map((row, i) => `${i + 1}. ${row.text} — ${formatMuscat(row.dueAt)} [${row.id.slice(0, 8)}]`).join('\n')}` : 'ما عندك تذكيرات نشطة.' }, { quoted: item }); return;
    }
    const snooze = prepared.input.match(/(?:أجل|اجل|تأجيل|أجله)\s*(\d+)?\s*(دقيقة|دقائق|ساعة|ساعتين|ساعات)?/i);
    if (snooze) {
      const amount = Number(snooze[1] || (/ساعتين/.test(snooze[2] || '') ? 2 : 1)); const milliseconds = /دقيق/.test(snooze[2] || '') ? amount * 60_000 : amount * 3_600_000;
      const row = await reminderStore.snooze(decision.sender, decision.chatId, milliseconds);
      await socket.sendMessage(decision.chatId, { text: row ? `أجلته لك ✅\n${formatMuscat(row.dueAt)}` : 'ما لقيت تذكيرًا سابقًا أقدر أؤجله.' }, { quoted: item }); return;
    }
    if (/(?:إلغاء|الغاء|احذف).*تذكير/i.test(prepared.input)) {
      const id = prepared.input.match(/[a-f0-9]{8}/i)?.[0] || ''; const row = await reminderStore.cancel(decision.sender, decision.chatId, id);
      await socket.sendMessage(decision.chatId, { text: row ? 'تم إلغاء التذكير ✅' : 'حدد التذكير من «قائمة تذكيراتي».' }, { quoted: item }); return;
    }
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
      const created = await reminderStore.create({ sender: decision.sender, chatId: decision.chatId, text: reminder.text, due: reminder.due, recurrence: reminder.recurrence });
      await socket.sendMessage(decision.chatId, { text: `تم ضبط التذكير ✅\n${created.text}\n${formatMuscat(created.dueAt)}${created.recurrence ? '\nيتكرر أسبوعيًا' : ''}\nبعد وصوله تقدر تكتب: تم، أجله ساعتين، أو إلغاء التذكير.` }, { quoted: item });
      return;
    }
    const actionOutput = await smartAction(decision, prepared);
    if (actionOutput) {
      if (typeof actionOutput === 'object' && actionOutput.images) {
        for (const generated of actionOutput.images) await socket.sendMessage(decision.chatId, { image: Buffer.from(generated.data, 'base64'), caption: generated.caption }, { quoted: item });
        await socket.sendMessage(decision.chatId, { text: actionOutput.text }, { quoted: item });
      } else if (typeof actionOutput === 'object' && actionOutput.artifact) {
        const artifact = await generateArtifact(actionOutput.artifact.type, actionOutput.artifact.body);
        await actionStore.artifact(`${decision.sender}:${decision.chatId}`, { ...actionOutput.artifact, updatedAt: new Date().toISOString() });
        await socket.sendMessage(decision.chatId, { document: artifact.buffer, mimetype: artifact.mimetype, fileName: artifact.fileName, caption: actionOutput.text }, { quoted: item });
      } else await socket.sendMessage(decision.chatId, { text: actionOutput }, { quoted: item });
      return;
    }
    const output = await answer(decision.sender, decision.chatId, prepared.input, decision, prepared.images);
    if (!output) return;
    const artifactType = requestedArtifactType(prepared.input);
    if (artifactType) {
      const artifact = await generateArtifact(artifactType, output);
      await actionStore.artifact(`${decision.sender}:${decision.chatId}`, { type: artifactType, body: output, updatedAt: new Date().toISOString() });
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
    const message = error instanceof Error && error.message.includes('image_provider_quota_unavailable')
      ? 'مولّد الصور مربوط، لكن حصة صور Gemini غير متاحة حاليًا. ما خصمت الطلب من حد ريّد؛ جرّب بعد تفعيل الحصة أو رجوعها.'
      : 'تعذر الرد الحين، جرّب مرة ثانية بعد شوي 🙏';
    await socket.sendMessage(decision.chatId, { text: message }, { quoted: item });
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

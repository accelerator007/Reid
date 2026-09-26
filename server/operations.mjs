const ownerRoles = new Set(['owner', 'super_admin']);
const healthLabels = Object.freeze({
  healthy: 'سليم',
  degraded: 'يحتاج متابعة',
  unavailable: 'غير متاح',
  unknown: 'لم يتم التحقق',
});

function normalizeCommand(text) {
  return String(text || '').normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670\u0640]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .trim()
    .replace(/^@?(?:reid|ريد)\s*[,،:：-]?\s+/iu, '')
    .replace(/[.!?؟،,]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function parseOperationsCommand(text) {
  const value = normalizeCommand(text);
  if (/^(?:(?:اعرض|افحص|شيك|وش|ما هي)\s+)?حالة (?:النظام|الخدمات)$|^(?:system|services) status$|^status$/u.test(value)) return 'system';
  if (/^(?:(?:اعرض|افحص|شيك|وش|ما هي)\s+)?حالة الموقع$|^(?:site|website) status$/u.test(value)) return 'website';
  if (/^(?:(?:اعرض|افحص|شيك|وش|ما هي)\s+)?حالة (?:السيرفر|الخادم)$|^(?:server|host) status$/u.test(value)) return 'server';
  if (/^(?:(?:اعرض|افحص|شيك|وش|ما هي)\s+)?حالة (?:واتس\s*اب|واتساب|الواتساب)$|^whatsapp status$/u.test(value)) return 'whatsapp';
  if (/^(?:اوامر الادارة|مساعدة الادارة|admin help|admin commands|operations help)$/u.test(value)) return 'help';
  return null;
}

function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) return 'غير متاح';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'غير متاح';
  return new Intl.DateTimeFormat('ar-OM', {
    timeZone: 'Asia/Muscat', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(timestamp));
}

function countLabel(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : 'غير متاح';
}

function metric(value, maximum = Infinity) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
    ? String(Math.round(value * 10) / 10) : null;
}

function componentLine(label, value) {
  const status = Object.hasOwn(healthLabels, value?.status) ? healthLabels[value.status] : healthLabels.unknown;
  const latency = metric(value?.latencyMs, 300_000);
  return `• ${label}: ${status}${latency === null ? '' : ` — ${latency} مللي ثانية`}`;
}

function whatsappLines(snapshot) {
  const whatsapp = snapshot.components?.whatsapp;
  const connections = { connected: 'متصل', disconnected: 'غير متصل', connecting: 'جارٍ الاتصال', qr: 'بانتظار مسح رمز QR من صفحة الاتصالات' };
  const connection = Object.hasOwn(connections, whatsapp?.connection) ? connections[whatsapp.connection] : 'لم يتم التحقق';
  return [
    componentLine('خدمة واتساب', whatsapp),
    `• اتصال واتساب: ${connection}`,
    `• الطابور: معلّق ${countLabel(snapshot.queue?.pending)}، فاشل ${countLabel(snapshot.queue?.failed)}، غير مؤكد ${countLabel(snapshot.queue?.uncertain)}`,
    `• آخر رسالة واردة: ${dateLabel(snapshot.activity?.lastInboundAt)}`,
    `• آخر رسالة صادرة: ${dateLabel(snapshot.activity?.lastOutboundAt)}`,
    'الاتصال وحركة الرسائل لا يثبتان اكتمال اختبار إرسال واستقبال جديد.',
  ];
}

function hostLines(host, defaultName = 'المضيف') {
  const names = { 'ai-lap': 'خادم الذكاء الاصطناعي (ai-lap)', Reid: 'خادم الموقع (Reid)', reid: 'خادم الموقع (Reid)', site: 'خادم الموقع' };
  const name = Object.hasOwn(names, host?.name) ? names[host.name] : defaultName;
  if (host?.fresh !== true) return [`• ${name}: مقاييس المضيف الحديثة غير متاحة؛ لا يمكن تأكيد حالة السيرفر من حالة الخدمات وحدها.`];
  const cpu = metric(host.cpuPercent, 100);
  const memoryUsed = metric(host.memoryUsedGb);
  const memoryTotal = metric(host.memoryTotalGb);
  const disk = metric(host.diskUsedPercent, 100);
  const lines = [`• ${name} — آخر قياس: ${dateLabel(host.lastSeenAt)}`];
  if (cpu !== null) lines.push(`• استخدام المعالج: ${cpu}%`);
  if (memoryUsed !== null && memoryTotal !== null && Number(memoryTotal) > 0 && Number(memoryUsed) <= Number(memoryTotal)) lines.push(`• الذاكرة: ${memoryUsed} / ${memoryTotal} GB`);
  if (disk !== null) lines.push(`• استخدام القرص: ${disk}%`);
  if (lines.length === 1) lines.push('• مقاييس المعالج والذاكرة والقرص غير متاحة.');
  return lines;
}

export function formatOperationsSnapshot(command, snapshot = {}) {
  const data = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const titles = { system: 'حالة النظام', website: 'حالة الموقع', server: 'حالة السيرفر', whatsapp: 'حالة واتساب' };
  const lines = [`${titles[command] || titles.system} — وقت الفحص: ${dateLabel(data.checkedAt)} (عُمان)`];
  if (command === 'system' || command === 'website') lines.push(componentLine('الموقع', data.components?.website));
  if (command === 'system' || command === 'server') {
    lines.push(componentLine('قاعدة البيانات', data.components?.database));
    lines.push(componentLine('خدمة الذكاء الاصطناعي', data.components?.ai));
    lines.push(componentLine('مشغّل مهام الذكاء الاصطناعي', data.components?.runner));
    lines.push(...hostLines(data.host, 'خادم الذكاء الاصطناعي'));
    lines.push(...hostLines(data.websiteHost, 'خادم الموقع (Reid)'));
  }
  if (command === 'system' || command === 'whatsapp') lines.push(...whatsappLines(data));
  if (command === 'website') lines.push('هذا فحص استجابة الموقع؛ لا يؤكد عمل كل صفحات الموقع أو وظائفه.');
  lines.push('للاطلاع على الإمكانات المتاحة اكتب «أوامر الإدارة».');
  return lines.join('\n');
}

const helpText = [
  'أوامر الإدارة المتاحة للمالك:',
  '• حالة النظام: الموقع وواتساب والذكاء الاصطناعي وقاعدة البيانات.',
  '• حالة الموقع: استجابة الموقع ووقت الفحص.',
  '• حالة السيرفر: حالة الخدمات ومقاييس المضيف عندما تتوفر بيانات حديثة.',
  '• حالة واتساب: الاتصال والطابور وآخر وقت للرسائل، دون عرض محتواها.',
  'إدارة محتوى الموقع المتاحة حاليًا تشمل أوامر إضافة الورش ونشرها وإلغائها، وتحتاج معاينة ثم تأكيدًا.',
  'إعادة تشغيل الخدمات، النشر البرمجي، وإدارة النسخ الاحتياطية غير متاحة من واتساب حاليًا.',
].join('\n');

export function createOperationsHandler({ getSnapshot }) {
  if (typeof getSnapshot !== 'function') throw new TypeError('getSnapshot is required');
  return async function handleOperations({ identity, text }) {
    const command = parseOperationsCommand(text);
    if (!command) return null;
    if (!Array.isArray(identity?.roles) || !identity.roles.some(role => ownerRoles.has(role))) {
      return { handled: true, text: 'أوامر حالة النظام وإدارته متاحة للمالك فقط.' };
    }
    if (command === 'help') return { handled: true, text: helpText };
    try {
      return { handled: true, text: formatOperationsSnapshot(command, await getSnapshot({ command })) };
    } catch {
      return { handled: true, text: 'تعذر جلب حالة النظام الآن. لم يتم التحقق من حالة الخدمات؛ جرّب مرة ثانية بعد قليل.' };
    }
  };
}

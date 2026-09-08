import { mkdir, chmod } from 'node:fs/promises';
import qrcode from 'qrcode-terminal';
import { openSocket } from './socket.js';

const authDir = process.env.REID_BRIDGE_AUTH_DIR || './auth';
await mkdir(authDir, { recursive: true, mode: 0o700 });
await chmod(authDir, 0o700);
console.log('افتح واتساب في الرقم الثانوي ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح QR.');

async function pair() {
  const { socket, DisconnectReason } = await openSocket(authDir);
  socket.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') {
      console.log('تم ربط حساب واتساب بنجاح. أوقف هذا الأمر وشغّل الخدمة.');
      setTimeout(() => process.exit(0), 1000);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.restartRequired) {
        console.log('واتساب طلب إعادة تشغيل الاتصال بعد الربط؛ جارٍ المتابعة تلقائيًا…');
        setTimeout(() => pair().catch(() => process.exit(1)), 1000);
      } else {
        console.error(`تعذر الربط (code ${code || 'unknown'}).`);
        setTimeout(() => process.exit(1), 200);
      }
    }
  });
}

await pair();

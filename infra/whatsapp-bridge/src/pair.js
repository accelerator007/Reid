import { mkdir, chmod } from 'node:fs/promises';
import qrcode from 'qrcode-terminal';
import { openSocket } from './socket.js';

const authDir = process.env.REID_BRIDGE_AUTH_DIR || './auth';
await mkdir(authDir, { recursive: true, mode: 0o700 });
await chmod(authDir, 0o700);
const { socket } = await openSocket(authDir);

console.log('افتح واتساب في الرقم الثانوي ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح QR.');
socket.ev.on('connection.update', ({ connection, qr }) => {
  if (qr) qrcode.generate(qr, { small: true });
  if (connection === 'open') {
    console.log('تم ربط حساب واتساب الثانوي بنجاح. أوقف هذا الأمر وشغّل الخدمة.');
    setTimeout(() => process.exit(0), 1000);
  }
});

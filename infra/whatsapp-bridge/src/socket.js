import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

export async function openSocket(authDir) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    auth: state,
    version,
    browser: ['Reid Bridge', 'Chrome', '1.0.0'],
    logger: pino({ level: process.env.REID_BRIDGE_LOG_LEVEL || 'warn' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  socket.ev.on('creds.update', saveCreds);
  return { socket, DisconnectReason };
}

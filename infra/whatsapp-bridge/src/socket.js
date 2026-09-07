import { NodeCache } from '@cacheable/node-cache';
import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const retryCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 5000 });
const messageCache = new Map();
const messageKey = (key = {}) => `${key.remoteJid || ''}:${key.id || ''}`;

export function rememberMessage(item) {
  if (!item?.key?.id || !item.message) return;
  messageCache.set(messageKey(item.key), { message: item.message, at: Date.now() });
  if (messageCache.size > 500) {
    const oldest = [...messageCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, messageCache.size - 500);
    for (const [key] of oldest) messageCache.delete(key);
  }
}

export async function openSocket(authDir) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  // Pairing is sensitive to WhatsApp Web's rapidly moving protocol version.
  // The library release version may lag even when reported as latest.
  const { version } = await fetchLatestWaWebVersion();
  const logger = pino({ level: process.env.REID_BRIDGE_LOG_LEVEL || 'warn' });
  const socket = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    browser: ['Reid Bridge', 'Chrome', '1.0.0'],
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => true,
    msgRetryCounterCache: retryCache,
    maxMsgRetryCount: 5,
    retryRequestDelayMs: 500,
    getMessage: async (key) => messageCache.get(messageKey(key))?.message || proto.Message.fromObject({}),
  });
  socket.ev.on('creds.update', saveCreds);
  return { socket, DisconnectReason };
}

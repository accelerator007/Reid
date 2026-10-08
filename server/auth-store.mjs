import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';

export function createAuthStore(directory, secret) {
  if (!/^[a-f0-9]{64}$/.test(secret || '')) throw new Error('SESSION_KEY must be a random 32-byte hex key');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(`${directory}/session.sqlite`);
  chmodSync(`${directory}/session.sqlite`, 0o600);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const key = Buffer.from(secret, 'hex');
  function read(id) {
    const row = db.prepare('SELECT value FROM auth WHERE id=?').get(id);
    if (!row) return null;
    const [iv, tag, data] = row.value.split('.').map(x => Buffer.from(x, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString(), BufferJSON.reviver);
  }
  function write(id, value) {
    if (value == null) { db.prepare('DELETE FROM auth WHERE id=?').run(id); return; }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const encoded = Buffer.concat([cipher.update(JSON.stringify(value, BufferJSON.replacer)), cipher.final()]);
    db.prepare('INSERT OR REPLACE INTO auth VALUES (?,?)').run(id, [iv, cipher.getAuthTag(), encoded].map(x => x.toString('base64')).join('.'));
  }
  const creds = read('creds') || initAuthCreds();
  return {
    state: { creds, keys: {
      get: async (type, ids) => Object.fromEntries(ids.map(id => {
        let value = read(`${type}:${id}`);
        if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
        return [id, value];
      })),
      set: async data => {
        db.exec('BEGIN');
        try { for (const [type, values] of Object.entries(data)) for (const [id, value] of Object.entries(values)) write(`${type}:${id}`, value); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    } },
    save: () => write('creds', creds),
    clear: () => db.exec('DELETE FROM auth'),
    close: () => db.close(),
  };
}

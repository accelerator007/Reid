import { inflateRawSync } from 'node:zlib';

// Minimal reader for the OOXML containers the artifact tests inspect. Reading
// the real bytes back is the only way to prove a document kept its Arabic; a
// byte-length assertion passes on a file with no readable text at all.
export function readZip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('zip_end_record_missing');
  const total = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('zip_central_record_missing');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const localExtraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressed);
    files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export const zipText = (buffer, name) => {
  const file = readZip(buffer).get(name);
  if (!file) throw new Error(`zip_entry_missing_${name}`);
  return file.toString('utf8');
};

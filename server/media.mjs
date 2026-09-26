// Voice notes and photos reach the assistant through the same local adapter
// that already serves chat: Whisper for audio, the vision-capable chat model
// for images. Nothing is sent to a third party, and nothing is stored at rest.
export const mediaLimits = { audio: 16 * 1024 * 1024, image: 5 * 1024 * 1024 };

export function mediaPlaceholder(kind, caption = '') {
  const text = String(caption || '').trim();
  if (text) return text.slice(0, 8000);
  return kind === 'audio' ? 'رسالة صوتية' : 'صورة';
}

export function transcriptBody(transcript, caption = '') {
  const note = String(caption || '').trim();
  const text = String(transcript || '').trim();
  return (note ? `${note}\n\nتفريغ التسجيل:\n${text}` : text).slice(0, 8000);
}

export async function transcribeAudio(buffer, mimetype, { url, token, fetchImpl = fetch, timeout = 180_000 } = {}) {
  if (!buffer?.length) throw new Error('audio_empty');
  if (buffer.length > mediaLimits.audio) throw new Error('audio_too_large');
  const response = await fetchImpl(`${url}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-reid-origin-token': token },
    body: JSON.stringify({ audio: buffer.toString('base64'), mimetype: mimetype || 'audio/ogg' }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`transcribe_${response.status}`);
  const text = String((await response.json())?.text || '').trim();
  if (!text) throw new Error('empty_transcript');
  return text.slice(0, 8000);
}

// Inbound photos are held in memory only for as long as the job that answers
// them. Writing a sender's photo into company storage would create a new
// category of personal data at rest for a message that is answered in seconds.
export function createImageCache({ max = 12, ttl = 10 * 60_000, now = Date.now } = {}) {
  const entries = new Map();
  const sweep = () => {
    const moment = now();
    for (const [key, value] of entries) if (value.until <= moment) entries.delete(key);
    while (entries.size > max) entries.delete(entries.keys().next().value);
  };
  return {
    set(key, value) { if (!key || !value) return; entries.delete(key); entries.set(key, { value, until: now() + ttl }); sweep(); },
    take(key) {
      sweep();
      const found = entries.get(key);
      if (!found) return null;
      entries.delete(key);
      return found.value;
    },
    get size() { sweep(); return entries.size; },
  };
}

// Voice notes and photos reach the assistant through the same local adapter
// that already serves chat: Whisper for audio, the vision-capable chat model
// for images. Nothing is sent to a third party, and nothing is stored at rest.
export const mediaLimits = { audio: 16 * 1024 * 1024, image: 5 * 1024 * 1024, document: 12 * 1024 * 1024 };

export function spokenLanguage(text) {
  const value = String(text || '');
  const letters = value.match(/[\p{L}]/gu)?.length || 0;
  const arabic = value.match(/[؀-ۿ]/g)?.length || 0;
  return letters && arabic / letters >= 0.2 ? 'ar' : 'en';
}

// Voice output is explicit so Reid never floods a conversation with audio.
// The request may be Arabic, English, or the common Gulf "فويس" shorthand.
export function voiceRequested(text) {
  const value = String(text || '').trim();
  return /(?:^|\s)(?:رد|جاوب|أرسل|ارسل|سجّل|سجل|تكلم|كلمني|قلها)(?:.|\n){0,60}(?:بصوت|صوتي|رسالة\s+صوتية|فويس)/iu.test(value)
    || /(?:^|\s)(?:رسالة\s+صوتية|فويس)(?:.|\n){0,30}(?:تقول|عن|بخصوص)/iu.test(value)
    || /\b(?:reply|answer|send|record|say)(?:.|\n){0,50}\b(?:voice|audio)(?:\s+(?:note|message))?\b/iu.test(value);
}

// A short, direct command changes the default reply format until the same
// person changes it again. Longer requests such as "ارسل فويس تقول..." stay
// one-off voice-note requests and must not silently change a durable setting.
export function replyModeCommand(text) {
  const value=String(text||'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/[.!؟?،,]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/^(?:يا\s+)?(?:ريد|ريّد|reid)\s+/iu,'')
    .trim();
  if(!value||value.length>100)return null;
  if(/^(?:(?:خلاص|من\s+الحين)\s+)?(?:اكتب|اكتبلي|رد\s+(?:كتابة|كتابه|نص)|خل(?:ي)?\s+ردودك\s+(?:كتابة|كتابه|نص)|كل\s+شي\s+(?:كتابة|كتابه|نص)|text|reply\s+(?:in|with)\s+text)$/iu.test(value))return 'text';
  if(/(?:كل\s+شي|كل\s+الردود|ردودك).*(?:فويس|بصوت|صوتي)/iu.test(value))return 'voice';
  if(/^(?:ارسل|أرسل|رد|جاوب)\s+(?:لي\s+)?(?:فويس|بصوت|صوتي|رسالة\s+صوتية)(?:\s+(?:دايم|دائم|دائما|دائمًا|خلاص|كامل))?$|^(?:خلاص\s+)?كل\s+شي\s+(?:فويس|بصوت|صوتي)|^خل(?:ي)?\s+ردودك\s+(?:فويس|بصوت|صوتي)|^(?:always\s+)?reply\s+(?:in|with)\s+(?:voice|audio)$/iu.test(value))return 'voice';
  return null;
}

export function voiceReplyWanted(text,{savedMode='text',globalEnabled=true,voiceEnabled=true}={}) {
  return Boolean(globalEnabled&&voiceEnabled&&(savedMode==='voice'||voiceRequested(text)));
}

// When the sender supplies the words to record, preserve them verbatim. This
// avoids a language model adding a preface or denying a capability that the
// voice pipeline is already performing.
export function voiceScript(text) {
  const value = String(text || '').trim();
  const arabic = /(?:رسالة\s+صوتية|فويس)(?:\s+(?:قصيرة|قصيره))?\s+(?:تقول|يقول)\s*[:：-]?\s*([\s\S]{1,1500})$/iu.exec(value);
  if (arabic) return arabic[1].trim();
  const english = /(?:voice|audio)(?:\s+(?:note|message))?\s+(?:saying|that\s+says|say)\s*[:：-]?\s*([\s\S]{1,1500})$/iu.exec(value);
  return english?.[1]?.trim() || null;
}

export async function synthesizeVoice(text, { url, fetchImpl = fetch, timeout = 90_000 } = {}) {
  const body = String(text || '').trim();
  if (!body || body.length > 1800) throw new Error('voice_text_invalid');
  const response = await fetchImpl(`${url}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: body, language: spokenLanguage(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`voice_${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 64 || audio.subarray(0, 4).toString('ascii') !== 'OggS') throw new Error('voice_invalid_audio');
  return audio;
}

export function mediaPlaceholder(kind, caption = '') {
  const text = String(caption || '').trim();
  if (text) return text.slice(0, 8000);
  if (kind === 'audio') return 'رسالة صوتية';
  if (kind === 'document') return 'ملف';
  return 'صورة';
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

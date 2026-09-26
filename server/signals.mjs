// Everything a person reads as "it noticed me" before the answer arrives: the
// read receipt, the eyes, the typing indicator, and an answer that lands as a
// couple of messages instead of one wall of text.
export const reactions = { received: '👀', done: '✅', delivered: '🎉' };

const breakpoints = ['\n\n', '\n', '. ', '! ', '? ', '؟ ', '، ', ', '];

export function splitReply(value, { limit = 900, max = 3 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  if (text.length <= limit) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > limit && chunks.length < max - 1) {
    const window = rest.slice(0, limit);
    let cut = -1;
    for (const mark of breakpoints) {
      const at = window.lastIndexOf(mark);
      if (at > limit * 0.35) { cut = at + (mark.startsWith('\n') ? 0 : mark.length); break; }
    }
    if (cut <= 0) cut = window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest.slice(0, 4000).trim());
  return chunks.filter(Boolean);
}

// Two chunks that arrive in the same millisecond read as a machine dumping a
// buffer. The pause is proportional to what was just said, and bounded so the
// assistant never feels slow on purpose.
export const pacingDelay = (text, { perChar = 9, min = 600, max = 2600 } = {}) =>
  Math.min(max, Math.max(min, String(text ?? '').length * perChar));

export function createTyping(socket, { interval = 8000, timer = setInterval, clear = clearInterval } = {}) {
  // WhatsApp expires a composing state after about ten seconds, so it has to be
  // refreshed for as long as the model is still thinking.
  return function typing(jid) {
    let stopped = false;
    // A closed socket must never surface as a failed reply; the indicator is a
    // courtesy, not part of delivery.
    const send = state => { try { Promise.resolve(socket?.sendPresenceUpdate?.(state, jid)).catch(() => {}); } catch { /* presence is best effort */ } };
    send('composing');
    const handle = timer(() => { if (!stopped) send('composing'); }, interval);
    return () => { if (stopped) return; stopped = true; clear(handle); send('paused'); };
  };
}

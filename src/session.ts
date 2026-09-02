export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

export function isSessionIdle(lastActivity: number, now = Date.now(), timeout = IDLE_TIMEOUT_MS) {
  return now - lastActivity >= timeout;
}

export function installIdleTimeout(onIdle: () => void, timeout = IDLE_TIMEOUT_MS) {
  let timer = window.setTimeout(onIdle, timeout);
  const reset = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onIdle, timeout);
  };
  const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  events.forEach(event => window.addEventListener(event, reset, { passive: true }));
  return () => {
    window.clearTimeout(timer);
    events.forEach(event => window.removeEventListener(event, reset));
  };
}


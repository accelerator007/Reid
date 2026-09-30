// Small interaction pieces the forms pages share: a switch, a counter that
// counts up, reveal-on-scroll, a menu that becomes a bottom sheet on phones,
// toasts, and the press ripple. Motion uses transform and opacity only and
// stops for people who ask for reduced motion.
import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

/**
 * Where overlays mount: inside the app root, which carries the theme class
 * (.dark) and the reading direction, rather than bare <body>.
 */
export const overlayRoot = () => document.querySelector<HTMLElement>('.app') ?? document.body;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="fx-switch-row">
      <span className="fx-switch-row__text">
        <label htmlFor={id}>{label}</label>
        {description && <small>{description}</small>}
      </span>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} className="fx-switch" onClick={() => onChange(!checked)}>
        <span className="fx-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Counts up to value once it scrolls into view. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = React.useState(reduced() ? value : 0);
  const node = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (reduced()) { setShown(value); return; }
    let frame = 0;
    const start = (from: number) => {
      const began = performance.now();
      const tick = (time: number) => {
        const progress = Math.min(1, (time - began) / 700);
        const eased = 1 - (1 - progress) ** 3;
        setShown(from + (value - from) * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const target = node.current;
    if (!target || typeof IntersectionObserver !== 'function') { setShown(value); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(0); }
    });
    observer.observe(target);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <span ref={node}>{shown.toFixed(decimals)}</span>;
}

/**
 * Fades children in as they reach the viewport, staggered only among those
 * arriving together, then drops the animation class so hover effects are free.
 */
export function useReveal<T extends HTMLElement>(deps: React.DependencyList) {
  const root = React.useRef<T>(null);
  React.useEffect(() => {
    const container = root.current;
    if (!container || reduced() || typeof IntersectionObserver !== 'function') return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])'));
    items.forEach(item => item.classList.add('fx-reveal'));
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        const item = entry.target as HTMLElement;
        observer.unobserve(item);
        item.style.animationDelay = `${index * 60}ms`;
        item.classList.add('fx-reveal--in');
        item.dataset.revealed = 'true';
        item.addEventListener('animationend', () => { item.classList.remove('fx-reveal', 'fx-reveal--in'); item.style.animationDelay = ''; }, { once: true });
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return root;
}

/** A ripple from where a pointer pressed, for elements marked data-ripple. */
export function useRipple() {
  React.useEffect(() => {
    if (reduced()) return;
    const press = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ripple]');
      if (!target || (target as HTMLButtonElement).disabled) return;
      const box = target.getBoundingClientRect();
      const size = Math.max(box.width, box.height) * 2;
      const wave = document.createElement('span');
      wave.className = 'fx-ripple';
      wave.style.cssText = `inline-size:${size}px;block-size:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
      target.append(wave);
      wave.addEventListener('animationend', () => wave.remove(), { once: true });
    };
    document.addEventListener('pointerdown', press);
    return () => document.removeEventListener('pointerdown', press);
  }, []);
}

/** Animates list items from their old position to the new one (FLIP) when the order changes. */
export function useFlip<T extends HTMLElement>(keys: string[]) {
  const root = React.useRef<T>(null);
  const last = React.useRef(new Map<string, number>());
  React.useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-flip]'));
    const next = new Map(items.map(item => [item.dataset.flip!, item.getBoundingClientRect().top]));
    if (!reduced()) {
      for (const item of items) {
        const before = last.current.get(item.dataset.flip!);
        const after = next.get(item.dataset.flip!);
        if (before == null || after == null || Math.abs(before - after) < 1) continue;
        item.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    last.current = next;
  }, [keys.join('|')]);
  return root;
}

// ---- menu / bottom sheet ---------------------------------------------------------------

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; hidden?: boolean };

/**
 * A menu anchored to its button on a wide screen and a bottom sheet on a
 * phone. Position is computed from clientWidth, not innerWidth, so a
 * scrollbar never pushes it off the page.
 */
export function Menu({ label, trigger, items, dir }: { label: string; trigger: React.ReactNode; items: MenuItem[]; dir: 'rtl' | 'ltr' }) {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<{ top: number; left: number } | null>(null);
  const sheet = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  const shown = items.filter(item => !item.hidden);

  React.useLayoutEffect(() => {
    if (!open || sheet || !button.current || !panel.current) return;
    const box = button.current.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    const preferred = dir === 'rtl' ? box.left : box.right - width;
    const left = Math.max(8, Math.min(viewport - width - 8, preferred));
    const below = box.bottom + 6;
    const top = below + panel.current.offsetHeight > window.innerHeight - 8 ? Math.max(8, box.top - panel.current.offsetHeight - 6) : below;
    setPlace({ top, left });
  }, [open, sheet, dir]);
  React.useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && (panel.current?.contains(event.target as Node) || button.current?.contains(event.target as Node))) return;
      setOpen(false);
      if (event instanceof KeyboardEvent) button.current?.focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    // Safari fires resize while scrolling as its toolbar hides, so only the
    // anchored menu (which would drift) closes on a real width change.
    const width = document.documentElement.clientWidth;
    const resize = () => { if (!sheet && document.documentElement.clientWidth !== width) setOpen(false); };
    addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); removeEventListener('resize', resize); };
  }, [open, sheet]);
  const onKey = (event: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const all = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    all[next]?.focus();
  };
  return (
    <>
      <button ref={button} type="button" className="fx-menu-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {trigger}
      </button>
      {open && createPortal(
        <div className={sheet ? 'fx-sheet-layer' : 'fx-menu-layer'} dir={dir}>
          {sheet && <button type="button" className="fx-sheet-scrim" aria-label={label} onClick={() => setOpen(false)} />}
          <div ref={panel} role="menu" aria-label={label} className={sheet ? 'fx-sheet' : 'fx-menu'} onKeyDown={onKey}
            style={!sheet && place ? { top: place.top, left: place.left } : !sheet ? { visibility: 'hidden' } : undefined}>
            {sheet && <span className="fx-sheet__grip" aria-hidden="true" />}
            {shown.map(item => (
              <button key={item.label} type="button" role="menuitem" className="fx-menu__item" data-danger={item.danger || undefined}
                onClick={() => { setOpen(false); item.onSelect(); }}>
                {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.label}
              </button>
            ))}
          </div>
        </div>,
        overlayRoot(),
      )}
    </>
  );
}

// ---- toasts -----------------------------------------------------------------------------

type Toast = { id: number; tone: 'success' | 'danger'; text: string };
const ToastContext = React.createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => React.useContext(ToastContext);

/** Toasts at the top on a phone (away from the thumb bar), at the bottom elsewhere. */
export function ToastProvider({ children, closeLabel }: { children: React.ReactNode; closeLabel: string }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);
  const push = React.useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = (counter.current += 1);
    setToasts(list => [...list.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setToasts(list => list.filter(toast => toast.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="fx-toasts" role="status" aria-live="polite">
          {toasts.map(toast => (
            <div key={toast.id} className="fx-toast" data-tone={toast.tone}>
              {toast.tone === 'success' ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              <span>{toast.text}</span>
              <button type="button" aria-label={closeLabel} onClick={() => setToasts(list => list.filter(item => item.id !== toast.id))}><X /></button>
            </div>
          ))}
        </div>,
        overlayRoot(),
      )}
    </ToastContext.Provider>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

/** Shrinks a photo to at most `edge` pixels as JPEG before upload; other files pass through. */
export async function compressImage(file: File, edge = 1600, quality = 0.85): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) { bitmap.close(); return file; }
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

/** A textarea that grows with its text. */
export function AutoTextArea({ value, onChange, className, placeholder, label, maxLength }: {
  value: string; onChange: (value: string) => void; className?: string; placeholder?: string; label: string; maxLength?: number;
}) {
  const node = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const area = node.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);
  return <textarea ref={node} rows={1} className={className} value={value} maxLength={maxLength} dir="auto" placeholder={placeholder} aria-label={label} onChange={event => onChange(event.target.value)} />;
}

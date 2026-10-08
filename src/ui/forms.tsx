// Form building blocks, a modal dialog and tabs for the UI kit.
import React from 'react';
import { X } from 'lucide-react';

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

export function Field({ label, hint, required, wide, children }: {
  label: string; hint?: string; required?: boolean; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <label className={cx('ui-field', wide && 'ui-field--wide')}>
      <span className="ui-field__label">{label}{required && <b aria-hidden="true"> *</b>}</span>
      {children}
      {hint && <small className="ui-field__hint">{hint}</small>}
    </label>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx('ui-input', className)} />;
  },
);

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={cx('ui-input', 'ui-textarea', className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx('ui-input', 'ui-select', className)}>{children}</select>;
}

export function Checkbox({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-check"><input type="checkbox" {...rest} /><span>{label}</span></label>;
}

/** A form laid out on the kit's two-column grid with one submit row. */
export function FormGrid({ onSubmit, children, submit, busy, cancel }: {
  onSubmit: (data: FormData, form: HTMLFormElement) => void | Promise<void>;
  children: React.ReactNode; submit: string; busy?: boolean; cancel?: { label: string; onClick: () => void };
}) {
  return (
    <form className="ui-form" onSubmit={event => { event.preventDefault(); void onSubmit(new FormData(event.currentTarget), event.currentTarget); }}>
      <div className="ui-form__grid">{children}</div>
      <div className="ui-form__actions">
        {cancel && <button type="button" className="ui-button ui-button--ghost ui-button--md" onClick={cancel.onClick}>{cancel.label}</button>}
        <button type="submit" className="ui-button ui-button--primary ui-button--md" disabled={busy} aria-busy={busy || undefined}>{submit}</button>
      </div>
    </form>
  );
}

/**
 * Modal dialog: focus moves in on open and back to the opener on close,
 * Tab stays inside, Escape and the backdrop close it.
 */
export function Dialog({ open, title, description, onClose, closeLabel, children, size = 'md' }: {
  open: boolean; title: string; description?: string; onClose: () => void; closeLabel: string;
  children: React.ReactNode; size?: 'md' | 'lg';
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, select, textarea, button:not(.ui-dialog__close)');
    (first || panel)?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; opener?.focus?.(); };
  }, [open]);
  if (!open) return null;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const [first, last] = [focusable[0], focusable[focusable.length - 1]];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return (
    <div className="ui-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className={cx('ui-dialog', `ui-dialog--${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="ui-dialog__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="ui-dialog__close ui-icon-button" onClick={onClose} aria-label={closeLabel}><X aria-hidden="true" /></button>
        </div>
        <div className="ui-dialog__body">{children}</div>
      </div>
    </div>
  );
}

export type TabItem<T extends string> = { id: T; label: string; count?: number; icon?: React.ReactNode };

/** Tabs with the WAI-ARIA keyboard pattern (arrows, Home, End). */
export function Tabs<T extends string>({ items, value, onChange, label, dir = 'rtl' }: {
  items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; dir?: 'rtl' | 'ltr';
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (index: number) => {
    const next = items[(index + items.length) % items.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) { event.preventDefault(); move(index + 1); }
    else if (event.key === backward) { event.preventDefault(); move(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); move(0); }
    else if (event.key === 'End') { event.preventDefault(); move(items.length - 1); }
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id} ref={element => { refs.current[item.id] = element; }} type="button" role="tab"
          id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={item.id === value} tabIndex={item.id === value ? 0 : -1}
          className="ui-tab" onClick={() => onChange(item.id)} onKeyDown={event => onKeyDown(event, index)}
        >
          {item.icon && <span aria-hidden="true">{item.icon}</span>}
          {item.label}
          {item.count !== undefined && <span className="ui-tab__count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return <div className="ui-tabpanel" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>;
}

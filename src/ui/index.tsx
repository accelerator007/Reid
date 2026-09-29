// Reid UI kit: the shared building blocks for rebuilt pages. Headers are divs
// on purpose: style.css still styles every <header> as the public top bar.
// Every component takes its colours, spacing and radii from tokens.css, works
// in both reading directions, and exposes its state to assistive technology.
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ui.css';

export type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  busy?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon, busy = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {icon && <span className="ui-button__icon" aria-hidden="true">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: React.ReactNode };

export function IconButton({ label, icon, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" {...rest} className={cx('ui-icon-button', className)} aria-label={label} title={label}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

export function Badge({ tone = 'neutral', children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return <span className={cx('ui-badge', `ui-tone--${tone}`)}>{dot && <i aria-hidden="true" />}{children}</span>;
}

export function Card({ as: Tag = 'section', className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'article' | 'div' }) {
  return <Tag {...rest} className={cx('ui-card', className)}>{children}</Tag>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="ui-section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="ui-page-header">
      <div>
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}

type StatProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  onOpen?: () => void;
  loading?: boolean;
};

/** A metric that opens the list it counts. */
export function StatCard({ icon, label, value, hint, tone = 'neutral', onOpen, loading = false }: StatProps) {
  const body = (
    <>
      <span className={cx('ui-stat__icon', `ui-tone--${tone}`)} aria-hidden="true">{icon}</span>
      <span className="ui-stat__label">{label}</span>
      <strong className="ui-stat__value">{loading ? <span className="ui-skeleton ui-skeleton--value" /> : value}</strong>
      {hint && <span className="ui-stat__hint">{hint}</span>}
    </>
  );
  return onOpen
    ? <button type="button" className={cx('ui-stat', 'ui-stat--link', tone !== 'neutral' && `ui-stat--${tone}`)} onClick={onOpen}>{body}</button>
    : <div className={cx('ui-stat', tone !== 'neutral' && `ui-stat--${tone}`)}>{body}</div>;
}

type RowProps = {
  icon?: React.ReactNode;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  onOpen?: () => void;
  dir?: 'rtl' | 'ltr';
};

/** A list row. With onOpen it is a button and shows a direction-aware chevron. */
export function ListRow({ icon, tone = 'neutral', title, description, meta, onOpen, dir = 'rtl' }: RowProps) {
  const content = (
    <>
      {icon && <span className={cx('ui-row__icon', `ui-tone--${tone}`)} aria-hidden="true">{icon}</span>}
      <span className="ui-row__text">
        <span className="ui-row__title">{title}</span>
        {description && <span className="ui-row__description">{description}</span>}
      </span>
      {meta && <span className="ui-row__meta">{meta}</span>}
      {onOpen && <span className="ui-row__chevron" aria-hidden="true">{dir === 'rtl' ? <ChevronLeft /> : <ChevronRight />}</span>}
    </>
  );
  return onOpen
    ? <button type="button" className="ui-row ui-row--link" onClick={onOpen}>{content}</button>
    : <div className="ui-row">{content}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="ui-empty">
      <span className="ui-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ui-skeleton-group" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} className="ui-skeleton" />)}
    </div>
  );
}

export function InlineAlert({ tone = 'danger', children, action }: { tone?: Tone; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className={cx('ui-alert', `ui-tone--${tone}`)} role="alert"><span>{children}</span>{action}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

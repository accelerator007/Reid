// Ctrl/⌘+K: find any destination by name and open it from the keyboard.
// A modal dialog with a combobox and a listbox, following the WAI-ARIA
// pattern: arrows move the active option, Enter opens it, Escape closes.
import React from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from '../ui';

export type CommandItem = { id: string; label: string; group: string; icon?: React.ReactNode };

const normalize = (value: string) =>
  value.toLocaleLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function CommandMenu({ lang, open, items, close, choose }: {
  lang: 'ar' | 'en'; open: boolean; items: CommandItem[]; close: () => void; choose: (id: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      returnFocus.current?.focus?.();
    }
  }, [open]);

  const results = React.useMemo(() => {
    const wanted = normalize(query.trim());
    return wanted ? items.filter(item => normalize(`${item.label} ${item.group}`).includes(wanted)) : items;
  }, [items, query]);
  React.useEffect(() => setActive(0), [query]);

  if (!open) return null;
  const rtl = lang === 'ar';
  const pick = (index: number) => { const item = results[index]; if (item) { close(); choose(item.id); } };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(results.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); pick(active); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') { event.preventDefault(); } // focus stays in the dialog
  };

  let lastGroup = '';
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="command" role="dialog" aria-modal="true" aria-label={rtl ? 'البحث والانتقال' : 'Search and jump'}>
        <label className="command__search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown}
            placeholder={rtl ? 'اكتب اسم صفحة…' : 'Type a page name…'} role="combobox" aria-expanded="true"
            aria-controls={listId} aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <Kbd>Esc</Kbd>
        </label>
        <div className="command__list" id={listId} role="listbox" aria-label={rtl ? 'الصفحات' : 'Pages'}>
          {results.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {heading && <div className="command__group" role="presentation">{heading}</div>}
                <div
                  id={`${listId}-${item.id}`} role="option" aria-selected={index === active}
                  className="command__option" onMouseEnter={() => setActive(index)} onMouseDown={event => { event.preventDefault(); pick(index); }}
                >
                  <span className="command__icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {index === active && <CornerDownLeft className="command__enter" aria-hidden="true" />}
                </div>
              </React.Fragment>
            );
          })}
          {!results.length && <p className="command__empty">{rtl ? 'لا توجد صفحة بهذا الاسم.' : 'No page matches.'}</p>}
        </div>
      </div>
    </div>
  );
}

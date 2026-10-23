// Ctrl/⌘+K: find any destination by name and open it from the keyboard.
// A modal dialog with a combobox and a listbox, following the WAI-ARIA
// pattern: arrows move the active option, Enter opens it, Escape closes.
import React from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from '../ui';
import { supabase } from '../supabase';
import { list } from '../db';

export type CommandItem = { id: string; label: string; group: string; icon?: React.ReactNode; href?:string };

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
  const [records,setRecords]=React.useState<CommandItem[]>([]),[searching,setSearching]=React.useState(false),[searchError,setSearchError]=React.useState(false);
  const permissions=items.map(item=>item.id).join(',');
  React.useEffect(()=>{
    const wanted=query.trim().slice(0,80);let cancelled=false;
    setRecords([]);setSearchError(false);setSearching(false);
    if(!open||wanted.length<2||!supabase)return;
    const timer=setTimeout(async()=>{
      setSearching(true);const client=supabase!;
      const pattern=`%${wanted.replace(/[\\%_]/g,'\\$&')}%`;
      const queries:Promise<CommandItem[]>[]=[];
      const add=(page:string,table:string,column:string,fields:string,group:string,map:(row:any)=>CommandItem)=>{
        if(!permissions.split(',').includes(page))return;
        queries.push(list<any>(client.from(table).select(fields).ilike(column,pattern).limit(5)).then(result=>{if(!result.ok)throw result.error;return result.data.map(row=>({...map(row),group}));}));
      };
      // Uses the viewer's Supabase session and RLS. No privileged search proxy.
      add('workspace','profiles','full_name','id,full_name',lang==='ar'?'الأشخاص':'People',row=>({id:`person-${row.id}`,label:row.full_name,href:`/workspace?person=${encodeURIComponent(row.id)}`,group:''}));
      add('projects','projects','name','id,name',lang==='ar'?'المشاريع':'Projects',row=>({id:`project-${row.id}`,label:row.name,href:`/projects/${encodeURIComponent(row.id)}`,group:''}));
      add('inbox','qr_conversations','display_name','id,display_name',lang==='ar'?'المحادثات':'Conversations',row=>({id:`chat-${row.id}`,label:row.display_name,href:`/inbox?chat=${encodeURIComponent(row.id)}`,group:''}));
      add('dashboard','agent_runs','agent_id','id,agent_id,run_state',lang==='ar'?'تشغيلات الوكلاء':'Agent runs',row=>({id:`run-${row.id}`,label:`${row.agent_id} · ${row.run_state} · ${row.id.slice(0,8)}`,href:`/dashboard?tab=runs&run=${encodeURIComponent(row.id)}`,group:''}));
      const results=await Promise.allSettled(queries);
      if(!cancelled){setRecords(results.flatMap(result=>result.status==='fulfilled'?result.value:[]));setSearchError(results.some(result=>result.status==='rejected'));setSearching(false);}
    },300);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[open,query,permissions,lang]);

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
    return wanted ? [...items.filter(item => normalize(`${item.label} ${item.group}`).includes(wanted)),...records] : items;
  }, [items, query,records]);
  React.useEffect(() => setActive(0), [query]);

  if (!open) return null;
  const rtl = lang === 'ar';
  const pick = (index: number) => { const item = results[index]; if (item) { close(); if(item.href)location.assign(item.href);else choose(item.id); } };
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
            placeholder={rtl ? 'ابحث عن صفحة، شخص، مشروع أو محادثة…' : 'Find a page, person, project or conversation…'} role="combobox" aria-expanded="true"
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
          {searching&&<p role="status">{rtl?'جارٍ البحث…':'Searching…'}</p>}
          {searchError&&<p role="status">{rtl?'تعذر البحث في بعض الأقسام. النتائج المتاحة ظاهرة.':'Some sections could not be searched. Available results are shown.'}</p>}
          {!results.length&&!searching && <p className="command__empty">{rtl ? 'لا توجد نتائج متاحة لك.' : 'No results available to you.'}</p>}
        </div>
      </div>
    </div>
  );
}

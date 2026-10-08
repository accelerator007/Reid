// /operations — support requests, leave, goals, decisions, content, assets and
// contracts. One query loads every type the person may see, so each tab shows
// its count; the database still decides which rows come back.
import React from 'react';
import { BadgeCheck, BriefcaseBusiness, CalendarDays, FileSignature, Flag, LifeBuoy, Megaphone, Package, Plane, Plus, Search, X } from 'lucide-react';
import { list, messageFor, run, toAppError, type AppError } from '../db';
import { useSession } from '../shell';
import { supabase } from '../supabase';
import { Badge, Button, Dialog, EmptyState, Field, FormGrid, InlineAlert, Select, Skeleton, TabPanel, Tabs, TextArea, TextInput, type TabItem } from '../ui';
import {
  allowedKinds, filterRecords, isPastDue, statusOptions, workKinds, workStatuses,
  type Lang, type WorkKind, type WorkRecord, type WorkStatus,
} from './model';
import './work.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const kindIcons: Record<WorkKind, React.ReactNode> = {
  ticket: <LifeBuoy />, leave: <Plane />, goal: <Flag />, decision: <BadgeCheck />, content: <Megaphone />, asset: <Package />, contract: <FileSignature />,
};

export function Operations({ lang }: { lang: Lang }) {
  const { roles, user } = useSession();
  const kinds = allowedKinds(roles);
  const kindsKey = kinds.join(',');
  const [kind, setKind] = React.useState<WorkKind>(kinds[0] ?? 'ticket');
  const [status, setStatus] = React.useState<'all' | WorkStatus>('all');
  const [query, setQuery] = React.useState('');
  const [records, setRecords] = React.useState<WorkRecord[] | null>(null);
  const [people, setPeople] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<AppError | null>(null);
  const [creating, setCreating] = React.useState(() => new URLSearchParams(location.search).has('new'));

  const load = React.useCallback(async () => {
    if (!supabase) return;
    const [rows, profiles] = await Promise.all([
      list<WorkRecord>(supabase.from('work_records')
        .select('id,kind,title,description,status,owner_id,assigned_to,due_date,created_at')
        .in('kind', kindsKey.split(',')).order('created_at', { ascending: false }).limit(500)),
      list<{ id: string; full_name: string }>(supabase.from('profiles').select('id,full_name')),
    ]);
    if (rows.ok) setRecords(rows.data);
    if (profiles.ok) setPeople(Object.fromEntries(profiles.data.map(person => [person.id, person.full_name])));
    setError(rows.ok ? null : rows.error);
  }, [kindsKey]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const follow = () => { if (new URLSearchParams(location.search).has('new')) setCreating(true); };
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const change = async (record: WorkRecord, next: WorkStatus) => {
    if (!supabase) return;
    setRecords(current => current?.map(row => (row.id === record.id ? { ...row, status: next } : row)) ?? null);
    const result = await run(supabase.from('work_records').update({ status: next }).eq('id', record.id).select('id').single());
    if (!result.ok) setError(result.error);
    await load();
  };

  const ofKind = (records ?? []).filter(record => record.kind === kind);
  const visible = records ? filterRecords(records, kind, status, query) : [];
  const now = new Date();
  const tabs: TabItem<WorkKind>[] = kinds.map(value => ({
    id: value, label: workKinds[value].label[lang], icon: kindIcons[value],
    count: records ? records.filter(record => record.kind === value && !['done', 'cancelled'].includes(record.status)).length : undefined,
  }));

  return (
    <main className="work">
      <div className="work-head">
        <div>
          <h1>{tr(lang, 'المهام والطلبات', 'Tasks & requests')}</h1>
          <p>{tr(lang, 'كل طلب له صاحب وحالة وموعد، وسجل محفوظ.', 'Every request has an owner, a status, a date and a record.')}</p>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>{workKinds[kind].one[lang]} {tr(lang, 'جديد', 'new')}</Button>
      </div>

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'تحديث', 'Refresh')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <Tabs items={tabs} value={kind} onChange={value => { setKind(value); setStatus('all'); }} label={tr(lang, 'أنواع السجلات', 'Record types')} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <TabPanel id={kind}>
        <div className="work-toolbar">
          <label className="work-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, `ابحث في ${workKinds[kind].label.ar}…`, `Search ${workKinds[kind].label.en.toLowerCase()}…`)} aria-label={tr(lang, 'بحث', 'Search')} />
            {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
          </label>
          <div className="work-chips" role="group" aria-label={tr(lang, 'تصفية حسب الحالة', 'Filter by status')}>
            <button type="button" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>{tr(lang, 'الكل', 'All')} <span>{ofKind.length}</span></button>
            {(Object.keys(workStatuses) as WorkStatus[]).map(value => (
              <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>
                {workStatuses[value].label[lang]} <span>{ofKind.filter(record => record.status === value).length}</span>
              </button>
            ))}
          </div>
        </div>

        {!records && !error && <div className="work-list"><Skeleton lines={5} /></div>}
        {records && !visible.length && (
          <EmptyState
            icon={kindIcons[kind]}
            title={query || status !== 'all' ? tr(lang, 'لا توجد سجلات مطابقة', 'No matching records') : tr(lang, `لا توجد ${workKinds[kind].label.ar} بعد`, `No ${workKinds[kind].label.en.toLowerCase()} yet`)}
            description={workKinds[kind].hint[lang]}
            action={!query && status === 'all' ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>{workKinds[kind].one[lang]} {tr(lang, 'جديد', 'new')}</Button> : undefined}
          />
        )}
        <div className="work-list">
          {visible.map(record => {
            const state = workStatuses[record.status];
            const late = !['done', 'cancelled'].includes(record.status) && isPastDue(record.due_date, now);
            const options = statusOptions(record.kind, roles, record.status);
            return (
              <article className="work-record" key={record.id} data-status={record.status} data-late={late}>
                <span className={`work-record__icon ui-tone--${state.tone}`} aria-hidden="true">{kindIcons[record.kind]}</span>
                <div className="work-record__body">
                  <strong>{record.title}</strong>
                  {record.description && <p>{record.description}</p>}
                  <div className="work-record__meta">
                    <span>{people[record.owner_id] || '—'}</span>
                    {record.assigned_to && record.assigned_to !== record.owner_id && <span>{tr(lang, 'مسند إلى', 'Assigned to')} {people[record.assigned_to] || '—'}</span>}
                    {record.due_date && <span className="work-record__due"><CalendarDays aria-hidden="true" />{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${record.due_date}T12:00:00`))}</span>}
                    {late && <Badge tone="danger">{tr(lang, 'متأخر', 'Late')}</Badge>}
                  </div>
                </div>
                {options.length > 1 ? (
                  <Select className="work-record__status" value={record.status} aria-label={tr(lang, `حالة «${record.title}»`, `Status of “${record.title}”`)}
                    onChange={event => void change(record, event.target.value as WorkStatus)}>
                    {options.map(value => <option key={value} value={value}>{workStatuses[value].label[lang]}</option>)}
                  </Select>
                ) : <Badge tone={state.tone}>{state.label[lang]}</Badge>}
              </article>
            );
          })}
        </div>
        {kind === 'leave' && <LeaveNote lang={lang} roles={roles} />}
      </TabPanel>

      <NewRecordDialog lang={lang} kind={kind} open={creating} onClose={() => setCreating(false)}
        create={async fields => {
          if (!supabase || !user) return { ok: false as const, error: toAppError(new Error('supabase_unavailable')) };
          const result = await run(supabase.from('work_records').insert({ ...fields, kind, owner_id: user.id }).select('id').single());
          if (result.ok) await load();
          return result;
        }} />
    </main>
  );
}

function LeaveNote({ lang, roles }: { lang: Lang; roles: readonly string[] }) {
  if (roles.some(role => ['owner', 'super_admin', 'hr'].includes(role))) return null;
  return <p className="work-note"><BriefcaseBusiness aria-hidden="true" />{tr(lang, 'تعتمد الموارد البشرية أو الإدارة طلبات الإجازة؛ يمكنك فتح طلبك أو إلغاؤه.', 'HR or the owners approve leave; you can open or cancel your own request.')}</p>;
}

function NewRecordDialog({ lang, kind, open, onClose, create }: {
  lang: Lang; kind: WorkKind; open: boolean; onClose: () => void;
  create: (fields: { title: string; description: string; due_date: string | null }) => Promise<{ ok: true } | { ok: false; error: AppError }>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (open) setError(''); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={`${workKinds[kind].one[lang]} ${tr(lang, 'جديد', 'new')}`} description={workKinds[kind].hint[lang]}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <FormGrid busy={busy} submit={tr(lang, 'حفظ', 'Save')} cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }}
        onSubmit={async (data, form) => {
          setBusy(true);
          const result = await create({
            title: String(data.get('title') || '').trim(), description: String(data.get('description') || '').trim(),
            due_date: String(data.get('due') || '') || null,
          });
          setBusy(false);
          if (result.ok) { form.reset(); onClose(); } else setError(messageFor(result.error, lang));
        }}>
        <Field label={tr(lang, 'العنوان', 'Title')} required wide><TextInput name="title" required maxLength={250} /></Field>
        <Field label={kind === 'leave' ? tr(lang, 'تاريخ البداية', 'Start date') : tr(lang, 'تاريخ الاستحقاق', 'Due date')}><TextInput name="due" type="date" /></Field>
        <Field label={tr(lang, 'التفاصيل', 'Details')} wide><TextArea name="description" placeholder={kind === 'leave' ? tr(lang, 'المدة والسبب ومن يغطي عملك', 'Duration, reason and who covers') : ''} /></Field>
      </FormGrid>
    </Dialog>
  );
}

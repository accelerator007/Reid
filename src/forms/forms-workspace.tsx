// /forms — workshop forms for administrators. /forms is the home (my forms,
// shared with me), /forms/:id the editor, /forms/:id/responses and
// /forms/:id/settings its other tabs. A shared link to /forms/:id brings a
// collaborator straight back to the form after signing in.
import React from 'react';
import {
  BarChart3, ClipboardList, Copy, ExternalLink, FilePlus2, MoreHorizontal, Pencil, Plus, Search, Share2, Star, Trash2, UsersRound, X,
} from 'lucide-react';
import { messageFor, type AppError } from '../db';
import type { Page } from '../routes';
import { useSession } from '../shell';
import { Badge, Button, EmptyState, InlineAlert } from '../ui';
import * as api from './api';
import { AccessDialog, ConfirmDialog, ShareDialog, TemplatesDialog } from './form-dialogs';
import { FormEditor } from './form-editor';
import { CountUp, Menu, ToastProvider, useReveal, useRipple, useToast } from './forms-ui';
import { greeting, isOpen, questionsLine, relativeTime, responsesLine, answerable, type Form, type FormRole, type Lang } from './model';
import './forms.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

export type FormsRoute = { view: 'home' } | { view: 'form'; id: string; tab: 'questions' | 'responses' | 'settings' };
export function parseFormsPath(pathname: string): FormsRoute {
  const [, , id, tab] = pathname.replace(/\/+$/, '').split('/');
  if (!id) return { view: 'home' };
  return { view: 'form', id, tab: tab === 'responses' || tab === 'settings' ? tab : 'questions' };
}
export type Navigate = (path: string) => void;

export function FormsWorkspace({ lang }: { lang: Lang; go?: (page: Page) => void }) {
  const [route, setRoute] = React.useState(() => parseFormsPath(location.pathname));
  React.useEffect(() => {
    const follow = () => setRoute(parseFormsPath(location.pathname));
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);
  const navigate: Navigate = React.useCallback(path => {
    if (path !== location.pathname) history.pushState({}, '', path);
    setRoute(parseFormsPath(path));
    scrollTo({ top: 0 });
  }, []);
  useRipple();
  return (
    <ToastProvider closeLabel={tr(lang, 'إغلاق', 'Close')}>
      <div className="forms-view" key={route.view === 'home' ? 'home' : route.id}>
        {route.view === 'home'
          ? <FormsHome lang={lang} navigate={navigate} />
          : <FormEditor lang={lang} id={route.id} tab={route.tab} navigate={navigate} />}
      </div>
    </ToastProvider>
  );
}

type Status = 'all' | 'open' | 'closed';

function FormsHome({ lang, navigate }: { lang: Lang; navigate: Navigate }) {
  const { user } = useSession();
  const toast = useToast();
  const [data, setData] = React.useState<api.FormsData | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<'mine' | 'shared'>('mine');
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<Status>('all');
  const [templates, setTemplates] = React.useState(false);
  const [sharing, setSharing] = React.useState<Form | null>(null);
  const [access, setAccess] = React.useState<Form | null>(null);
  const [deleting, setDeleting] = React.useState<Form | null>(null);
  const [fabSmall, setFabSmall] = React.useState(false);
  const now = Date.now();

  const load = React.useCallback(async () => {
    if (!user) return;
    const result = await api.loadForms(user.id);
    if (result.data) setData(result.data);
    setError(result.error);
  }, [user]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let last = scrollY;
    const onScroll = () => { setFabSmall(scrollY > last && scrollY > 80); last = scrollY; };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  const mine = data?.forms.filter(form => form.owner_id === user?.id) ?? [];
  const shared = data?.forms.filter(form => form.owner_id !== user?.id) ?? [];
  const wanted = query.trim().toLocaleLowerCase();
  const shown = (tab === 'mine' ? mine : shared).filter(form =>
    (status === 'all' || (status === 'open') === isOpen(form, now))
    && (!wanted || `${form.title} ${form.description} ${form.workshop.name ?? ''} ${form.workshop.presenter ?? ''}`.toLocaleLowerCase().includes(wanted)));
  const grid = useReveal<HTMLDivElement>([tab, status, wanted, data]);

  const stats = React.useMemo(() => {
    const overview = data ? [...data.overview.values()] : [];
    const responses = overview.reduce((sum, row) => sum + row.responses, 0);
    const rated = overview.filter(row => row.rating_avg != null && row.responses > 0);
    const weight = rated.reduce((sum, row) => sum + row.responses, 0);
    const rating = weight ? rated.reduce((sum, row) => sum + (row.rating_avg ?? 0) * row.responses, 0) / weight : null;
    return { mine: mine.length, responses, rating, open: mine.filter(form => isOpen(form, now)).length };
  }, [data, mine, now]);

  const duplicate = async (form: Form) => {
    if (!user) return;
    const result = await api.duplicateForm(user.id, form, tr(lang, '(نسخة)', '(copy)'));
    if (!result.ok || !result.data) { toast(result.ok ? tr(lang, 'تعذّر النسخ.', 'Could not copy.') : messageFor(result.error, lang), 'danger'); return; }
    toast(tr(lang, 'أُنشئت نسخة مغلقة لا يشارك فيها أحد.', 'A closed copy, shared with nobody, was created.'));
    await load();
  };
  const remove = async (form: Form) => {
    const result = await api.deleteForm(form.id);
    if (!result.ok) { toast(messageFor(result.error, lang), 'danger'); return; }
    toast(tr(lang, 'حُذف النموذج وردوده.', 'The form and its responses were deleted.'));
    setDeleting(null);
    await load();
  };
  const first = (user?.user_metadata?.full_name as string | undefined)?.split(/\s+/)[0] ?? '';
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';

  return (
    <main className="forms-home">
      <section className="forms-hello">
        <span className="forms-hello__avatar" aria-hidden="true"><span>{Array.from(name.trim())[0] ?? '؟'}</span></span>
        <div className="forms-hello__text">
          <p>{greeting(new Date(), lang)}{first ? `، ${first}` : ''}</p>
          <h1>{tr(lang, 'النماذج', 'Forms')}</h1>
          <small><bdi>{user?.email}</bdi></small>
        </div>
        <Button variant="primary" icon={<Plus />} className="forms-hello__new" data-ripple onClick={() => setTemplates(true)}>{tr(lang, 'نموذج جديد', 'New form')}</Button>
      </section>

      <div className="forms-stats">
        <Stat label={tr(lang, 'نماذجي', 'My forms')} value={stats.mine} loading={!data} />
        <Stat label={tr(lang, 'إجمالي الردود', 'Total responses')} value={stats.responses} loading={!data} />
        <Stat label={tr(lang, 'متوسط التقييم', 'Average rating')} value={stats.rating} decimals={1} suffix={<Star aria-hidden="true" />} loading={!data} />
        <Stat label={tr(lang, 'تستقبل الآن', 'Open now')} value={stats.open} loading={!data} />
      </div>

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'أعد المحاولة', 'Try again')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <div className="forms-toolbar">
        <div className="forms-segment" role="tablist" aria-label={tr(lang, 'النماذج', 'Forms')} data-at={tab}>
          <span className="forms-segment__pill" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{tr(lang, 'نماذجي', 'My forms')} <b>{mine.length}</b></button>
          <button type="button" role="tab" aria-selected={tab === 'shared'} onClick={() => setTab('shared')}>{tr(lang, 'مشاركة معي', 'Shared with me')} <b>{shared.length}</b></button>
        </div>
        <label className="forms-search">
          <Search aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث في النماذج…', 'Search forms…')} aria-label={tr(lang, 'بحث', 'Search')} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
        </label>
        <div className="forms-chips" role="group" aria-label={tr(lang, 'الحالة', 'Status')}>
          {([['all', 'الكل', 'All'], ['open', 'يستقبل', 'Open'], ['closed', 'مغلق', 'Closed']] as const).map(([id, ar, en]) => (
            <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}>{tr(lang, ar, en)}</button>
          ))}
        </div>
      </div>

      <div className="forms-grid" ref={grid} role="tabpanel">
        {!data && !error && Array.from({ length: 6 }, (_, index) => <div key={index} className="form-card form-card--skeleton" aria-hidden="true"><span /><i /><i /><i /></div>)}
        {data && shown.map(form => (
          <FormCard key={form.id} lang={lang} form={form} role={data.roles.get(form.id) ?? 'viewer'} overview={data.overview.get(form.id)}
            ownerName={form.owner_id === user?.id ? null : data.people.get(form.owner_id)?.full_name ?? data.people.get(form.owner_id)?.email ?? null}
            now={now} navigate={navigate} share={() => setSharing(form)} access={() => setAccess(form)}
            duplicate={() => void duplicate(form)} remove={() => setDeleting(form)} />
        ))}
      </div>
      {data && !shown.length && (
        tab === 'mine' && !mine.length
          ? <EmptyState icon={<ClipboardList />} title={tr(lang, 'ابدأ أول نموذج', 'Start your first form')}
              description={tr(lang, 'اختر قالبًا جاهزًا للتسجيل أو التقييم أو الحضور، أو ابدأ من الصفر.', 'Pick a ready template for registration, evaluation or attendance, or start from scratch.')}
              action={<Button variant="primary" icon={<FilePlus2 />} onClick={() => setTemplates(true)}>{tr(lang, 'نموذج جديد', 'New form')}</Button>} />
          : tab === 'shared' && !shared.length
            ? <EmptyState icon={<UsersRound />} title={tr(lang, 'لا نماذج مشاركة معك', 'Nothing shared with you')}
                description={tr(lang, 'عندما يضيفك زميل إلى نموذجه يظهر هنا.', 'When a colleague adds you to a form it appears here.')} />
            : <EmptyState icon={<Search />} title={tr(lang, 'لا نموذج يطابق البحث', 'No form matches')} />
      )}

      <button type="button" className="forms-fab" data-small={fabSmall} data-ripple onClick={() => setTemplates(true)} aria-label={tr(lang, 'نموذج جديد', 'New form')}>
        <Plus aria-hidden="true" /><span>{tr(lang, 'نموذج جديد', 'New form')}</span>
      </button>

      <TemplatesDialog lang={lang} open={templates} onClose={() => setTemplates(false)} onCreated={form => navigate(`/forms/${form.id}`)} />
      {sharing && <ShareDialog lang={lang} form={sharing} onClose={() => setSharing(null)} />}
      {access && <AccessDialog lang={lang} form={access} onClose={() => setAccess(null)} />}
      <ConfirmDialog lang={lang} open={!!deleting} danger title={tr(lang, 'حذف النموذج؟', 'Delete this form?')}
        description={deleting ? tr(lang, `سيُحذف «${deleting.title || 'بدون عنوان'}» مع كل ردوده وملفاته، ولا يمكن التراجع.`, `“${deleting.title || 'Untitled'}” will be deleted with all its responses and files. This cannot be undone.`) : ''}
        confirm={tr(lang, 'حذف نهائي', 'Delete permanently')} onClose={() => setDeleting(null)} onConfirm={() => deleting ? remove(deleting) : Promise.resolve()} />
    </main>
  );
}

function Stat({ label, value, decimals = 0, suffix, loading }: { label: string; value: number | null; decimals?: number; suffix?: React.ReactNode; loading: boolean }) {
  return (
    <div className="forms-stat">
      <span>{label}</span>
      <strong>{loading ? <i className="forms-stat__skeleton" /> : value == null ? '—' : <><CountUp value={value} decimals={decimals} />{suffix}</>}</strong>
    </div>
  );
}

const roleLabels: Record<FormRole, { ar: string; en: string }> = {
  owner: { ar: 'المالك', en: 'Owner' }, editor: { ar: 'محرر', en: 'Editor' }, viewer: { ar: 'مشاهد', en: 'Viewer' },
};
export const roleLabel = (role: FormRole, lang: Lang) => roleLabels[role][lang];

function FormCard({ lang, form, role, overview, ownerName, now, navigate, share, access, duplicate, remove }: {
  lang: Lang; form: Form; role: FormRole; overview?: api.Overview; ownerName: string | null; now: number; navigate: Navigate;
  share: () => void; access: () => void; duplicate: () => void; remove: () => void;
}) {
  const open = isOpen(form, now);
  const responses = overview?.responses ?? 0;
  const questions = answerable(form.questions).length;
  return (
    <article className="form-card" data-theme={form.theme} data-reveal>
      <button type="button" className="form-card__cover" onClick={() => navigate(`/forms/${form.id}${role === 'viewer' ? '/responses' : ''}`)}
        style={form.cover_url ? { backgroundImage: `url("${form.cover_url}")` } : undefined} aria-label={form.title || tr(lang, 'بدون عنوان', 'Untitled')}>
        {form.workshop.number && <span className="form-card__number">{tr(lang, `الورشة ${form.workshop.number}`, `Workshop ${form.workshop.number}`)}</span>}
        <Badge tone={open ? 'success' : 'neutral'} dot>{open ? tr(lang, 'يستقبل', 'Open') : tr(lang, 'مغلق', 'Closed')}</Badge>
      </button>
      <div className="form-card__body">
        <h2 dir="auto">{form.title || tr(lang, 'بدون عنوان', 'Untitled')}</h2>
        {(form.workshop.name || form.description) && <p dir="auto">{form.workshop.name || form.description}</p>}
        {ownerName && <small className="form-card__shared"><Badge tone="info">{roleLabel(role, lang)}</Badge> {tr(lang, 'مشارك من', 'Shared by')} <bdi>{ownerName}</bdi></small>}
        <div className="form-card__metrics">
          <span><BarChart3 aria-hidden="true" />{responsesLine(responses, lang)}</span>
          {overview?.rating_avg != null && <span><Star aria-hidden="true" />{overview.rating_avg.toFixed(1)}</span>}
          <span><ClipboardList aria-hidden="true" />{questionsLine(questions, lang)}</span>
        </div>
        <small className="form-card__last">
          {overview?.last_response_at ? tr(lang, `آخر رد ${relativeTime(overview.last_response_at, now, lang)}`, `Last response ${relativeTime(overview.last_response_at, now, lang)}`) : tr(lang, 'لا ردود بعد', 'No responses yet')}
        </small>
      </div>
      <div className="form-card__actions">
        <Button size="sm" icon={<BarChart3 />} data-ripple onClick={() => navigate(`/forms/${form.id}/responses`)}>{tr(lang, 'الردود', 'Responses')}</Button>
        <Button size="sm" icon={<Share2 />} data-ripple onClick={share}>{tr(lang, 'مشاركة', 'Share')}</Button>
        <Menu label={tr(lang, 'خيارات النموذج', 'Form options')} dir={lang === 'ar' ? 'rtl' : 'ltr'} trigger={<MoreHorizontal />} items={[
          { label: tr(lang, 'تعديل', 'Edit'), icon: <Pencil />, onSelect: () => navigate(`/forms/${form.id}`), hidden: role === 'viewer' },
          { label: tr(lang, 'الأشخاص والوصول', 'People and access'), icon: <UsersRound />, onSelect: access, hidden: role !== 'owner' },
          { label: tr(lang, 'فتح كما يراه المشاركون', 'Open as respondents see it'), icon: <ExternalLink />, onSelect: () => open_(form.id) },
          { label: tr(lang, 'نسخة', 'Make a copy'), icon: <Copy />, onSelect: duplicate },
          { label: tr(lang, 'حذف', 'Delete'), icon: <Trash2 />, onSelect: remove, danger: true, hidden: role !== 'owner' },
        ]} />
      </div>
    </article>
  );
}

const open_ = (id: string) => window.open(`/f/${id}`, '_blank', 'noopener');

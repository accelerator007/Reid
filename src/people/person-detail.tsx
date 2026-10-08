// One person's records: onboarding, tasks, performance, documents and hours.
// Staff and the person's department manager manage them; people see their own.
import React from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowLeft, ArrowRight, Check, ClipboardList, Clock, FileText, Gauge, ListChecks, Mail, Pencil, Phone, Plus, Star,
} from 'lucide-react';
import { messageFor, type AppError, type Result } from '../db';
import type { Role } from '../policy';
import { Badge, Button, Card, EmptyState, InlineAlert, ListRow, SectionHeader, Select, TabPanel, Tabs, type TabItem } from '../ui';
import * as api from './api';
import {
  averageRating, canManage, departmentName, documentCategories, employmentStatuses, formatMinutes, initials, isPeopleStaff,
  kpiStatuses, minutesThisWeek, onboardingProgress, taskStatuses, type Lang, type Person,
} from './model';
import { PeopleForms, type PeopleDialog } from './people-forms';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'onboarding' | 'tasks' | 'performance' | 'documents' | 'time';

export function PersonDetail({ lang, user, roles, person, data, back, act, error, showError, clearError }: {
  lang: Lang; user: User; roles: readonly Role[]; person: Person; data: api.PeopleData; back: () => void;
  act: (write: Promise<Result<unknown>>) => Promise<Result<unknown>>; error: AppError | null;
  showError: (error: AppError) => void; clearError: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>('onboarding');
  const [dialog, setDialog] = React.useState<PeopleDialog>(null);
  const self = person.id === user.id;
  const staff = isPeopleStaff(roles);
  const manager = canManage(roles, user.id, person, data.departments);
  const onboarding = data.onboarding.filter(item => item.user_id === person.id);
  const tasks = data.tasks.filter(task => task.assignee_id === person.id);
  const kpis = data.kpis.filter(kpi => kpi.user_id === person.id);
  const reviews = data.reviews.filter(review => review.user_id === person.id);
  const documents = data.documents.filter(document => document.owner_id === person.id);
  const hours = data.timesheets.filter(entry => entry.user_id === person.id);
  const progress = onboardingProgress(onboarding);
  const status = employmentStatuses[person.employment_status];
  const now = new Date();
  const rating = averageRating(reviews);
  const name = (id: string) => data.people.find(member => member.id === id)?.full_name ?? '—';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
  const date = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value)
    .toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Muscat' });

  const tabs: TabItem<Tab>[] = [
    { id: 'onboarding', label: tr(lang, 'التهيئة', 'Onboarding'), icon: <ClipboardList />, count: onboarding.length ? onboarding.length - progress.done : undefined },
    { id: 'tasks', label: tr(lang, 'المهام', 'Tasks'), icon: <ListChecks />, count: tasks.filter(task => task.status !== 'done').length },
    { id: 'performance', label: tr(lang, 'الأداء', 'Performance'), icon: <Gauge />, count: kpis.length },
    { id: 'documents', label: tr(lang, 'المستندات', 'Documents'), icon: <FileText />, count: documents.length },
    { id: 'time', label: tr(lang, 'ساعات العمل', 'Hours'), icon: <Clock /> },
  ];
  const addFor: Partial<Record<Tab, Exclude<PeopleDialog, null>>> = {
    ...(manager ? { onboarding: 'onboarding', tasks: 'task', performance: 'kpi' } : {}),
    ...(self || staff ? { documents: 'document' } : {}),
    ...(self ? { time: 'time' } : {}),
  } as Partial<Record<Tab, Exclude<PeopleDialog, null>>>;

  return (
    <main className="people">
      <button type="button" className="people-back" onClick={back}><BackIcon aria-hidden="true" />{tr(lang, 'الفريق', 'People')}</button>

      <section className="person-hero">
        <span className="person-hero__avatar" aria-hidden="true">{initials(person.full_name)}</span>
        <div className="person-hero__main">
          <div className="person-hero__badges">
            {status && <Badge tone={status.tone} dot>{status.label[lang]}</Badge>}
            {self && <Badge tone="brand">{tr(lang, 'أنت', 'You')}</Badge>}
          </div>
          <h1>{person.full_name}</h1>
          <p>{[person.position, departmentName(data.departments, person, lang)].filter(Boolean).join(' · ') || tr(lang, 'لم يُحدَّد المسمى بعد', 'Position not set')}</p>
          <div className="person-hero__meta">
            <a href={`mailto:${person.email}`} dir="ltr"><Mail aria-hidden="true" />{person.email}</a>
            {person.phone && <a href={`tel:${person.phone}`} dir="ltr"><Phone aria-hidden="true" />{person.phone}</a>}
            {person.hire_date && <span>{tr(lang, 'منذ', 'Since')} {date(person.hire_date)}</span>}
          </div>
        </div>
        {staff && <Button icon={<Pencil />} onClick={() => setDialog('profile')}>{tr(lang, 'تعديل', 'Edit')}</Button>}
        <dl className="person-hero__facts">
          <div><dt>{tr(lang, 'التهيئة', 'Onboarding')}</dt><dd>{progress.total ? `${progress.percent}٪` : '—'}</dd></div>
          <div><dt>{tr(lang, 'مهام مفتوحة', 'Open tasks')}</dt><dd>{tasks.filter(task => task.status !== 'done').length}</dd></div>
          <div><dt>{tr(lang, 'متوسط التقييم', 'Avg. rating')}</dt><dd>{rating ?? '—'}</dd></div>
          <div><dt>{tr(lang, 'ساعات هذا الأسبوع', 'Hours this week')}</dt><dd>{formatMinutes(minutesThisWeek(hours, now), lang)}</dd></div>
        </dl>
      </section>

      {error && <InlineAlert action={<Button size="sm" onClick={clearError}>{tr(lang, 'إغلاق', 'Dismiss')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <Tabs items={tabs} value={tab} onChange={setTab} label={tr(lang, 'سجلات الموظف', 'Employee records')} dir={dir} />
      <TabPanel id={tab}>
        {addFor[tab] && (
          <div className="person-tabhead">
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDialog(addFor[tab]!)}>
              {{ onboarding: tr(lang, 'خطوة تهيئة', 'Onboarding step'), task: tr(lang, 'مهمة', 'Task'), kpi: tr(lang, 'مؤشر', 'KPI'), document: tr(lang, 'مستند', 'Document'), time: tr(lang, 'تسجيل ساعات', 'Log hours') }[addFor[tab] as 'onboarding' | 'task' | 'kpi' | 'document' | 'time']}
            </Button>
            {tab === 'performance' && manager && <Button size="sm" icon={<Star />} onClick={() => setDialog('review')}>{tr(lang, 'تقييم أداء', 'Review')}</Button>}
          </div>
        )}

        {tab === 'onboarding' && (onboarding.length ? (
          <Card>
            <div className="onboarding-progress"><div><span style={{ inlineSize: `${progress.percent}%` }} /></div><small>{tr(lang, `أُنجز ${progress.done} من ${progress.total}`, `${progress.done} of ${progress.total} done`)}</small></div>
            <ul className="checklist">
              {onboarding.map(item => (
                <li key={item.id} data-done={item.completed}>
                  <button type="button" className="checklist__box" aria-pressed={item.completed} disabled={!(self || manager)}
                    onClick={() => void act(api.setOnboardingDone(item.id, !item.completed))}
                    aria-label={item.completed ? tr(lang, 'إلغاء الإنجاز', 'Mark not done') : tr(lang, 'تم', 'Mark done')}><Check aria-hidden="true" /></button>
                  <span><strong>{lang === 'ar' ? item.title_ar : item.title_en}</strong>{item.due_date && <small>{date(item.due_date)}</small>}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : <EmptyState icon={<ClipboardList />} title={tr(lang, 'لا توجد خطوات تهيئة', 'No onboarding steps')} />)}

        {tab === 'tasks' && (tasks.length ? (
          <div className="person-rows">
            {tasks.map(task => (
              <div className="person-row" key={task.id} data-done={task.status === 'done'}>
                <ListRow dir={dir} icon={<ListChecks />} tone={taskStatuses[task.status]?.tone ?? 'neutral'} title={task.title}
                  description={task.due_at ? `${tr(lang, 'الموعد', 'Due')} ${date(task.due_at)}` : task.description ?? undefined} />
                {manager || self ? (
                  <Select className="person-row__status" value={task.status} aria-label={tr(lang, 'حالة المهمة', 'Task status')} onChange={event => void act(api.setTaskStatus(task.id, event.target.value))}>
                    {Object.entries(taskStatuses).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}
                  </Select>
                ) : <Badge tone={taskStatuses[task.status]?.tone ?? 'neutral'}>{taskStatuses[task.status]?.label[lang] ?? task.status}</Badge>}
              </div>
            ))}
          </div>
        ) : <EmptyState icon={<ListChecks />} title={tr(lang, 'لا مهام مسندة', 'No assigned tasks')} />)}

        {tab === 'performance' && (
          <div className="person-performance">
            {kpis.length ? (
              <div className="person-kpis">
                {kpis.map(kpi => {
                  const meta = kpiStatuses[kpi.status] ?? kpiStatuses.on_track;
                  const percent = kpi.target_value ? Math.min(100, Math.round((kpi.current_value / kpi.target_value) * 100)) : 0;
                  return (
                    <Card key={kpi.id} className={`person-kpi ui-tone--${meta.tone}`}>
                      <div className="person-kpi__top"><strong>{kpi.title}</strong><Badge tone={meta.tone}>{meta.label[lang]}</Badge></div>
                      <div className="person-kpi__value"><b>{kpi.current_value}</b><span>/ {kpi.target_value} {kpi.unit}</span></div>
                      <div className="person-kpi__bar"><span style={{ inlineSize: `${percent}%` }} /></div>
                      <small>{date(kpi.period_start)} – {date(kpi.period_end)}</small>
                    </Card>
                  );
                })}
              </div>
            ) : <EmptyState icon={<Gauge />} title={tr(lang, 'لا مؤشرات أداء', 'No KPIs')} />}
            {reviews.length > 0 && (
              <Card>
                <SectionHeader title={tr(lang, 'تقييمات الأداء', 'Performance reviews')} />
                <div className="reviews">
                  {reviews.map(review => (
                    <article className="review" key={review.id}>
                      <div className="review__top">
                        <span className="review__stars" aria-label={tr(lang, `${review.rating} من 5`, `${review.rating} of 5`)}>
                          {[1, 2, 3, 4, 5].map(step => <Star key={step} aria-hidden="true" data-on={Number(review.rating) >= step} />)}
                        </span>
                        <small>{date(review.period_start)} – {date(review.period_end)} · {name(review.reviewer_id)}</small>
                      </div>
                      <p>{review.summary}</p>
                      {review.strengths && <p><b>{tr(lang, 'نقاط القوة', 'Strengths')}:</b> {review.strengths}</p>}
                      {review.improvements && <p><b>{tr(lang, 'فرص التحسين', 'To improve')}:</b> {review.improvements}</p>}
                    </article>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === 'documents' && (documents.length ? (
          <div className="person-rows">
            {documents.map(document => (
              <div className="person-row" key={document.id}>
                <ListRow dir={dir} icon={<FileText />} tone="brand" title={document.title}
                  description={`${documentCategories[document.category]?.[lang] ?? document.category} · ${date(document.created_at)}`} />
                <Button size="sm" onClick={async () => { const result = await api.openDocument(document.storage_path); if (!result.ok) showError(result.error); }}>
                  {tr(lang, 'فتح آمن', 'Open securely')}
                </Button>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={<FileText />} title={tr(lang, 'لا مستندات', 'No documents')} description={tr(lang, 'العقود والشهادات تبقى خاصة بصاحبها والموارد البشرية.', 'Contracts and certificates stay private to the person and HR.')} />)}

        {tab === 'time' && (hours.length ? (
          <Card>
            <SectionHeader title={tr(lang, 'آخر السجلات', 'Recent entries')} action={<Badge tone="brand">{tr(lang, 'هذا الأسبوع', 'This week')}: {formatMinutes(minutesThisWeek(hours, now), lang)}</Badge>} />
            <ul className="timesheet">
              {hours.slice(0, 30).map(entry => (
                <li key={entry.id}>
                  <span>{date(entry.work_date)}</span>
                  <b>{formatMinutes(entry.minutes, lang)}</b>
                  <small>{entry.notes || '—'}</small>
                </li>
              ))}
            </ul>
          </Card>
        ) : <EmptyState icon={<Clock />} title={tr(lang, 'لا ساعات مسجلة', 'No hours logged')} description={self ? tr(lang, 'سجّل ساعاتك يوميًا، ولا يوجد تسجيل حضور وانصراف.', 'Log your hours daily; there is no clock-in.') : undefined} />)}
      </TabPanel>

      <PeopleForms lang={lang} open={dialog} onClose={() => setDialog(null)} staff={staff} person={person} departments={data.departments}
        save={(kind, fields, file) => act(
          kind === 'profile' ? api.updatePerson(person.id, fields as Record<string, string | null>)
            : kind === 'onboarding' ? api.createOnboarding(person.id, user.id, fields as Record<string, string | null>)
              : kind === 'task' ? api.createTask(person.id, user.id, fields)
                : kind === 'kpi' ? api.createKpi(person.id, user.id, fields)
                  : kind === 'review' ? api.createReview(person.id, user.id, fields)
                    : kind === 'document' && file ? api.uploadDocument(person.id, user.id, file, { title: String(fields.title), category: String(fields.category ?? 'general') })
                      : api.logTime(user.id, fields),
        )} />
    </main>
  );
}

// /workspace — the team: a searchable directory, company announcements, the
// calendar and departments. Opening a person shows their records.
import React from 'react';
import type { User } from '@supabase/supabase-js';
import { Building2, CalendarDays, FileText, Megaphone, Plus, Search, UsersRound, X } from 'lucide-react';
import { messageFor, type AppError, type Result } from '../db';
import { useSession } from '../shell';
import { Badge, Button, Card, EmptyState, InlineAlert, Skeleton, TabPanel, Tabs, type TabItem } from '../ui';
import * as api from './api';
import { employmentStatuses, departmentName, filterPeople, initials, isPeopleStaff, type Lang, type Person } from './model';
import { Applications } from './applications';
import { PeopleForms, type PeopleDialog } from './people-forms';
import { PersonDetail } from './person-detail';
import './people.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'directory' | 'announcements' | 'calendar' | 'departments' | 'applications';
const personFromUrl = () => new URLSearchParams(location.search).get('person');
const tabFromUrl = (staff: boolean): Tab => {
  const params = new URLSearchParams(location.search);
  // Links to a join application (?review=) land on the applications tab.
  return staff && (params.get('tab') === 'applications' || params.has('review')) ? 'applications' : 'directory';
};

export function EmployeeWorkspace({ lang, user }: { lang: Lang; user: User; profile?: () => void }) {
  const { roles } = useSession();
  const staff = isPeopleStaff(roles);
  const [data, setData] = React.useState<api.PeopleData | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<Tab>(() => tabFromUrl(staff));
  const [pendingApplications, setPendingApplications] = React.useState<number | undefined>(undefined);
  const [dialog, setDialog] = React.useState<PeopleDialog>(null);
  const [selected, setSelected] = React.useState<string | null>(personFromUrl);

  const load = React.useCallback(async () => {
    const result = await api.loadPeople(staff);
    if (result.data) setData(result.data);
    setError(result.error);
  }, [staff]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { if (staff) void api.countPendingApplications().then(setPendingApplications); }, [staff]);
  React.useEffect(() => {
    let timer: number | undefined;
    return api.subscribeToPeople(() => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 400); });
  }, [load]);
  React.useEffect(() => {
    const follow = () => setSelected(personFromUrl());
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const open = (id: string) => { history.pushState({}, '', `/workspace?person=${id}`); setSelected(id); scrollTo(0, 0); };
  const back = () => { history.pushState({}, '', '/workspace'); setSelected(null); };
  const act = async (write: Promise<Result<unknown>>) => {
    const result = await write;
    if (!result.ok) setError(result.error);
    await load();
    return result;
  };

  const person = data?.people.find(candidate => candidate.id === selected);
  if (selected && person && data) {
    return <PersonDetail lang={lang} user={user} roles={roles} person={person} data={data} back={back} act={act} error={error} showError={setError} clearError={() => setError(null)} />;
  }

  const tabs: TabItem<Tab>[] = [
    { id: 'directory', label: tr(lang, 'الأشخاص', 'People'), icon: <UsersRound />, count: data?.people.length },
    { id: 'announcements', label: tr(lang, 'الإعلانات', 'Announcements'), icon: <Megaphone />, count: data?.announcements.length },
    { id: 'calendar', label: tr(lang, 'التقويم', 'Calendar'), icon: <CalendarDays />, count: data?.events.length },
    { id: 'departments', label: tr(lang, 'الأقسام', 'Departments'), icon: <Building2 />, count: data?.departments.length },
    ...(staff ? [{ id: 'applications' as const, label: tr(lang, 'طلبات الانضمام', 'Join requests'), icon: <FileText />, count: pendingApplications }] : []),
  ];
  const action: Partial<Record<Tab, Exclude<PeopleDialog, null>>> = staff
    ? { announcements: 'announcement', calendar: 'event', departments: 'department' }
    : { calendar: 'event' };
  const adding = action[tab];

  return (
    <main className="people">
      <div className="people-head">
        <div>
          <h1>{tr(lang, 'الفريق', 'People')}</h1>
          <p>{tr(lang, 'من يعمل معنا، أقسامنا، مواعيدنا وإعلاناتنا.', 'Who we work with, our departments, dates and announcements.')}</p>
        </div>
        <div className="people-head__actions">
          <Button onClick={() => open(user.id)}>{tr(lang, 'ملفي', 'My records')}</Button>
          {adding && <Button variant="primary" icon={<Plus />} onClick={() => setDialog(adding)}>
            {{ announcement: tr(lang, 'إعلان جديد', 'New announcement'), event: tr(lang, 'موعد جديد', 'New event'), department: tr(lang, 'قسم جديد', 'New department') }[adding as 'announcement' | 'event' | 'department']}
          </Button>}
        </div>
      </div>

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'تحديث', 'Refresh')}</Button>}>{messageFor(error, lang)}</InlineAlert>}
      {selected && data && !person && <InlineAlert tone="warning">{tr(lang, 'هذا الشخص غير موجود أو لا تملك صلاحية عرضه.', 'This person does not exist or is not visible to you.')}</InlineAlert>}

      <Tabs items={tabs} value={tab} onChange={setTab} label={tr(lang, 'أقسام الفريق', 'People sections')} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <TabPanel id={tab}>
        {!data && !error && tab !== 'applications' && <Skeleton lines={6} />}
        {staff && tab === 'applications' && <Applications lang={lang} onCount={setPendingApplications} />}
        {data && tab === 'directory' && <Directory lang={lang} data={data} open={open} />}
        {data && tab === 'announcements' && (
          data.announcements.length ? (
            <div className="announcements">
              {data.announcements.map(item => (
                <Card key={item.id} as="article" className="announcement">
                  <span className="announcement__mark" aria-hidden="true"><Megaphone /></span>
                  <div>
                    <strong>{lang === 'ar' ? item.title_ar : item.title_en}</strong>
                    <time>{new Date(item.published_at).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                    <p>{lang === 'ar' ? item.body_ar : item.body_en}</p>
                  </div>
                </Card>
              ))}
            </div>
          ) : <EmptyState icon={<Megaphone />} title={tr(lang, 'لا توجد إعلانات', 'No announcements')} />
        )}
        {data && tab === 'calendar' && (
          data.events.length ? (
            <div className="events">
              {data.events.map(event => {
                const start = new Date(event.starts_at);
                return (
                  <article className="event" key={event.id}>
                    <div className="event__date" aria-hidden="true">
                      <b>{start.toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', timeZone: 'Asia/Muscat' })}</b>
                      <span>{start.toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', timeZone: 'Asia/Muscat' })}</span>
                    </div>
                    <div className="event__body">
                      <strong>{event.title}</strong>
                      <span>{start.toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })} – {new Date(event.ends_at).toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })}</span>
                      {event.description && <p>{event.description}</p>}
                    </div>
                    <Badge tone={event.visibility === 'company' ? 'brand' : 'neutral'}>{event.visibility === 'company' ? tr(lang, 'للشركة', 'Company') : tr(lang, 'خاص', 'Private')}</Badge>
                  </article>
                );
              })}
            </div>
          ) : <EmptyState icon={<CalendarDays />} title={tr(lang, 'لا مواعيد قادمة', 'Nothing coming up')} />
        )}
        {data && tab === 'departments' && (
          data.departments.length ? (
            <div className="departments">
              {data.departments.map(department => {
                const members = data.people.filter(member => member.department_id === department.id);
                const manager = data.people.find(member => member.id === department.manager_id);
                return (
                  <Card key={department.id} className="department">
                    <strong>{lang === 'ar' ? department.name_ar : department.name_en}</strong>
                    {department.description && <p>{department.description}</p>}
                    <small>{tr(lang, 'المدير', 'Manager')}: {manager?.full_name ?? '—'}</small>
                    <div className="department__members">
                      {members.slice(0, 6).map(member => <button type="button" key={member.id} onClick={() => open(member.id)} title={member.full_name}>{initials(member.full_name)}</button>)}
                      {members.length > 6 && <span>+{members.length - 6}</span>}
                      {!members.length && <small>{tr(lang, 'لا أعضاء بعد', 'No members yet')}</small>}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : <EmptyState icon={<Building2 />} title={tr(lang, 'لا توجد أقسام', 'No departments')} />
        )}
      </TabPanel>

      <PeopleForms lang={lang} open={dialog} onClose={() => setDialog(null)} staff={staff} departments={data?.departments ?? []}
        save={(kind, fields) => act(
          kind === 'announcement' ? api.createAnnouncement(user.id, fields as Record<string, string | null>)
            : kind === 'department' ? api.createDepartment(fields as Record<string, string | null>)
              : api.createEvent(user.id, user.id, fields as Record<string, string | null>),
        )} />
    </main>
  );
}

function Directory({ lang, data, open }: { lang: Lang; data: api.PeopleData; open: (id: string) => void }) {
  const [query, setQuery] = React.useState('');
  const [department, setDepartment] = React.useState('all');
  const people = filterPeople(data.people, data.departments, query, department, lang);
  return (
    <>
      <div className="people-toolbar">
        <label className="people-search">
          <Search aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث بالاسم أو المسمى أو القسم…', 'Search by name, role or department…')} aria-label={tr(lang, 'بحث', 'Search')} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
        </label>
        {data.departments.length > 0 && (
          <div className="people-chips" role="group" aria-label={tr(lang, 'تصفية حسب القسم', 'Filter by department')}>
            <button type="button" aria-pressed={department === 'all'} onClick={() => setDepartment('all')}>{tr(lang, 'كل الأقسام', 'All')}</button>
            {data.departments.map(item => <button type="button" key={item.id} aria-pressed={department === item.id} onClick={() => setDepartment(item.id)}>{lang === 'ar' ? item.name_ar : item.name_en}</button>)}
          </div>
        )}
      </div>
      {people.length ? (
        <div className="people-grid">
          {people.map(person => <PersonCard key={person.id} lang={lang} person={person} department={departmentName(data.departments, person, lang)} open={() => open(person.id)} />)}
        </div>
      ) : <EmptyState icon={<UsersRound />} title={tr(lang, 'لا أحد يطابق البحث', 'Nobody matches')} />}
    </>
  );
}

function PersonCard({ lang, person, department, open }: { lang: Lang; person: Person; department: string | null; open: () => void }) {
  const status = employmentStatuses[person.employment_status];
  return (
    <button type="button" className="person-card" onClick={open}>
      <span className="person-card__avatar" aria-hidden="true">{initials(person.full_name)}</span>
      <strong>{person.full_name}</strong>
      <span className="person-card__role">{person.position || tr(lang, 'بدون مسمى', 'No position')}</span>
      <span className="person-card__dept">{department || tr(lang, 'بدون قسم', 'No department')}</span>
      {status && person.employment_status !== 'active' && <Badge tone={status.tone}>{status.label[lang]}</Badge>}
    </button>
  );
}

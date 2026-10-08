// /projects and /projects/:id. The directory shows every project the person
// can see with its health and progress; a project opens in place and keeps its
// own URL so it can be shared and reopened.
import React from 'react';
import type { User } from '@supabase/supabase-js';
import { Archive, CalendarDays, FolderKanban, Plus, Search, X } from 'lucide-react';
import { messageFor, type AppError } from '../db';
import { useSession } from '../shell';
import { Badge, Button, EmptyState, InlineAlert, Skeleton } from '../ui';
import { createProject, loadDirectory, type Directory } from './api';
import {
  daysUntil, filterProjects, formatDate, healthLabels, isOverdue, labelOf, projectHealth, projectStatuses, projectTypes, statusOf,
  type Lang, type Project,
} from './model';
import { ProjectDetailView } from './project-detail';
import { ProjectForm } from './project-forms';
import { arabicCount } from '../owner-overview.model';
import './projects.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const selectedFromUrl = () => location.pathname.split('/')[2] || null;
const createFromUrl = () => new URLSearchParams(location.search).get('new') === 'project';

export function ProjectWorkspace({ lang, user }: { lang: Lang; user: User }) {
  const { roles } = useSession();
  const admin = roles.some(role => ['owner', 'super_admin', 'admin'].includes(role));
  const [directory, setDirectory] = React.useState<Directory | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [selected, setSelected] = React.useState<string | null>(selectedFromUrl);
  const [creating, setCreating] = React.useState(createFromUrl);

  const reload = React.useCallback(async () => {
    const result = await loadDirectory();
    if (result.data) setDirectory(result.data);
    setError(result.error);
  }, []);
  React.useEffect(() => { void reload(); }, [reload]);
  // Other pages open a project by rewriting the URL; follow it.
  React.useEffect(() => {
    const follow = () => { setSelected(selectedFromUrl()); if (createFromUrl()) setCreating(true); };
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const open = (id: string) => { history.pushState({}, '', `/projects/${id}`); setSelected(id); scrollTo(0, 0); };
  const back = () => { history.pushState({}, '', '/projects'); setSelected(null); void reload(); };

  const project = directory?.projects.find(candidate => candidate.id === selected);
  if (selected && project && directory) {
    return <ProjectDetailView lang={lang} user={user} admin={admin} project={project} people={directory.people} back={back} refreshDirectory={reload} />;
  }

  return (
    <>
      <ProjectsDirectory
        lang={lang} directory={directory} error={error} admin={admin} missing={!!selected && !!directory && !project}
        open={open} create={() => setCreating(true)} retry={() => void reload()}
      />
      <ProjectForm
        lang={lang} open={creating} onClose={() => { setCreating(false); if (createFromUrl()) history.replaceState({}, '', '/projects'); }} people={directory?.people ?? []}
        save={async (fields, managerId) => {
          const result = await createProject(fields, managerId);
          if (result.ok && result.data) { await reload(); open(result.data.id); }
          return result;
        }}
      />
    </>
  );
}

function ProjectsDirectory({ lang, directory, error, admin, missing, open, create, retry }: {
  lang: Lang; directory: Directory | null; error: AppError | null; admin: boolean; missing: boolean;
  open: (id: string) => void; create: () => void; retry: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [archived, setArchived] = React.useState(false);
  const now = new Date();
  const projects = directory ? filterProjects(directory.projects, { query, status, archived }, directory.people) : [];
  const counts = directory ? Object.fromEntries(Object.keys(projectStatuses).map(key => [key, directory.projects.filter(p => !p.archived_at && p.status === key).length])) : {};
  const active = directory?.projects.filter(p => !p.archived_at).length ?? 0;

  return (
    <main className="projects">
      <div className="projects-head">
        <div>
          <h1>{tr(lang, 'المشاريع', 'Projects')}</h1>
          <p>{directory ? tr(lang, `${active ? arabicCount(active, { one: 'مشروع واحد قائم', two: 'مشروعان قائمان', few: 'مشاريع قائمة', many: 'مشروعًا قائمًا' }) : 'لا توجد مشاريع قائمة'} · افتح أي مشروع لمهامه وملفاته وفريقه.`, `${active} running · open one for its tasks, files and team.`) : ' '}</p>
        </div>
        {admin && <Button variant="primary" icon={<Plus />} onClick={create}>{tr(lang, 'مشروع جديد', 'New project')}</Button>}
      </div>

      {missing && <InlineAlert tone="warning">{tr(lang, 'هذا المشروع غير موجود أو ليس لديك صلاحية عليه.', 'This project does not exist or you do not have access.')}</InlineAlert>}
      {error && <InlineAlert action={<Button size="sm" onClick={retry}>{tr(lang, 'إعادة المحاولة', 'Retry')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <div className="projects-toolbar">
        <label className="projects-search">
          <Search aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث باسم المشروع أو العميل أو المدير…', 'Search by project, client or manager…')} aria-label={tr(lang, 'بحث', 'Search')} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
        </label>
        <div className="projects-chips" role="group" aria-label={tr(lang, 'تصفية حسب الحالة', 'Filter by status')}>
          <button type="button" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>{tr(lang, 'الكل', 'All')} <span>{active}</span></button>
          {Object.entries(projectStatuses).map(([key, value]) => (
            <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>{value.label[lang]} <span>{counts[key] ?? 0}</span></button>
          ))}
        </div>
        <button type="button" className="projects-archived" aria-pressed={archived} onClick={() => setArchived(value => !value)}>
          <Archive aria-hidden="true" />{tr(lang, 'المؤرشفة', 'Archived')}
        </button>
      </div>

      {!directory && !error && <div className="projects-grid">{[0, 1, 2].map(index => <div className="project-card" key={index}><Skeleton lines={4} /></div>)}</div>}
      {directory && !projects.length && (
        <EmptyState
          icon={<FolderKanban />}
          title={query || status !== 'all' ? tr(lang, 'لا توجد مشاريع مطابقة', 'No matching projects') : archived ? tr(lang, 'لا توجد مشاريع مؤرشفة', 'No archived projects') : tr(lang, 'لا توجد مشاريع بعد', 'No projects yet')}
          description={admin && !archived && !query ? tr(lang, 'ابدأ بأول مشروع وحدد مديره وموعده.', 'Start the first project with a manager and a target date.') : undefined}
          action={admin && !archived && !query ? <Button variant="primary" icon={<Plus />} onClick={create}>{tr(lang, 'مشروع جديد', 'New project')}</Button> : undefined}
        />
      )}
      <div className="projects-grid">
        {projects.map(project => <ProjectCard key={project.id} lang={lang} project={project} directory={directory!} now={now} open={() => open(project.id)} />)}
      </div>
    </main>
  );
}

function ProjectCard({ lang, project, directory, now, open }: { lang: Lang; project: Project; directory: Directory; now: Date; open: () => void }) {
  const tasks = directory.tasks.filter(task => task.project_id === project.id);
  const done = tasks.filter(task => task.status === 'done').length;
  const overdue = tasks.filter(task => isOverdue({ ...task, id: '', title: '', description: null, priority: 0, assignee_id: null }, now)).length;
  const health = healthLabels[projectHealth(project, now, overdue)];
  const status = statusOf(projectStatuses, project.status);
  const manager = directory.people.find(person => person.id === project.manager_id)?.full_name;
  const days = daysUntil(project.target_date, now);
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <button type="button" className="project-card" onClick={open}>
      <div className="project-card__top">
        <Badge tone={status.tone}>{status.label[lang]}</Badge>
        <span className="project-card__type">{labelOf(projectTypes, project.type, lang)}</span>
      </div>
      <h2>{project.name}</h2>
      <p className="project-card__desc">{project.client_name ? `${tr(lang, 'العميل', 'Client')}: ${project.client_name}` : project.description || tr(lang, 'بدون وصف', 'No description')}</p>
      <div className="project-card__progress" aria-label={tr(lang, `الإنجاز ${percent}٪`, `${percent}% done`)}>
        <div><span style={{ inlineSize: `${percent}%` }} /></div>
        <small>{tasks.length ? tr(lang, `أُنجز ${done} من ${tasks.length}`, `${done} of ${tasks.length} tasks done`) : tr(lang, 'لا توجد مهام بعد', 'No tasks yet')}</small>
      </div>
      <div className="project-card__foot">
        <span className="project-card__manager">
          <i aria-hidden="true">{(manager || '؟').slice(0, 1)}</i>{manager || tr(lang, 'بدون مدير', 'No manager')}
        </span>
        <span className={`project-card__date project-card__date--${health.tone}`}>
          <CalendarDays aria-hidden="true" />
          {project.target_date
            ? days !== null && days < 0 && project.status !== 'completed'
              ? tr(lang, `تأخير ${arabicCount(Math.abs(days), { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا' })}`, `${Math.abs(days)}d late`)
              : formatDate(project.target_date, lang)
            : health.label[lang]}
        </span>
      </div>
    </button>
  );
}

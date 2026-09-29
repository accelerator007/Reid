// One project: its header, progress and seven tabs. Members read; managers
// (the project manager, a lead, or an administrator) also add and change.
import React from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowLeft, ArrowRight, Archive, CalendarDays, Flag, FolderOpen, Gauge,
  GitBranch, LayoutDashboard, ListChecks, Plus, Settings2, Trash2, UserPlus, UsersRound, Video,
} from 'lucide-react';
import { messageFor, type AppError, type Result } from '../db';
import { Badge, Button, Card, EmptyState, IconButton, InlineAlert, ListRow, SectionHeader, TabPanel, Tabs, type TabItem } from '../ui';
import * as api from './api';
import {
  daysUntil, formatDate, healthLabels, isOverdue, kpiStatuses, labelOf, memberRoles, milestoneStatuses, progress, projectHealth,
  projectStatuses, projectTypes, statusOf, type Lang, type Person, type Project, type ProjectDetail,
} from './model';
import { MemberForm, ProjectForm, TaskForm } from './project-forms';
import { arabicCount } from '../owner-overview.model';
import { ActivityTab, FilesTab, KpisTab, MeetingsTab, MilestonesTab, TasksTab } from './project-sections';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'overview' | 'tasks' | 'milestones' | 'meetings' | 'files' | 'kpis' | 'activity';
// "باقي يومان" but "تأخير يومين": the case changes with the word before it.
const dayForms = { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يومًا' };
const lateForms = { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا' };
const empty: ProjectDetail = { members: [], tasks: [], milestones: [], meetings: [], files: [], permissions: [], kpis: [], activity: [] };

export function ProjectDetailView({ lang, user, admin, project, people, back, refreshDirectory }: {
  lang: Lang; user: User; admin: boolean; project: Project; people: Person[]; back: () => void; refreshDirectory: () => Promise<void>;
}) {
  const [detail, setDetail] = React.useState<ProjectDetail>(empty);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<Tab>('overview');
  const [dialog, setDialog] = React.useState<'settings' | 'member' | 'task' | null>(null);

  const reload = React.useCallback(async () => {
    const result = await api.loadProjectDetail(project.id);
    setDetail(result.data);
    setError(result.error);
    setLoaded(true);
  }, [project.id]);
  React.useEffect(() => { setLoaded(false); void reload(); }, [reload]);
  React.useEffect(() => {
    let timer: number | undefined;
    // Several rows change together (a task and its activity entry); reload once.
    return api.subscribeToProject(project.id, () => { window.clearTimeout(timer); timer = window.setTimeout(() => void reload(), 300); });
  }, [project.id, reload]);

  const manager = admin || project.manager_id === user.id
    || detail.members.some(member => member.user_id === user.id && ['manager', 'lead'].includes(member.member_role));
  const person = (id: string | null) => people.find(candidate => candidate.id === id)?.full_name || '—';
  /** Run a write, surface its error, and refresh the views it affects. */
  const act = async (write: Promise<Result<unknown>>, directory = false) => {
    const result = await write;
    if (!result.ok) setError(result.error);
    await reload();
    if (directory) await refreshDirectory();
    return result;
  };

  const now = new Date();
  const overdue = detail.tasks.filter(task => isOverdue(task, now));
  const health = healthLabels[projectHealth(project, now, overdue.length)];
  const status = statusOf(projectStatuses, project.status);
  const percent = progress(detail.tasks);
  const days = daysUntil(project.target_date, now);
  const upcoming = detail.meetings.filter(meeting => new Date(meeting.ends_at) >= now);
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const tabs: TabItem<Tab>[] = [
    { id: 'overview', label: tr(lang, 'نظرة عامة', 'Overview'), icon: <LayoutDashboard /> },
    { id: 'tasks', label: tr(lang, 'المهام', 'Tasks'), icon: <ListChecks />, count: detail.tasks.filter(task => task.status !== 'done').length },
    { id: 'milestones', label: tr(lang, 'المراحل', 'Milestones'), icon: <Flag />, count: detail.milestones.length },
    { id: 'meetings', label: tr(lang, 'الاجتماعات', 'Meetings'), icon: <Video />, count: upcoming.length },
    { id: 'files', label: tr(lang, 'الملفات', 'Files'), icon: <FolderOpen />, count: detail.files.length },
    { id: 'kpis', label: tr(lang, 'المؤشرات', 'KPIs'), icon: <Gauge />, count: detail.kpis.length },
    { id: 'activity', label: tr(lang, 'النشاط', 'Activity'), icon: <ActivityIcon /> },
  ];

  return (
    <main className="project">
      <button type="button" className="project-back" onClick={back}><BackIcon aria-hidden="true" />{tr(lang, 'كل المشاريع', 'All projects')}</button>

      <section className="project-hero">
        <div className="project-hero__main">
          <div className="project-hero__badges">
            <Badge tone={status.tone}>{status.label[lang]}</Badge>
            <Badge tone={health.tone} dot>{health.label[lang]}</Badge>
            <span className="project-hero__type">{labelOf(projectTypes, project.type, lang)}</span>
            {project.archived_at && <Badge tone="neutral">{tr(lang, 'مؤرشف', 'Archived')}</Badge>}
          </div>
          <h1>{project.name}</h1>
          <div className="project-hero__meta">
            {project.client_name && <span>{tr(lang, 'العميل', 'Client')}: <b>{project.client_name}</b></span>}
            <span>{tr(lang, 'المدير', 'Manager')}: <b>{person(project.manager_id)}</b></span>
            <span><CalendarDays aria-hidden="true" />{project.target_date
              ? `${formatDate(project.target_date, lang)}${days !== null && project.status !== 'completed' ? ` · ${days >= 0 ? tr(lang, days ? `باقي ${arabicCount(days, dayForms)}` : 'الموعد اليوم', `${days}d left`) : tr(lang, `تأخير ${arabicCount(Math.abs(days), lateForms)}`, `${Math.abs(days)}d late`)}` : ''}`
              : tr(lang, 'بدون موعد مستهدف', 'No target date')}</span>
            {project.github_repo && <a href={project.github_repo} target="_blank" rel="noreferrer" dir="ltr"><GitBranch aria-hidden="true" />GitHub</a>}
          </div>
        </div>
        {manager && (
          <div className="project-hero__actions">
            <Button variant="primary" icon={<Plus />} onClick={() => setDialog('task')}>{tr(lang, 'مهمة', 'Task')}</Button>
            <IconButton label={tr(lang, 'إعدادات المشروع', 'Project settings')} icon={<Settings2 />} onClick={() => setDialog('settings')} />
            <IconButton label={project.archived_at ? tr(lang, 'إلغاء الأرشفة', 'Unarchive') : tr(lang, 'أرشفة المشروع', 'Archive project')} icon={<Archive />}
              onClick={() => void act(api.setArchived(project.id, !project.archived_at), true)} />
          </div>
        )}
        <div className="project-hero__progress">
          <div className="project-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={tr(lang, 'نسبة الإنجاز', 'Completion')}>
            <span style={{ inlineSize: `${percent}%` }} />
          </div>
          <small><b>{percent}٪</b> {tr(lang, `أُنجز ${detail.tasks.filter(task => task.status === 'done').length} من ${detail.tasks.length}`, `${detail.tasks.filter(task => task.status === 'done').length} of ${detail.tasks.length} tasks done`)}</small>
        </div>
      </section>

      {error && <InlineAlert action={<Button size="sm" onClick={() => { setError(null); void reload(); }}>{tr(lang, 'تحديث', 'Refresh')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <Tabs items={tabs} value={tab} onChange={setTab} label={tr(lang, 'أقسام المشروع', 'Project sections')} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <TabPanel id={tab}>
        {tab === 'overview' && (
          <Overview lang={lang} project={project} detail={detail} loaded={loaded} manager={manager} person={person}
            addMember={() => setDialog('member')} removeMember={userId => void act(api.removeMember(project.id, userId))} goTo={setTab} />
        )}
        {tab === 'tasks' && <TasksTab lang={lang} tasks={detail.tasks} manager={manager} person={person} now={now}
          add={() => setDialog('task')} move={(taskId, next) => void act(api.moveTask(taskId, next))} />}
        {tab === 'milestones' && <MilestonesTab lang={lang} milestones={detail.milestones} manager={manager}
          add={fields => act(api.createMilestone(project.id, user.id, fields))} setStatus={(id, next) => void act(api.updateMilestoneStatus(id, next))} />}
        {tab === 'meetings' && <MeetingsTab lang={lang} meetings={detail.meetings} manager={manager} now={now}
          add={fields => act(api.createMeeting(project.id, user.id, fields))} />}
        {tab === 'files' && <FilesTab lang={lang} files={detail.files} permissions={detail.permissions} members={detail.members} manager={manager} person={person}
          upload={(file, fields) => act(api.uploadFile(project.id, user.id, file, fields))}
          grant={(fileId, grant) => void act(api.grantFile(fileId, user.id, grant))} revoke={id => void act(api.revokeFile(id))}
          openFile={async path => { const result = await api.openFile(path); if (!result.ok) setError(result.error); }} />}
        {tab === 'kpis' && <KpisTab lang={lang} kpis={detail.kpis} manager={manager} add={fields => act(api.createKpi(project.id, user.id, fields))} />}
        {tab === 'activity' && <ActivityTab lang={lang} activity={detail.activity} person={person} />}
      </TabPanel>

      <ProjectForm lang={lang} open={dialog === 'settings'} onClose={() => setDialog(null)} people={people} project={project}
        save={fields => act(api.updateProject(project.id, fields), true)} />
      <MemberForm lang={lang} open={dialog === 'member'} onClose={() => setDialog(null)} people={people} members={detail.members}
        add={(userId, role) => act(api.addMember(project.id, userId, role))} />
      <TaskForm lang={lang} open={dialog === 'task'} onClose={() => setDialog(null)} members={detail.members} person={person}
        add={fields => act(api.createTask(project.id, user.id, fields), true)} />
    </main>
  );
}

function Overview({ lang, project, detail, loaded, manager, person, addMember, removeMember, goTo }: {
  lang: Lang; project: Project; detail: ProjectDetail; loaded: boolean; manager: boolean; person: (id: string | null) => string;
  addMember: () => void; removeMember: (userId: string) => void; goTo: (tab: Tab) => void;
}) {
  const now = new Date();
  const overdue = detail.tasks.filter(task => isOverdue(task, now));
  const blocked = detail.milestones.filter(milestone => milestone.status === 'blocked');
  const atRisk = detail.kpis.filter(kpi => kpi.status === 'at_risk');
  const nextMilestone = detail.milestones.find(milestone => milestone.status !== 'completed');
  const nextMeeting = detail.meetings.find(meeting => new Date(meeting.starts_at) >= now);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const attention = overdue.length + blocked.length + atRisk.length;
  return (
    <div className="project-overview">
      <div className="project-overview__main">
        <Card>
          <SectionHeader title={tr(lang, 'ما يحتاج انتباهك', 'Needs attention')} action={attention ? <Badge tone="danger" dot>{attention}</Badge> : undefined} />
          {!loaded ? null : attention ? (
            <div className="project-list">
              {overdue.slice(0, 5).map(task => (
                <ListRow key={task.id} dir={dir} icon={<AlertTriangle />} tone="warning" title={task.title}
                  description={`${person(task.assignee_id)} · ${tr(lang, 'كان مستحقًا', 'Was due')} ${formatDate(task.due_at, lang)}`} onOpen={() => goTo('tasks')} />
              ))}
              {blocked.map(milestone => (
                <ListRow key={milestone.id} dir={dir} icon={<Flag />} tone="danger" title={milestone.title}
                  description={statusOf(milestoneStatuses, milestone.status).label[lang]} onOpen={() => goTo('milestones')} />
              ))}
              {atRisk.map(kpi => (
                <ListRow key={kpi.id} dir={dir} icon={<Gauge />} tone="danger" title={kpi.title}
                  description={`${kpi.current_value} / ${kpi.target_value} ${kpi.unit} · ${statusOf(kpiStatuses, kpi.status).label[lang]}`} onOpen={() => goTo('kpis')} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<ListChecks />} title={tr(lang, 'لا شيء متأخر أو متعثر', 'Nothing late or blocked')} description={tr(lang, 'المهام والمراحل والمؤشرات ضمن المسار.', 'Tasks, milestones and KPIs are on track.')} />
          )}
        </Card>
        <div className="project-next">
          <Card>
            <SectionHeader title={tr(lang, 'المرحلة القادمة', 'Next milestone')} />
            {nextMilestone ? (
              <ListRow dir={dir} icon={<Flag />} tone="brand" title={nextMilestone.title}
                description={formatDate(nextMilestone.due_date, lang)} meta={<Badge tone={statusOf(milestoneStatuses, nextMilestone.status).tone}>{statusOf(milestoneStatuses, nextMilestone.status).label[lang]}</Badge>}
                onOpen={() => goTo('milestones')} />
            ) : <p className="project-muted">{tr(lang, 'لا توجد مراحل قادمة.', 'No upcoming milestones.')}</p>}
          </Card>
          <Card>
            <SectionHeader title={tr(lang, 'الاجتماع القادم', 'Next meeting')} />
            {nextMeeting ? (
              <ListRow dir={dir} icon={<Video />} tone="info" title={nextMeeting.title}
                description={formatDate(nextMeeting.starts_at, lang, true)} onOpen={() => goTo('meetings')} />
            ) : <p className="project-muted">{tr(lang, 'لا يوجد اجتماع مجدول.', 'Nothing scheduled.')}</p>}
          </Card>
        </div>
        {project.description && (
          <Card>
            <SectionHeader title={tr(lang, 'عن المشروع', 'About')} />
            <p className="project-description">{project.description}</p>
          </Card>
        )}
      </div>
      <Card className="project-team">
        <SectionHeader title={tr(lang, 'الفريق', 'Team')} action={manager ? <Button size="sm" variant="ghost" icon={<UserPlus />} onClick={addMember}>{tr(lang, 'إضافة', 'Add')}</Button> : undefined} />
        {detail.members.length ? (
          <ul className="project-members">
            {detail.members.map(member => (
              <li key={member.user_id}>
                <i aria-hidden="true">{person(member.user_id).slice(0, 1)}</i>
                <span><b>{person(member.user_id)}</b><small>{labelOf(memberRoles, member.member_role, lang)}</small></span>
                {manager && member.user_id !== project.manager_id && (
                  <IconButton className="project-members__remove" label={tr(lang, `إزالة ${person(member.user_id)}`, `Remove ${person(member.user_id)}`)} icon={<Trash2 />} onClick={() => removeMember(member.user_id)} />
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<UsersRound />} title={tr(lang, 'لا يوجد أعضاء بعد', 'No members yet')} />}
      </Card>
    </div>
  );
}

// /today — one person's day: their open tasks by when they are due, their
// updates, and the projects they can see. Completing a task is one tap.
import React from 'react';
import { Bell, CalendarClock, Check, CheckCircle2, FolderKanban, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { list, messageFor, run, type AppError } from '../db';
import { arabicCount, greeting, todayLine } from '../owner-overview.model';
import type { Page } from '../routes';
import { useSession } from '../shell';
import { supabase } from '../supabase';
import { Badge, Button, Card, EmptyState, IconButton, InlineAlert, ListRow, SectionHeader, Skeleton, StatCard } from '../ui';
import { groupTasks, taskGroupLabels, type Lang, type MyTask, type Notice, type TaskGroup } from './model';
import './work.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type ProjectLink = { id: string; name: string; status: string };

export function Today({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const { user, roles } = useSession();
  const [tasks, setTasks] = React.useState<MyTask[] | null>(null);
  const [projects, setProjects] = React.useState<ProjectLink[]>([]);
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [error, setError] = React.useState<AppError | null>(null);
  const [title, setTitle] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const canCreate = roles.some(role => ['owner', 'super_admin', 'admin', 'hr'].includes(role));
  const canUseAgents = roles.some(role => ['owner', 'super_admin', 'admin'].includes(role));

  const load = React.useCallback(async () => {
    if (!supabase || !user) return;
    const [mine, visible, updates] = await Promise.all([
      list<MyTask>(supabase.from('tasks').select('id,title,status,priority,due_at,project_id').eq('assignee_id', user.id).neq('status', 'done').order('due_at', { nullsFirst: false }).limit(60)),
      list<ProjectLink>(supabase.from('projects').select('id,name,status').is('archived_at', null).order('updated_at', { ascending: false }).limit(6)),
      list<Notice>(supabase.from('notifications').select('id,title_ar,title_en,body_ar,body_en,read_at,created_at').order('created_at', { ascending: false }).limit(10)),
    ]);
    if (mine.ok) setTasks(mine.data);
    if (visible.ok) setProjects(visible.data);
    if (updates.ok) setNotices(updates.data);
    setError(!mine.ok ? mine.error : !visible.ok ? visible.error : !updates.ok ? updates.error : null);
  }, [user]);
  React.useEffect(() => { void load(); }, [load]);

  const complete = async (task: MyTask) => {
    if (!supabase) return;
    setTasks(current => current?.filter(row => row.id !== task.id) ?? null); // feels instant; reload confirms
    const result = await run(supabase.from('tasks').update({ status: 'done' }).eq('id', task.id).select('id').single());
    if (!result.ok) setError(result.error);
    await load();
  };
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !user || !title.trim()) return;
    setSaving(true);
    const result = await run(supabase.from('tasks').insert({ title: title.trim(), assignee_id: user.id, created_by: user.id }).select('id').single());
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setTitle('');
    await load();
  };
  const markRead = async (notice: Notice) => {
    if (!supabase || notice.read_at) return;
    setNotices(current => current.map(row => (row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row)));
    const result = await run(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notice.id).select('id').single());
    if (!result.ok) setError(result.error);
  };
  const openProject = (id: string) => { go('projects'); history.replaceState({}, '', `/projects/${id}`); dispatchEvent(new PopStateEvent('popstate')); };

  const now = new Date();
  const groups = tasks ? groupTasks(tasks, now) : null;
  const overdue = groups?.overdue.length ?? 0;
  const dueToday = groups?.today.length ?? 0;
  const unread = notices.filter(notice => !notice.read_at).length;
  const name = (user?.user_metadata?.full_name as string | undefined) || null;
  const projectName = (id: string | null) => projects.find(project => project.id === id)?.name;
  const summary = !tasks ? '' : !tasks.length
    ? tr(lang, 'لا توجد مهام مفتوحة مسندة لك. يوم هادئ.', 'No open tasks assigned to you.')
    : tr(lang,
      `عندك ${arabicCount(tasks.length, { one: 'مهمة واحدة مفتوحة', two: 'مهمتان مفتوحتان', few: 'مهام مفتوحة', many: 'مهمة مفتوحة' })}${overdue ? `، منها ${arabicCount(overdue, { one: 'واحدة متأخرة', two: 'اثنتان متأخرتان', few: 'متأخرة', many: 'متأخرة' })}` : ''}.`,
      `You have ${tasks.length} open ${tasks.length === 1 ? 'task' : 'tasks'}${overdue ? `, ${overdue} overdue` : ''}.`);

  return (
    <main className="day">
      <section className="day-hero">
        <div>
          <p className="day-hero__date">{todayLine(now, lang)}</p>
          <h1>{greeting(now, lang, name)}</h1>
          <p className="day-hero__summary">{summary || ' '}</p>
        </div>
        <IconButton label={tr(lang, 'تحديث', 'Refresh')} icon={<RefreshCw />} onClick={() => void load()} />
      </section>

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'إعادة المحاولة', 'Retry')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <section className="day-stats" aria-label={tr(lang, 'ملخص يومي', 'My day at a glance')}>
        <StatCard icon={<CheckCircle2 />} tone="brand" loading={!tasks} label={tr(lang, 'مهامي المفتوحة', 'My open tasks')} value={tasks?.length ?? 0} />
        <StatCard icon={<CalendarClock />} tone={overdue ? 'danger' : 'neutral'} loading={!tasks} label={tr(lang, 'متأخرة', 'Overdue')} value={overdue}
          hint={overdue ? tr(lang, 'ابدأ بها', 'Start here') : tr(lang, 'لا تأخير', 'Nothing late')} />
        <StatCard icon={<CalendarClock />} tone={dueToday ? 'warning' : 'neutral'} loading={!tasks} label={tr(lang, 'مستحقة اليوم', 'Due today')} value={dueToday} />
        <StatCard icon={<Bell />} tone={unread ? 'accent' : 'neutral'} label={tr(lang, 'تحديثات جديدة', 'New updates')} value={unread} />
      </section>

      <div className="day-grid">
        <Card className="day-tasks">
          <SectionHeader title={tr(lang, 'تركيزك', 'Your focus')} />
          {canCreate && (
            <form className="day-add" onSubmit={event => void add(event)}>
              <Plus aria-hidden="true" />
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200}
                placeholder={tr(lang, 'ما الخطوة التالية؟ أضف مهمة واضغط Enter', 'What’s next? Add a task and press Enter')} aria-label={tr(lang, 'مهمة جديدة', 'New task')} />
              {title.trim() && <Button type="submit" size="sm" variant="primary" busy={saving}>{tr(lang, 'إضافة', 'Add')}</Button>}
            </form>
          )}
          {!groups && <Skeleton lines={4} />}
          {groups && !tasks?.length && (
            <EmptyState icon={<CheckCircle2 />} title={tr(lang, 'لا شيء بانتظارك', 'Nothing waiting')} description={tr(lang, 'المهام المسندة لك تظهر هنا مرتبة حسب موعدها.', 'Tasks assigned to you appear here by due date.')} />
          )}
          {groups && (Object.keys(taskGroupLabels) as TaskGroup[]).filter(group => groups[group].length).map(group => (
            <div className="day-group" key={group} data-group={group}>
              <h3>{taskGroupLabels[group][lang]} <span>{groups[group].length}</span></h3>
              <ul>
                {groups[group].map(task => (
                  <li key={task.id} className="day-task">
                    <button type="button" className="day-task__check" onClick={() => void complete(task)} aria-label={tr(lang, `إكمال «${task.title}»`, `Complete “${task.title}”`)}>
                      <Check aria-hidden="true" />
                    </button>
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        {projectName(task.project_id) || tr(lang, 'مهمة شخصية', 'Personal task')}
                        {task.due_at && ` · ${new Date(task.due_at).toLocaleString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })}`}
                      </small>
                    </div>
                    {task.priority <= 1 && <Badge tone="danger">{tr(lang, 'عاجلة', 'Urgent')}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        <div className="day-side">
          {canUseAgents && (
            <Card className="day-agents">
              <span className="day-agents__mark" aria-hidden="true"><Sparkles /></span>
              <h2>{tr(lang, 'ابدأ يومك مع الفريق', 'Start the day with your team')}</h2>
              <p>{tr(lang, 'اطلب من المنسّق ترتيب أولوياتك، أو من التشغيل مراجعة العوائق.', 'Ask the orchestrator to order your priorities, or operations to review blockers.')}</p>
              <Button variant="primary" icon={<Sparkles />} onClick={() => go('assistant')}>{tr(lang, 'افتح فريق الوكلاء', 'Open the agent team')}</Button>
            </Card>
          )}
          <Card>
            <SectionHeader title={tr(lang, 'آخر المستجدات', 'Latest updates')} action={unread ? <Badge tone="accent" dot>{unread}</Badge> : undefined} />
            {notices.length ? (
              <ul className="day-notices">
                {notices.map(notice => (
                  <li key={notice.id} data-unread={!notice.read_at}>
                    <button type="button" onClick={() => void markRead(notice)} disabled={!!notice.read_at}
                      aria-label={notice.read_at ? undefined : tr(lang, 'تعليم كمقروء', 'Mark as read')}>
                      <i aria-hidden="true" />
                      <span>
                        <strong>{lang === 'ar' ? notice.title_ar : notice.title_en}</strong>
                        <small>{new Date(notice.created_at).toLocaleString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="day-muted">{tr(lang, 'لا توجد مستجدات.', 'No updates.')}</p>}
          </Card>
          <Card>
            <SectionHeader title={tr(lang, 'مشاريعي', 'My projects')} action={<Button variant="ghost" size="sm" onClick={() => go('projects')}>{tr(lang, 'الكل', 'All')}</Button>} />
            {projects.length ? (
              <div className="day-projects">
                {projects.map(project => (
                  <ListRow key={project.id} dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<FolderKanban />} tone="brand" title={project.name} onOpen={() => openProject(project.id)} />
                ))}
              </div>
            ) : <p className="day-muted">{tr(lang, 'لست عضوًا في مشروع بعد.', 'You are not on a project yet.')}</p>}
          </Card>
        </div>
      </div>
    </main>
  );
}

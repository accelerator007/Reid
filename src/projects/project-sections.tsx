// The project tabs other than the overview: tasks board, milestones,
// meetings, files, KPIs and activity.
import React from 'react';
import { CalendarClock, FileLock2, FileText, Flag, Gauge, MapPin, Plus, Video, X } from 'lucide-react';
import type { Result } from '../db';
import { Badge, Button, EmptyState, ListRow, Select } from '../ui';
import {
  describeActivity, formatDate, isOverdue, kpiStatuses, milestoneStatuses, priorityOf, statusOf, taskColumns,
  type Activity, type FilePermission, type FileRow, type Kpi, type Lang, type Meeting, type Member, type Milestone, type Task,
} from './model';
import { FileForm, KpiForm, MeetingForm, MilestoneForm } from './project-forms';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

function TabHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="project-tabhead">
      <h2>{title}{count !== undefined && <span>{count}</span>}</h2>
      {action}
    </div>
  );
}

// ---- tasks ------------------------------------------------------------------

export function TasksTab({ lang, tasks, manager, person, now, add, move }: {
  lang: Lang; tasks: Task[]; manager: boolean; person: (id: string | null) => string; now: Date;
  add: () => void; move: (taskId: string, status: string) => void;
}) {
  return (
    <>
      <TabHeader title={tr(lang, 'لوحة المهام', 'Task board')} count={tasks.length}
        action={manager ? <Button variant="primary" size="sm" icon={<Plus />} onClick={add}>{tr(lang, 'مهمة جديدة', 'New task')}</Button> : undefined} />
      <div className="board">
        {Object.entries(taskColumns).map(([column, meta]) => {
          const cards = tasks.filter(task => task.status === column).sort((a, b) => a.priority - b.priority);
          return (
            <section className="board__column" key={column} aria-label={meta.label[lang]}>
              <div className={`board__head ui-tone--${meta.tone}`}><span />{meta.label[lang]}<b>{cards.length}</b></div>
              <div className="board__cards">
                {cards.map(task => {
                  const late = isOverdue(task, now);
                  const priority = priorityOf(task.priority);
                  return (
                    <article className="task-card" key={task.id} data-late={late}>
                      <strong>{task.title}</strong>
                      {task.description && <p>{task.description}</p>}
                      <div className="task-card__meta">
                        <Badge tone={priority.tone}>{priority.label[lang]}</Badge>
                        {task.due_at && <span className="task-card__due"><CalendarClock aria-hidden="true" />{formatDate(task.due_at, lang)}</span>}
                      </div>
                      <div className="task-card__foot">
                        <span className="task-card__who"><i aria-hidden="true">{task.assignee_id ? person(task.assignee_id).slice(0, 1) : '—'}</i>{task.assignee_id ? person(task.assignee_id) : tr(lang, 'بدون مسؤول', 'Unassigned')}</span>
                        {manager && (
                          <Select className="task-card__move" value={task.status} aria-label={tr(lang, `نقل «${task.title}»`, `Move “${task.title}”`)} onChange={event => move(task.id, event.target.value)}>
                            {Object.entries(taskColumns).map(([value, option]) => <option key={value} value={value}>{option.label[lang]}</option>)}
                          </Select>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!cards.length && <p className="board__empty">{tr(lang, 'لا مهام هنا', 'Nothing here')}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

// ---- milestones -----------------------------------------------------------------

export function MilestonesTab({ lang, milestones, manager, add, setStatus }: {
  lang: Lang; milestones: Milestone[]; manager: boolean;
  add: (fields: { title: string; description: string | null; due_date: string | null }) => Promise<Result<unknown>>;
  setStatus: (id: string, status: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <TabHeader title={tr(lang, 'مراحل المشروع', 'Milestones')} count={milestones.length}
        action={manager ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setOpen(true)}>{tr(lang, 'مرحلة', 'Milestone')}</Button> : undefined} />
      {milestones.length ? (
        <ol className="timeline">
          {milestones.map(milestone => {
            const status = statusOf(milestoneStatuses, milestone.status);
            return (
              <li key={milestone.id} className={`timeline__item ui-tone--${status.tone}`} data-status={milestone.status}>
                <span className="timeline__dot" aria-hidden="true"><Flag /></span>
                <div className="timeline__body">
                  <div className="timeline__top">
                    <strong>{milestone.title}</strong>
                    <span className="timeline__date">{formatDate(milestone.due_date, lang)}</span>
                  </div>
                  {milestone.description && <p>{milestone.description}</p>}
                  {manager ? (
                    <Select className="timeline__status" value={milestone.status} aria-label={tr(lang, 'حالة المرحلة', 'Milestone status')} onChange={event => setStatus(milestone.id, event.target.value)}>
                      {Object.entries(milestoneStatuses).map(([value, option]) => <option key={value} value={value}>{option.label[lang]}</option>)}
                    </Select>
                  ) : <Badge tone={status.tone}>{status.label[lang]}</Badge>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <EmptyState icon={<Flag />} title={tr(lang, 'لا توجد مراحل', 'No milestones yet')} description={tr(lang, 'قسّم المشروع إلى مراحل بمواعيد واضحة.', 'Break the project into dated milestones.')} />}
      <MilestoneForm lang={lang} open={open} onClose={() => setOpen(false)} add={add} />
    </>
  );
}

// ---- meetings ------------------------------------------------------------------

export function MeetingsTab({ lang, meetings, manager, now, add }: {
  lang: Lang; meetings: Meeting[]; manager: boolean; now: Date;
  add: (fields: { title: string; agenda: string | null; starts_at: string; ends_at: string; location: string | null }) => Promise<Result<unknown>>;
}) {
  const [open, setOpen] = React.useState(false);
  const upcoming = meetings.filter(meeting => new Date(meeting.ends_at) >= now);
  const past = meetings.filter(meeting => new Date(meeting.ends_at) < now).reverse();
  const card = (meeting: Meeting, done: boolean) => {
    const start = new Date(meeting.starts_at);
    const day = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', timeZone: 'Asia/Muscat' }).format(start);
    const month = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', timeZone: 'Asia/Muscat' }).format(start);
    const time = (value: string) => new Date(value).toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });
    const link = meeting.location && /^https?:\/\//.test(meeting.location);
    return (
      <article className="meeting" key={meeting.id} data-past={done}>
        <div className="meeting__date" aria-hidden="true"><b>{day}</b><span>{month}</span></div>
        <div className="meeting__body">
          <strong>{meeting.title}</strong>
          <span className="meeting__time">{time(meeting.starts_at)} – {time(meeting.ends_at)}</span>
          {meeting.location && (link
            ? <a href={meeting.location} target="_blank" rel="noreferrer" className="meeting__place"><Video aria-hidden="true" />{tr(lang, 'رابط الاجتماع', 'Meeting link')}</a>
            : <span className="meeting__place"><MapPin aria-hidden="true" />{meeting.location}</span>)}
          {meeting.agenda && <p>{meeting.agenda}</p>}
        </div>
      </article>
    );
  };
  return (
    <>
      <TabHeader title={tr(lang, 'الاجتماعات القادمة', 'Upcoming meetings')} count={upcoming.length}
        action={manager ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setOpen(true)}>{tr(lang, 'اجتماع', 'Meeting')}</Button> : undefined} />
      {upcoming.length ? <div className="meetings">{upcoming.map(meeting => card(meeting, false))}</div>
        : <EmptyState icon={<Video />} title={tr(lang, 'لا يوجد اجتماع مجدول', 'Nothing scheduled')} />}
      {past.length > 0 && (
        <details className="project-past">
          <summary>{tr(lang, `الاجتماعات السابقة (${past.length})`, `Past meetings (${past.length})`)}</summary>
          <div className="meetings">{past.map(meeting => card(meeting, true))}</div>
        </details>
      )}
      <MeetingForm lang={lang} open={open} onClose={() => setOpen(false)} add={add} />
    </>
  );
}

// ---- files -------------------------------------------------------------------------

const roles = ['owner', 'super_admin', 'admin', 'hr', 'sales', 'employee', 'project_member', 'research_member', 'guest'];

export function FilesTab({ lang, files, permissions, members, manager, person, upload, grant, revoke, openFile }: {
  lang: Lang; files: FileRow[]; permissions: FilePermission[]; members: Member[]; manager: boolean; person: (id: string | null) => string;
  upload: (file: File, fields: { title: string; category: string; restricted: boolean }) => Promise<Result<unknown>>;
  grant: (fileId: string, grant: { user_id: string | null; role: string | null; can_write: boolean }) => void;
  revoke: (permissionId: string) => void; openFile: (path: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return (
    <>
      <TabHeader title={tr(lang, 'ملفات المشروع', 'Project files')} count={files.length}
        action={manager ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setOpen(true)}>{tr(lang, 'رفع ملف', 'Upload')}</Button> : undefined} />
      {files.length ? (
        <div className="files">
          {files.map(file => {
            const grants = permissions.filter(permission => permission.file_id === file.id);
            return (
              <div className="file" key={file.id}>
                <ListRow dir={dir} icon={file.restricted ? <FileLock2 /> : <FileText />} tone={file.restricted ? 'warning' : 'brand'}
                  title={file.title} description={`${file.category} · ${person(file.uploaded_by)} · ${formatDate(file.created_at, lang)}`}
                  meta={<Button size="sm" onClick={() => void openFile(file.storage_path)}>{tr(lang, 'فتح آمن', 'Open securely')}</Button>} />
                {file.restricted && (
                  <div className="file__grants">
                    <Badge tone="warning">{tr(lang, 'مقيّد', 'Restricted')}</Badge>
                    {grants.map(permission => (
                      <span className="file__grant" key={permission.id}>
                        {permission.user_id ? person(permission.user_id) : permission.role}
                        {' · '}{permission.can_write ? tr(lang, 'قراءة وكتابة', 'read/write') : tr(lang, 'قراءة', 'read')}
                        {manager && <button type="button" onClick={() => revoke(permission.id)} aria-label={tr(lang, 'إزالة الصلاحية', 'Remove access')}><X /></button>}
                      </span>
                    ))}
                    {manager && (
                      <Select className="file__add" defaultValue="" aria-label={tr(lang, 'منح صلاحية', 'Grant access')}
                        onChange={event => {
                          const [kind, value, mode] = event.target.value.split(':');
                          if (value) grant(file.id, { user_id: kind === 'user' ? value : null, role: kind === 'role' ? value : null, can_write: mode === 'write' });
                          event.target.value = '';
                        }}>
                        <option value="">{tr(lang, '+ منح صلاحية…', '+ Grant access…')}</option>
                        <optgroup label={tr(lang, 'أعضاء المشروع', 'Project members')}>
                          {members.map(member => (
                            <React.Fragment key={member.user_id}>
                              <option value={`user:${member.user_id}:read`}>{person(member.user_id)} — {tr(lang, 'قراءة', 'read')}</option>
                              <option value={`user:${member.user_id}:write`}>{person(member.user_id)} — {tr(lang, 'قراءة وكتابة', 'read/write')}</option>
                            </React.Fragment>
                          ))}
                        </optgroup>
                        <optgroup label={tr(lang, 'حسب الدور', 'By role')}>
                          {roles.map(role => <option key={role} value={`role:${role}:read`}>{role}</option>)}
                        </optgroup>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <EmptyState icon={<FileText />} title={tr(lang, 'لا توجد ملفات', 'No files yet')} description={tr(lang, 'العقود والتصاميم والتقارير في مكان واحد وبصلاحيات.', 'Contracts, designs and reports in one governed place.')} />}
      <FileForm lang={lang} open={open} onClose={() => setOpen(false)} upload={upload} />
    </>
  );
}

// ---- KPIs --------------------------------------------------------------------------

export function KpisTab({ lang, kpis, manager, add }: {
  lang: Lang; kpis: Kpi[]; manager: boolean;
  add: (fields: { title: string; target_value: number; current_value: number; unit: string }) => Promise<Result<unknown>>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <TabHeader title={tr(lang, 'مؤشرات الأداء', 'KPIs')} count={kpis.length}
        action={manager ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setOpen(true)}>{tr(lang, 'مؤشر', 'KPI')}</Button> : undefined} />
      {kpis.length ? (
        <div className="kpi-grid">
          {kpis.map(kpi => {
            const status = statusOf(kpiStatuses, kpi.status);
            const percent = kpi.target_value ? Math.min(100, Math.round((kpi.current_value / kpi.target_value) * 100)) : 0;
            return (
              <article className={`kpi ui-tone--${status.tone}`} key={kpi.id}>
                <div className="kpi__top"><strong>{kpi.title}</strong><Badge tone={status.tone}>{status.label[lang]}</Badge></div>
                <div className="kpi__value"><b>{kpi.current_value}</b><span>/ {kpi.target_value} {kpi.unit}</span></div>
                <div className="project-progress project-progress--tone" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={kpi.title}>
                  <span style={{ inlineSize: `${percent}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      ) : <EmptyState icon={<Gauge />} title={tr(lang, 'لا توجد مؤشرات', 'No KPIs yet')} description={tr(lang, 'حدّد ما يعني نجاح المشروع بأرقام.', 'Define success in numbers.')} />}
      <KpiForm lang={lang} open={open} onClose={() => setOpen(false)} add={add} />
    </>
  );
}

// ---- activity ------------------------------------------------------------------------

export function ActivityTab({ lang, activity, person }: { lang: Lang; activity: Activity[]; person: (id: string | null) => string }) {
  return (
    <>
      <TabHeader title={tr(lang, 'سجل النشاط', 'Activity')} count={activity.length} />
      {activity.length ? (
        <ol className="activity">
          {activity.map(entry => (
            <li key={entry.id}>
              <span className="activity__dot" aria-hidden="true" />
              <div>
                <strong>{describeActivity(entry, lang)}</strong>
                <small>{entry.actor_id ? person(entry.actor_id) : tr(lang, 'النظام', 'System')} · {formatDate(entry.created_at, lang, true)}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : <EmptyState icon={<Flag />} title={tr(lang, 'لا يوجد نشاط بعد', 'No activity yet')} />}
    </>
  );
}

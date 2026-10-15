import React from 'react';
import { CheckSquare, Calendar, User as UserIcon } from 'lucide-react';
import {
  Badge,
  Card,
  Field,
  FormGrid,
  Select,
  TextArea,
  TextInput,
} from '../ui';
import {
  type Lang,
  type Research,
  type Person,
  type Member,
  type Task,
  taskColumns,
  tr,
} from './model';
import * as api from './api';

export function ResearchTasks({
  lang,
  research,
  tasks,
  people,
  members,
  currentUserId,
  isSupervisor,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  tasks: Task[];
  people: Person[];
  members: Member[];
  currentUserId: string;
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';

  return (
    <div className="research-tasks-wrapper">
      <div className="research-kanban-board">
        {Object.entries(taskColumns).map(([colKey, colOpt]) => {
          const colTasks = tasks.filter(t => t.status === colKey);
          return (
            <div key={colKey} className="research-kanban-col">
              <div className="research-kanban-col__header">
                <span className="research-kanban-col__title">{colOpt.label[lang]}</span>
                <Badge tone={colOpt.tone}>{colTasks.length}</Badge>
              </div>

              <div className="research-kanban-col__list">
                {colTasks.length === 0 ? (
                  <div className="research-kanban-empty">
                    <small>{tr(lang, 'لا توجد مهام', 'No tasks')}</small>
                  </div>
                ) : (
                  colTasks.map(t => {
                    const canEdit = isSupervisor || t.assignee_id === currentUserId;
                    return (
                      <Card key={t.id} className="research-task-card">
                        <strong className="research-task-card__title">{t.title}</strong>
                        {t.description && <p className="research-task-card__desc">{t.description}</p>}

                        <div className="research-task-card__meta">
                          <span className="research-meta-item">
                            <UserIcon size={13} />
                            {personName(t.assignee_id)}
                          </span>
                          {t.due_at && (
                            <span className="research-meta-item">
                              <Calendar size={13} />
                              {t.due_at.slice(0, 10)}
                            </span>
                          )}
                        </div>

                        {canEdit && (
                          <div className="research-task-card__action">
                            <Select
                              aria-label={tr(lang, 'تغيير حالة المهمة', 'Change task status')}
                              value={t.status}
                              disabled={busy}
                              onChange={e => onRun(() => api.updateTaskStatus(t.id, e.target.value))}
                            >
                              {Object.entries(taskColumns).map(([k, opt]) => (
                                <option key={k} value={k}>
                                  {opt.label[lang]}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Task Form (Supervisor only) */}
      {isSupervisor && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <CheckSquare size={18} />
            <h3>{tr(lang, 'إضافة مهمة جديدة لمسار البحث', 'Create Research Task')}</h3>
          </div>

          <FormGrid
            submit={tr(lang, 'إضافة المهمة', 'Add Task')}
            busy={busy}
            onSubmit={async (data, form) => {
              const title = data.get('title') as string;
              if (!title) return;
              await onRun(() =>
                api.createTask(
                  research.id,
                  {
                    title,
                    description: (data.get('description') as string) || null,
                    assignee_id: (data.get('assignee_id') as string) || null,
                    due_at: (data.get('due_at') as string) || null,
                  },
                  currentUserId,
                ),
              );
              form.reset();
            }}
          >
            <Field label={tr(lang, 'عنوان المهمة', 'Task Title')} required wide>
              <TextInput name="title" required placeholder={tr(lang, 'مثال: إعداد خوارزمية المعالجة…', 'e.g. Prepare data preprocessing algorithm')} />
            </Field>
            <Field label={tr(lang, 'المسؤول عن المهمة', 'Assignee')}>
              <Select name="assignee_id" defaultValue="">
                <option value="">{tr(lang, '— بدون تعيين —', '— Unassigned —')}</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {personName(m.user_id)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr(lang, 'تاريخ الاستحقاق', 'Due Date')}>
              <TextInput name="due_at" type="date" />
            </Field>
            <Field label={tr(lang, 'تفاصيل المهمة والمخرجات', 'Description')} wide>
              <TextArea name="description" placeholder={tr(lang, 'مواصفات الإنجاز والملاحظات…', 'Task deliverables and notes…')} />
            </Field>
          </FormGrid>
        </Card>
      )}
    </div>
  );
}

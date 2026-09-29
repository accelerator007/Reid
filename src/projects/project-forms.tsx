// The forms behind every "add" and "edit" in the projects pages. Each lives in
// a dialog, reports its own error, and closes only after the write succeeded.
import React from 'react';
import { messageFor, type Result } from '../db';
import { Checkbox, Dialog, Field, FormGrid, InlineAlert, Select, TextArea, TextInput } from '../ui';
import { labelOf, memberRoles, priorities, projectStatuses, projectTypes, type Lang, type Member, type Person, type Project } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
const optional = (data: FormData, name: string) => text(data, name) || null;

type FormDialogProps = { lang: Lang; open: boolean; onClose: () => void };

/** Shared dialog wrapper: runs the write, shows its error, closes on success. */
function WriteDialog({ lang, open, onClose, title, description, submit, write, children, size }: FormDialogProps & {
  title: string; description?: string; submit: string; size?: 'md' | 'lg';
  write: (data: FormData) => Promise<Result<unknown>>; children: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (open) setError(''); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} closeLabel={tr(lang, 'إغلاق', 'Close')} size={size}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <FormGrid
        busy={busy} submit={submit} cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }}
        onSubmit={async (data, form) => {
          setBusy(true);
          const result = await write(data);
          setBusy(false);
          if (result.ok) { form.reset(); onClose(); } else setError(messageFor(result.error, lang));
        }}
      >
        {children}
      </FormGrid>
    </Dialog>
  );
}

export function ProjectForm({ lang, open, onClose, people, project, save }: FormDialogProps & {
  people: Person[]; project?: Project; save: (fields: Record<string, string | null>, managerId: string) => Promise<Result<unknown>>;
}) {
  const editing = !!project;
  return (
    <WriteDialog
      lang={lang} open={open} onClose={onClose} size="lg"
      title={editing ? tr(lang, 'إعدادات المشروع', 'Project settings') : tr(lang, 'مشروع جديد', 'New project')}
      description={editing ? undefined : tr(lang, 'يبدأ المشروع بحالة «تخطيط»، ويصبح مديره أول عضو فيه.', 'The project starts in planning; its manager becomes the first member.')}
      submit={editing ? tr(lang, 'حفظ التغييرات', 'Save changes') : tr(lang, 'إنشاء المشروع', 'Create project')}
      write={data => save({
        name: text(data, 'name'), description: optional(data, 'description'), client_name: optional(data, 'client_name'),
        github_repo: optional(data, 'github_repo'), target_date: optional(data, 'target_date'),
        ...(editing ? { status: text(data, 'status') } : { type: text(data, 'type'), start_date: optional(data, 'start_date') }),
      }, text(data, 'manager_id'))}
    >
      <Field label={tr(lang, 'اسم المشروع', 'Project name')} required wide>
        <TextInput name="name" required maxLength={160} defaultValue={project?.name} />
      </Field>
      {!editing && (
        <Field label={tr(lang, 'النوع', 'Type')}>
          <Select name="type" defaultValue="client">
            {Object.keys(projectTypes).map(type => <option key={type} value={type}>{labelOf(projectTypes, type, lang)}</option>)}
          </Select>
        </Field>
      )}
      {editing ? (
        <Field label={tr(lang, 'الحالة', 'Status')}>
          <Select name="status" defaultValue={project.status}>
            {Object.entries(projectStatuses).map(([value, status]) => <option key={value} value={value}>{status.label[lang]}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label={tr(lang, 'مدير المشروع', 'Project manager')} required>
          <Select name="manager_id" required defaultValue="">
            <option value="" disabled>{tr(lang, 'اختر…', 'Choose…')}</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={tr(lang, 'العميل', 'Client')}><TextInput name="client_name" defaultValue={project?.client_name ?? ''} /></Field>
      <Field label={tr(lang, 'الموعد المستهدف', 'Target date')}><TextInput name="target_date" type="date" defaultValue={project?.target_date ?? ''} /></Field>
      {!editing && <Field label={tr(lang, 'تاريخ البدء', 'Start date')}><TextInput name="start_date" type="date" /></Field>}
      <Field label={tr(lang, 'مستودع GitHub', 'GitHub repository')}>
        <TextInput name="github_repo" type="url" placeholder="https://github.com/…" defaultValue={project?.github_repo ?? ''} dir="ltr" />
      </Field>
      <Field label={tr(lang, 'الوصف', 'Description')} wide><TextArea name="description" defaultValue={project?.description ?? ''} /></Field>
    </WriteDialog>
  );
}

export function MemberForm({ lang, open, onClose, people, members, add }: FormDialogProps & {
  people: Person[]; members: Member[]; add: (userId: string, role: string) => Promise<Result<unknown>>;
}) {
  const available = people.filter(person => !members.some(member => member.user_id === person.id));
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'إضافة عضو', 'Add a member')} submit={tr(lang, 'إضافة', 'Add')}
      write={data => add(text(data, 'user_id'), text(data, 'role'))}>
      <Field label={tr(lang, 'الشخص', 'Person')} required>
        <Select name="user_id" required defaultValue="">
          <option value="" disabled>{tr(lang, 'اختر…', 'Choose…')}</option>
          {available.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </Select>
      </Field>
      <Field label={tr(lang, 'الدور', 'Role')}>
        <Select name="role" defaultValue="member">
          {Object.keys(memberRoles).map(role => <option key={role} value={role}>{labelOf(memberRoles, role, lang)}</option>)}
        </Select>
      </Field>
    </WriteDialog>
  );
}

export function TaskForm({ lang, open, onClose, members, person, add }: FormDialogProps & {
  members: Member[]; person: (id: string | null) => string;
  add: (fields: { title: string; description: string | null; assignee_id: string | null; priority: number; due_at: string | null }) => Promise<Result<unknown>>;
}) {
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'مهمة جديدة', 'New task')} submit={tr(lang, 'إضافة المهمة', 'Add task')}
      write={data => add({
        title: text(data, 'title'), description: optional(data, 'description'), assignee_id: optional(data, 'assignee_id'),
        priority: Number(text(data, 'priority') || 3), due_at: optional(data, 'due_at') ? new Date(`${text(data, 'due_at')}T17:00:00+04:00`).toISOString() : null,
      })}>
      <Field label={tr(lang, 'المهمة', 'Task')} required wide><TextInput name="title" required maxLength={200} /></Field>
      <Field label={tr(lang, 'المسؤول', 'Assignee')}>
        <Select name="assignee_id" defaultValue="">
          <option value="">{tr(lang, 'بدون مسؤول', 'Unassigned')}</option>
          {members.map(member => <option key={member.user_id} value={member.user_id}>{person(member.user_id)}</option>)}
        </Select>
      </Field>
      <Field label={tr(lang, 'الأولوية', 'Priority')}>
        <Select name="priority" defaultValue="3">
          {Object.entries(priorities).map(([value, priority]) => <option key={value} value={value}>{priority.label[lang]}</option>)}
        </Select>
      </Field>
      <Field label={tr(lang, 'تاريخ الاستحقاق', 'Due date')}><TextInput name="due_at" type="date" /></Field>
      <Field label={tr(lang, 'التفاصيل', 'Details')} wide><TextArea name="description" /></Field>
    </WriteDialog>
  );
}

export function MilestoneForm({ lang, open, onClose, add }: FormDialogProps & {
  add: (fields: { title: string; description: string | null; due_date: string | null }) => Promise<Result<unknown>>;
}) {
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'مرحلة جديدة', 'New milestone')} submit={tr(lang, 'إضافة', 'Add')}
      write={data => add({ title: text(data, 'title'), description: optional(data, 'description'), due_date: optional(data, 'due_date') })}>
      <Field label={tr(lang, 'المرحلة', 'Milestone')} required><TextInput name="title" required maxLength={160} /></Field>
      <Field label={tr(lang, 'الموعد', 'Due date')} required><TextInput name="due_date" type="date" required /></Field>
      <Field label={tr(lang, 'الوصف', 'Description')} wide><TextArea name="description" /></Field>
    </WriteDialog>
  );
}

export function MeetingForm({ lang, open, onClose, add }: FormDialogProps & {
  add: (fields: { title: string; agenda: string | null; starts_at: string; ends_at: string; location: string | null }) => Promise<Result<unknown>>;
}) {
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'اجتماع جديد', 'New meeting')} submit={tr(lang, 'جدولة', 'Schedule')}
      write={data => add({
        title: text(data, 'title'), agenda: optional(data, 'agenda'), location: optional(data, 'location'),
        starts_at: new Date(text(data, 'starts_at')).toISOString(), ends_at: new Date(text(data, 'ends_at')).toISOString(),
      })}>
      <Field label={tr(lang, 'الاجتماع', 'Meeting')} required wide><TextInput name="title" required maxLength={160} /></Field>
      <Field label={tr(lang, 'يبدأ', 'Starts')} required><TextInput name="starts_at" type="datetime-local" required /></Field>
      <Field label={tr(lang, 'ينتهي', 'Ends')} required><TextInput name="ends_at" type="datetime-local" required /></Field>
      <Field label={tr(lang, 'المكان أو الرابط', 'Place or link')} wide><TextInput name="location" /></Field>
      <Field label={tr(lang, 'جدول الأعمال', 'Agenda')} wide><TextArea name="agenda" /></Field>
    </WriteDialog>
  );
}

export function FileForm({ lang, open, onClose, upload }: FormDialogProps & {
  upload: (file: File, fields: { title: string; category: string; restricted: boolean }) => Promise<Result<unknown>>;
}) {
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'رفع ملف', 'Upload a file')}
      description={tr(lang, 'الملفات خاصة بأعضاء المشروع، والمقيّدة تحتاج صلاحية صريحة.', 'Files are private to members; restricted ones need an explicit grant.')}
      submit={tr(lang, 'رفع', 'Upload')}
      write={data => upload(data.get('file') as File, { title: text(data, 'title'), category: text(data, 'category') || 'general', restricted: data.get('restricted') === 'on' })}>
      <Field label={tr(lang, 'اسم الملف', 'Title')} required><TextInput name="title" required maxLength={160} /></Field>
      <Field label={tr(lang, 'التصنيف', 'Category')}><TextInput name="category" placeholder={tr(lang, 'عقد، تصميم، تقرير…', 'Contract, design, report…')} /></Field>
      <Field label={tr(lang, 'الملف', 'File')} required wide><TextInput name="file" type="file" required /></Field>
      <Checkbox name="restricted" label={tr(lang, 'مقيّد: لا يفتحه إلا من أمنحه صلاحية', 'Restricted: only people I grant can open it')} />
    </WriteDialog>
  );
}

export function KpiForm({ lang, open, onClose, add }: FormDialogProps & {
  add: (fields: { title: string; target_value: number; current_value: number; unit: string }) => Promise<Result<unknown>>;
}) {
  return (
    <WriteDialog lang={lang} open={open} onClose={onClose} title={tr(lang, 'مؤشر أداء جديد', 'New KPI')} submit={tr(lang, 'إضافة', 'Add')}
      write={data => add({ title: text(data, 'title'), target_value: Number(text(data, 'target')), current_value: Number(text(data, 'current') || 0), unit: text(data, 'unit') })}>
      <Field label={tr(lang, 'المؤشر', 'Indicator')} required wide><TextInput name="title" required maxLength={160} /></Field>
      <Field label={tr(lang, 'الهدف', 'Target')} required><TextInput name="target" type="number" step="any" required /></Field>
      <Field label={tr(lang, 'القيمة الحالية', 'Current value')}><TextInput name="current" type="number" step="any" defaultValue="0" /></Field>
      <Field label={tr(lang, 'الوحدة', 'Unit')} wide><TextInput name="unit" placeholder={tr(lang, 'مستخدم، ٪، ساعة…', 'users, %, hours…')} /></Field>
    </WriteDialog>
  );
}

// Every "add" and "edit" dialog on the people pages. Field names match the
// database columns; the caller adds who and for whom.
import React from 'react';
import { messageFor, type Result } from '../db';
import { Dialog, Field, FormGrid, InlineAlert, Select, TextArea, TextInput } from '../ui';
import { documentCategories, employmentStatuses, type Department, type Lang, type Person } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

export type PeopleDialog = 'profile' | 'department' | 'announcement' | 'event' | 'onboarding' | 'task' | 'kpi' | 'review' | 'document' | 'time' | null;
type Kind = Exclude<PeopleDialog, null>;

const titles: Record<Kind, { ar: string; en: string }> = {
  profile: { ar: 'بيانات الموظف', en: 'Employee details' },
  department: { ar: 'قسم جديد', en: 'New department' },
  announcement: { ar: 'إعلان جديد', en: 'New announcement' },
  event: { ar: 'موعد جديد', en: 'New event' },
  onboarding: { ar: 'خطوة تهيئة', en: 'Onboarding step' },
  task: { ar: 'مهمة جديدة', en: 'New task' },
  kpi: { ar: 'مؤشر أداء', en: 'New KPI' },
  review: { ar: 'تقييم أداء', en: 'Performance review' },
  document: { ar: 'رفع مستند', en: 'Upload a document' },
  time: { ar: 'تسجيل ساعات', en: 'Log hours' },
};

type Props = {
  lang: Lang; open: PeopleDialog; onClose: () => void; staff: boolean;
  person?: Person; departments: Department[];
  save: (kind: Kind, fields: Record<string, string | number | null>, file?: File) => Promise<Result<unknown>>;
};

export function PeopleForms({ lang, open, onClose, staff, person, departments, save }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (open) setError(''); }, [open]);
  if (!open) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());

  const submit = async (data: FormData, form: HTMLFormElement) => {
    const fields: Record<string, string | number | null> = {};
    let file: File | undefined;
    data.forEach((value, key) => {
      if (value instanceof File) { file = value; return; }
      fields[key] = String(value).trim() || null;
    });
    for (const key of ['priority', 'target_value', 'current_value', 'rating']) if (fields[key] !== undefined && fields[key] !== null) fields[key] = Number(fields[key]);
    if (open === 'time') fields.minutes = Math.round(Number(fields.hours ?? 0) * 60) + Number(fields.extra_minutes ?? 0);
    delete fields.hours; delete fields.extra_minutes;
    for (const key of ['starts_at', 'ends_at', 'due_at']) if (fields[key]) fields[key] = new Date(String(fields[key])).toISOString();
    setBusy(true);
    const result = await save(open, fields, file);
    setBusy(false);
    if (result.ok) { form.reset(); onClose(); } else setError(messageFor(result.error, lang));
  };

  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={titles[open][lang]}
      description={person && ['profile', 'onboarding', 'task', 'kpi', 'review', 'document'].includes(open) ? person.full_name : undefined}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <FormGrid busy={busy} submit={tr(lang, 'حفظ', 'Save')} cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }} onSubmit={submit}>
        {open === 'profile' && person && <>
          <Field label={tr(lang, 'المسمى الوظيفي', 'Position')} required><TextInput name="position" required defaultValue={person.position ?? ''} /></Field>
          <Field label={tr(lang, 'القسم', 'Department')}>
            <Select name="department_id" defaultValue={person.department_id ?? ''}>
              <option value="">—</option>
              {departments.map(department => <option key={department.id} value={department.id}>{lang === 'ar' ? department.name_ar : department.name_en}</option>)}
            </Select>
          </Field>
          <Field label={tr(lang, 'تاريخ التعيين', 'Hire date')}><TextInput name="hire_date" type="date" defaultValue={person.hire_date ?? ''} /></Field>
          <Field label={tr(lang, 'الحالة', 'Status')}>
            <Select name="employment_status" defaultValue={person.employment_status}>
              {Object.entries(employmentStatuses).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}
            </Select>
          </Field>
        </>}
        {open === 'department' && <>
          <Field label="الاسم بالعربية" required><TextInput name="name_ar" required dir="rtl" /></Field>
          <Field label="Name in English" required><TextInput name="name_en" required dir="ltr" /></Field>
          <Field label={tr(lang, 'الوصف', 'Description')} wide><TextArea name="description" /></Field>
        </>}
        {open === 'announcement' && <>
          <Field label="العنوان بالعربية" required><TextInput name="title_ar" required dir="rtl" /></Field>
          <Field label="Title in English" required><TextInput name="title_en" required dir="ltr" /></Field>
          <Field label="النص بالعربية" required wide><TextArea name="body_ar" required dir="rtl" /></Field>
          <Field label="Text in English" required wide><TextArea name="body_en" required dir="ltr" /></Field>
        </>}
        {open === 'event' && <>
          <Field label={tr(lang, 'العنوان', 'Title')} required wide><TextInput name="title" required maxLength={160} /></Field>
          <Field label={tr(lang, 'يبدأ', 'Starts')} required><TextInput name="starts_at" type="datetime-local" required /></Field>
          <Field label={tr(lang, 'ينتهي', 'Ends')} required><TextInput name="ends_at" type="datetime-local" required /></Field>
          <Field label={tr(lang, 'من يراه', 'Who sees it')}>
            <Select name="visibility" defaultValue="private">
              <option value="private">{tr(lang, 'خاص', 'Private')}</option>
              {staff && <option value="company">{tr(lang, 'كل الشركة', 'Whole company')}</option>}
            </Select>
          </Field>
          <Field label={tr(lang, 'التفاصيل', 'Details')} wide><TextArea name="description" /></Field>
        </>}
        {open === 'onboarding' && <>
          <Field label="الخطوة بالعربية" required><TextInput name="title_ar" required dir="rtl" /></Field>
          <Field label="Step in English" required><TextInput name="title_en" required dir="ltr" /></Field>
          <Field label={tr(lang, 'الموعد', 'Due')}><TextInput name="due_date" type="date" /></Field>
        </>}
        {open === 'task' && <>
          <Field label={tr(lang, 'المهمة', 'Task')} required wide><TextInput name="title" required maxLength={200} /></Field>
          <Field label={tr(lang, 'الأولوية', 'Priority')}>
            <Select name="priority" defaultValue="3">
              <option value="1">{tr(lang, 'عاجلة', 'Urgent')}</option><option value="2">{tr(lang, 'عالية', 'High')}</option>
              <option value="3">{tr(lang, 'متوسطة', 'Medium')}</option><option value="4">{tr(lang, 'منخفضة', 'Low')}</option>
            </Select>
          </Field>
          <Field label={tr(lang, 'الموعد', 'Due')}><TextInput name="due_at" type="datetime-local" /></Field>
          <Field label={tr(lang, 'التفاصيل', 'Details')} wide><TextArea name="description" /></Field>
        </>}
        {open === 'kpi' && <>
          <Field label={tr(lang, 'المؤشر', 'Indicator')} required wide><TextInput name="title" required /></Field>
          <Field label={tr(lang, 'الهدف', 'Target')} required><TextInput name="target_value" type="number" step="any" required /></Field>
          <Field label={tr(lang, 'الحالي', 'Current')}><TextInput name="current_value" type="number" step="any" defaultValue="0" /></Field>
          <Field label={tr(lang, 'الوحدة', 'Unit')}><TextInput name="unit" /></Field>
          <Field label={tr(lang, 'من', 'From')} required><TextInput name="period_start" type="date" required /></Field>
          <Field label={tr(lang, 'إلى', 'To')} required><TextInput name="period_end" type="date" required /></Field>
        </>}
        {open === 'review' && <>
          <Field label={tr(lang, 'التقييم من 5', 'Rating (1–5)')} required><TextInput name="rating" type="number" min={1} max={5} step="0.5" required /></Field>
          <Field label={tr(lang, 'من', 'From')} required><TextInput name="period_start" type="date" required /></Field>
          <Field label={tr(lang, 'إلى', 'To')} required><TextInput name="period_end" type="date" required /></Field>
          <Field label={tr(lang, 'الخلاصة', 'Summary')} required wide><TextArea name="summary" required /></Field>
          <Field label={tr(lang, 'نقاط القوة', 'Strengths')} wide><TextArea name="strengths" /></Field>
          <Field label={tr(lang, 'فرص التحسين', 'To improve')} wide><TextArea name="improvements" /></Field>
        </>}
        {open === 'document' && <>
          <Field label={tr(lang, 'اسم المستند', 'Title')} required><TextInput name="title" required /></Field>
          <Field label={tr(lang, 'التصنيف', 'Category')}>
            <Select name="category" defaultValue="general">
              {Object.entries(documentCategories).map(([key, value]) => <option key={key} value={key}>{value[lang]}</option>)}
            </Select>
          </Field>
          <Field label={tr(lang, 'الملف (PDF أو صورة أو نص، حتى 10MB)', 'File (PDF, image or text, up to 10 MB)')} required wide>
            <TextInput name="file" type="file" required accept="application/pdf,image/png,image/jpeg,text/plain" />
          </Field>
        </>}
        {open === 'time' && <>
          <Field label={tr(lang, 'اليوم', 'Day')} required><TextInput name="work_date" type="date" required defaultValue={today} max={today} /></Field>
          <Field label={tr(lang, 'الساعات', 'Hours')} required><TextInput name="hours" type="number" min={0} max={16} step="0.25" required defaultValue="1" /></Field>
          <Field label={tr(lang, 'ماذا أنجزت؟', 'What did you work on?')} wide><TextArea name="notes" /></Field>
        </>}
      </FormGrid>
    </Dialog>
  );
}

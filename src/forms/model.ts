// Workshop forms: question types, templates, validation that mirrors the
// server's submit_form_response, per-question summaries and export rows.
// Pure, so it is tested; the pages only render what this module decides.
import { arabicCount } from '../owner-overview.model';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };

export type QuestionType =
  | 'short' | 'paragraph' | 'choice' | 'checkbox' | 'dropdown' | 'image_choice' | 'rating' | 'scale'
  | 'file' | 'email' | 'phone' | 'number' | 'date' | 'time' | 'section';
export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'powerpoint' | 'text';
export type Theme = 'brand' | 'accent' | 'blue' | 'green' | 'amber' | 'red' | 'neutral';
export type FormRole = 'owner' | 'editor' | 'viewer';

export type Option = { id: string; label: string; image?: string | null };
export type Question = {
  id: string; type: QuestionType; title: string; description?: string; image?: string | null; required?: boolean;
  options?: Option[]; other?: boolean; min?: number; max?: number; minLabel?: string; maxLabel?: string; accept?: FileKind[];
};
export type Workshop = { number?: string; name?: string; date?: string; presenter?: string; location?: string };
export type Form = {
  id: string; owner_id: string; title: string; description: string; cover_url: string | null; theme: Theme; workshop: Workshop;
  workshop_id: string | null; accepting: boolean; one_per_device: boolean; confirm_message: string; close_at: string | null;
  questions: Question[]; created_at: string; updated_at: string;
};
export type FileAnswer = { path: string; name: string; size: number; mime: string };
export type Answer = string | number | string[] | FileAnswer[];
export type Answers = Record<string, Answer>;
export type FormResponse = { id: string; form_id: string; answers: Answers; created_at: string };

/** The series every form belongs to, shown under the QR code and on the public page. */
export const SERIES = { ar: 'ورش ريّد', en: 'Reid Workshops' };
export const MAX_FILE_MB = 10;
export const MAX_COLLABORATORS = 50;

export const newId = () => Math.random().toString(36).slice(2, 10);

export const questionTypes: Record<QuestionType, { label: Label; group: 'text' | 'choice' | 'scale' | 'other' | 'layout' }> = {
  short: { label: { ar: 'إجابة قصيرة', en: 'Short answer' }, group: 'text' },
  paragraph: { label: { ar: 'فقرة', en: 'Paragraph' }, group: 'text' },
  choice: { label: { ar: 'اختيار من متعدد', en: 'Multiple choice' }, group: 'choice' },
  checkbox: { label: { ar: 'مربعات اختيار', en: 'Checkboxes' }, group: 'choice' },
  dropdown: { label: { ar: 'قائمة منسدلة', en: 'Dropdown' }, group: 'choice' },
  image_choice: { label: { ar: 'اختيار بالصور', en: 'Image choice' }, group: 'choice' },
  rating: { label: { ar: 'تقييم بالنجوم', en: 'Star rating' }, group: 'scale' },
  scale: { label: { ar: 'مقياس خطي', en: 'Linear scale' }, group: 'scale' },
  file: { label: { ar: 'رفع ملف', en: 'File upload' }, group: 'other' },
  email: { label: { ar: 'بريد إلكتروني', en: 'Email' }, group: 'text' },
  phone: { label: { ar: 'رقم هاتف', en: 'Phone' }, group: 'text' },
  number: { label: { ar: 'رقم', en: 'Number' }, group: 'text' },
  date: { label: { ar: 'تاريخ', en: 'Date' }, group: 'other' },
  time: { label: { ar: 'وقت', en: 'Time' }, group: 'other' },
  section: { label: { ar: 'قسم (صفحة جديدة)', en: 'Section (new page)' }, group: 'layout' },
};

export const themes: Theme[] = ['brand', 'accent', 'blue', 'green', 'amber', 'red', 'neutral'];
export const themeNames: Record<Theme, Label> = {
  brand: { ar: 'بنفسجي', en: 'Violet' }, accent: { ar: 'وردي', en: 'Rose' }, blue: { ar: 'أزرق', en: 'Blue' },
  green: { ar: 'أخضر', en: 'Green' }, amber: { ar: 'كهرماني', en: 'Amber' }, red: { ar: 'أحمر', en: 'Red' }, neutral: { ar: 'رمادي', en: 'Grey' },
};

export const fileKinds: Record<FileKind, { label: Label; mimes: string[]; extensions: string[] }> = {
  pdf: { label: { ar: 'PDF', en: 'PDF' }, mimes: ['application/pdf'], extensions: ['.pdf'] },
  image: { label: { ar: 'صور', en: 'Images' }, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], extensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
  word: { label: { ar: 'Word', en: 'Word' }, mimes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], extensions: ['.doc', '.docx'] },
  excel: { label: { ar: 'Excel', en: 'Excel' }, mimes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'], extensions: ['.xls', '.xlsx', '.csv'] },
  powerpoint: { label: { ar: 'PowerPoint', en: 'PowerPoint' }, mimes: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], extensions: ['.ppt', '.pptx'] },
  text: { label: { ar: 'نص', en: 'Text' }, mimes: ['text/plain'], extensions: ['.txt'] },
};

const hasOptions = (type: QuestionType) => ['choice', 'checkbox', 'dropdown', 'image_choice'].includes(type);

export function newQuestion(type: QuestionType, lang: Lang = 'ar'): Question {
  const base: Question = { id: newId(), type, title: '', required: false };
  const option = (n: number): Option => ({ id: newId(), label: lang === 'ar' ? `الخيار ${n}` : `Option ${n}` });
  if (hasOptions(type)) return { ...base, options: [option(1), option(2)] };
  if (type === 'rating') return { ...base, max: 5 };
  if (type === 'scale') return { ...base, min: 1, max: 5, minLabel: '', maxLabel: '' };
  if (type === 'file') return { ...base, accept: ['pdf', 'image'] };
  if (type === 'section') return { id: base.id, type, title: '' };
  return base;
}

/** Changing a question's type keeps everything the new type can use. */
export function convertQuestion(question: Question, type: QuestionType, lang: Lang = 'ar'): Question {
  if (type === question.type) return question;
  const fresh = newQuestion(type, lang);
  const kept: Question = { ...fresh, id: question.id, title: question.title, description: question.description, image: question.image };
  if (type !== 'section') kept.required = question.required ?? false;
  if (hasOptions(type) && question.options?.length) kept.options = question.options.map(option => (type === 'image_choice' ? option : { id: option.id, label: option.label }));
  if (type === 'choice' || type === 'checkbox') kept.other = question.other ?? false;
  if ((type === 'rating' || type === 'scale') && question.max) kept.max = type === 'rating' ? clamp(question.max, 3, 10) : clamp(question.max, 2, 10);
  return kept;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Pasting several lines into an option adds one option per line. */
export function parseOptions(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-•*]|\d+[.)-])\s*/, '').trim()).filter(Boolean).slice(0, 100);
}

export function duplicateQuestion(question: Question): Question {
  return { ...question, id: newId(), options: question.options?.map(option => ({ ...option, id: newId() })) };
}

export function moveQuestion(questions: Question[], index: number, by: -1 | 1): Question[] {
  const target = index + by;
  if (target < 0 || target >= questions.length) return questions;
  const next = [...questions];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ---- templates ---------------------------------------------------------------------

export type TemplateId = 'blank' | 'registration' | 'evaluation' | 'attendance' | 'idea' | 'vote';
type Template = { id: TemplateId; label: Label; hint: Label; build: (lang: Lang) => Pick<Form, 'title' | 'description' | 'questions' | 'one_per_device'> };

const q = (type: QuestionType, title: string, extra: Partial<Question> = {}): Question => ({ ...newQuestion(type), title, ...extra });
const opts = (...labels: string[]): Option[] => labels.map(label => ({ id: newId(), label }));

export const templates: Template[] = [
  { id: 'blank', label: { ar: 'نموذج فارغ', en: 'Blank form' }, hint: { ar: 'ابدأ من الصفر', en: 'Start from scratch' },
    build: lang => ({ title: lang === 'ar' ? 'نموذج بدون عنوان' : 'Untitled form', description: '', questions: [q('short', lang === 'ar' ? 'سؤال بدون عنوان' : 'Untitled question')], one_per_device: false }) },
  { id: 'registration', label: { ar: 'تسجيل في ورشة', en: 'Workshop registration' }, hint: { ar: 'الاسم والتواصل والمستوى', en: 'Name, contact and level' },
    build: () => ({ title: 'التسجيل في الورشة', description: 'سجّل بياناتك لحجز مقعدك. سنتواصل معك لتأكيد التسجيل.', one_per_device: false, questions: [
      q('short', 'الاسم الكامل', { required: true }), q('email', 'البريد الإلكتروني', { required: true }), q('phone', 'رقم الهاتف', { required: true }),
      q('short', 'جهة العمل أو الدراسة'),
      q('choice', 'مستوى خبرتك في الموضوع', { required: true, options: opts('مبتدئ', 'متوسط', 'متقدم') }),
      q('paragraph', 'ماذا تتوقع أن تتعلم؟'),
    ] }) },
  { id: 'evaluation', label: { ar: 'تقييم ورشة', en: 'Workshop evaluation' }, hint: { ar: 'نجوم ومقياس وملاحظات', en: 'Stars, scale and comments' },
    build: () => ({ title: 'تقييم الورشة', description: 'رأيك يساعدنا نطوّر الورش القادمة. التقييم يأخذ دقيقة.', one_per_device: true, questions: [
      q('rating', 'تقييمك العام للورشة', { required: true, max: 5 }),
      q('rating', 'تقييم المقدّم', { required: true, max: 5 }),
      q('scale', 'إلى أي حد كان المحتوى مفيدًا لعملك؟', { required: true, min: 1, max: 10, minLabel: 'غير مفيد', maxLabel: 'مفيد جدًا' }),
      q('choice', 'هل كانت مدة الورشة مناسبة؟', { options: opts('قصيرة', 'مناسبة', 'طويلة') }),
      q('paragraph', 'أكثر شيء أعجبك'), q('paragraph', 'ماذا نحسّن؟'),
    ] }) },
  { id: 'attendance', label: { ar: 'تسجيل حضور', en: 'Attendance' }, hint: { ar: 'سريع عند باب القاعة', en: 'Quick check-in at the door' },
    build: () => ({ title: 'تسجيل الحضور', description: 'سجّل حضورك في الورشة.', one_per_device: true, questions: [
      q('short', 'الاسم الكامل', { required: true }), q('phone', 'رقم الهاتف', { required: true }),
      q('choice', 'الجلسة', { required: true, options: opts('الصباحية', 'المسائية') }),
    ] }) },
  { id: 'idea', label: { ar: 'تقديم فكرة', en: 'Submit an idea' }, hint: { ar: 'وصف ومرفق', en: 'Description and attachment' },
    build: () => ({ title: 'قدّم فكرتك', description: 'شاركنا فكرتك وسنراجع كل الأفكار بعد الورشة.', one_per_device: false, questions: [
      q('short', 'اسم صاحب الفكرة', { required: true }), q('email', 'البريد الإلكتروني', { required: true }),
      q('short', 'عنوان الفكرة', { required: true }), q('paragraph', 'وصف الفكرة والمشكلة التي تحلها', { required: true }),
      q('dropdown', 'المجال', { options: opts('تعليم', 'صحة', 'بيئة', 'تقنية', 'أخرى') }),
      q('file', 'ملف توضيحي (اختياري)', { accept: ['pdf', 'image', 'powerpoint'] }),
    ] }) },
  { id: 'vote', label: { ar: 'تصويت بالصور', en: 'Image vote' }, hint: { ar: 'اختر التصميم الأفضل', en: 'Pick the best design' },
    build: () => ({ title: 'التصويت على أفضل تصميم', description: 'اختر التصميم الذي أعجبك أكثر. صوت واحد لكل جهاز.', one_per_device: true, questions: [
      q('image_choice', 'أي تصميم تختار؟', { required: true, options: opts('التصميم الأول', 'التصميم الثاني', 'التصميم الثالث') }),
      q('paragraph', 'لماذا اخترته؟'),
    ] }) },
];

export const templateQuestionCount = (template: Template) => template.build('ar').questions.filter(item => item.type !== 'section').length;

// ---- pages and status -------------------------------------------------------------------

export type FormPage = { section: Question | null; questions: Question[] };

/** A section starts a new page; questions before the first one form page one. */
export function paginate(questions: Question[]): FormPage[] {
  const pages: FormPage[] = [{ section: null, questions: [] }];
  for (const question of questions) {
    if (question.type === 'section') pages.push({ section: question, questions: [] });
    else pages[pages.length - 1].questions.push(question);
  }
  return pages.filter((page, index) => index === 0 ? page.questions.length > 0 || pages.length === 1 : true);
}

export const isOpen = (form: Pick<Form, 'accepting' | 'close_at'>, now = Date.now()) =>
  form.accepting && (!form.close_at || new Date(form.close_at).getTime() > now);

export const answerable = (questions: Question[]) => questions.filter(item => item.type !== 'section');

// ---- answers -----------------------------------------------------------------------------

export function isEmpty(value: Answer | undefined | null): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export type AnswerError = 'required' | 'email' | 'phone' | 'number' | 'file_type' | 'file_size';

/** Mirrors public.form_answer_error for what the browser can check before sending. */
export function answerError(question: Question, value: Answer | undefined): AnswerError | null {
  if (isEmpty(value)) return question.required ? 'required' : null;
  if (question.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value).trim())) return 'email';
  if (question.type === 'phone' && !/^\+?[0-9 ()-]{7,20}$/.test(String(value).trim())) return 'phone';
  if (question.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return 'number';
  return null;
}

export const answerErrors: Record<AnswerError, Label> = {
  required: { ar: 'هذا السؤال إلزامي.', en: 'This question is required.' },
  email: { ar: 'اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com.', en: 'Enter a valid email, like name@example.com.' },
  phone: { ar: 'اكتب رقم هاتف صحيحًا (أرقام فقط، 7 خانات على الأقل).', en: 'Enter a valid phone number (digits, at least 7).' },
  number: { ar: 'اكتب رقمًا.', en: 'Enter a number.' },
  file_type: { ar: 'نوع الملف غير مسموح في هذا السؤال.', en: 'This file type is not allowed here.' },
  file_size: { ar: `حجم الملف أكبر من ${MAX_FILE_MB} ميجابايت.`, en: `The file is larger than ${MAX_FILE_MB} MB.` },
};

/** Whether a picked file fits the question's allowed kinds and the size limit. */
export function fileProblem(file: { name: string; type: string; size: number }, accept: FileKind[] | undefined): 'file_type' | 'file_size' | null {
  const kinds = accept?.length ? accept : (Object.keys(fileKinds) as FileKind[]);
  const name = file.name.toLowerCase();
  const allowed = kinds.some(kind => fileKinds[kind].mimes.includes(file.type) || fileKinds[kind].extensions.some(ext => name.endsWith(ext)));
  if (!allowed) return 'file_type';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return 'file_size';
  return null;
}

export const acceptAttribute = (accept: FileKind[] | undefined) =>
  (accept?.length ? accept : (Object.keys(fileKinds) as FileKind[])).flatMap(kind => [...fileKinds[kind].mimes, ...fileKinds[kind].extensions]).join(',');

/** Server error codes from submit_form_response, in words. */
export const submitErrors: Record<string, Label> = {
  form_closed: { ar: 'هذا النموذج لم يعد يستقبل ردودًا.', en: 'This form is no longer accepting responses.' },
  form_not_found: { ar: 'هذا النموذج غير موجود.', en: 'This form does not exist.' },
  already_submitted: { ar: 'سبق إرسال رد من هذا الجهاز.', en: 'A response was already sent from this device.' },
  required_missing: { ar: 'بقي سؤال إلزامي بدون إجابة.', en: 'A required question has no answer.' },
  invalid_email: answerErrors.email, invalid_phone: answerErrors.phone,
  invalid_file: { ar: 'تعذّر إرفاق أحد الملفات. ارفعه مرة أخرى.', en: 'A file could not be attached. Upload it again.' },
};

/** Words for a star rating, spread over however many stars the question has. */
export function ratingWord(value: number, max: number, lang: Lang): string {
  const words = lang === 'ar' ? ['سيئ', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز'] : ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const index = max <= 1 ? words.length - 1 : Math.round(((value - 1) / (max - 1)) * (words.length - 1));
  return words[clamp(index, 0, words.length - 1)];
}

/** "4 من 5 — جيد جدًا": written with "من" because a slash flips in right-to-left text. */
export const ratingLine = (value: number, max: number, lang: Lang) =>
  lang === 'ar' ? `${value} من ${max} — ${ratingWord(value, max, lang)}` : `${value} of ${max} — ${ratingWord(value, max, lang)}`;

/** A 0–10 scale fits a phone in two balanced rows. */
export function scaleRows(min: number, max: number): number[][] {
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  if (values.length <= 6) return [values];
  const half = Math.ceil(values.length / 2);
  return [values.slice(0, half), values.slice(half)];
}

// ---- summaries ---------------------------------------------------------------------------

export type Summary =
  | { kind: 'choice'; total: number; rows: Array<{ label: string; image?: string | null; count: number; share: number }> }
  | { kind: 'rating'; total: number; average: number | null; max: number; rows: Array<{ value: number; count: number; share: number }> }
  | { kind: 'scale'; total: number; average: number | null; rows: Array<{ value: number; count: number; share: number }> }
  | { kind: 'text'; total: number; items: string[] }
  | { kind: 'files'; total: number; items: FileAnswer[] };

const share = (count: number, total: number) => (total ? Math.round((count / total) * 1000) / 10 : 0);

export function summarize(question: Question, responses: FormResponse[], lang: Lang): Summary {
  const values = responses.map(response => response.answers[question.id]).filter(value => !isEmpty(value));
  const total = values.length;
  if (hasOptions(question.type)) {
    const counts = new Map<string, number>((question.options ?? []).map(option => [option.label, 0]));
    const otherLabel = lang === 'ar' ? 'أخرى' : 'Other';
    let other = 0;
    for (const value of values) {
      for (const picked of Array.isArray(value) ? value as string[] : [String(value)]) {
        if (counts.has(picked)) counts.set(picked, (counts.get(picked) ?? 0) + 1);
        else other += 1;
      }
    }
    const rows = (question.options ?? []).map(option => ({ label: option.label, image: option.image, count: counts.get(option.label) ?? 0, share: share(counts.get(option.label) ?? 0, total) }));
    if (other) rows.push({ label: otherLabel, image: null, count: other, share: share(other, total) });
    return { kind: 'choice', total, rows };
  }
  if (question.type === 'rating' || question.type === 'scale') {
    const numbers = values.filter((value): value is number => typeof value === 'number');
    const low = question.type === 'rating' ? 1 : question.min ?? 1;
    const high = question.max ?? 5;
    const rows = Array.from({ length: high - low + 1 }, (_, index) => {
      const value = low + index;
      const count = numbers.filter(item => item === value).length;
      return { value, count, share: share(count, numbers.length) };
    });
    const average = numbers.length ? Math.round((numbers.reduce((sum, item) => sum + item, 0) / numbers.length) * 100) / 100 : null;
    return question.type === 'rating' ? { kind: 'rating', total: numbers.length, average, max: high, rows } : { kind: 'scale', total: numbers.length, average, rows };
  }
  if (question.type === 'file') return { kind: 'files', total, items: values.flatMap(value => value as FileAnswer[]) };
  return { kind: 'text', total, items: values.map(value => String(value)) };
}

/** The mean star rating of a form, scaled to five, like public.form_overview. */
export function formRating(questions: Question[], responses: FormResponse[]): number | null {
  const scores: number[] = [];
  for (const question of questions.filter(item => item.type === 'rating')) {
    for (const response of responses) {
      const value = response.answers[question.id];
      if (typeof value === 'number') scores.push((value / (question.max ?? 5)) * 5);
    }
  }
  return scores.length ? Math.round((scores.reduce((sum, item) => sum + item, 0) / scores.length) * 100) / 100 : null;
}

/** An answer as a table cell: numbers stay numbers so a spreadsheet can add them. */
export function answerCell(question: Question, value: Answer | undefined): string | number {
  if (isEmpty(value)) return '';
  if (typeof value === 'number') return value;
  if (question.type === 'file') return (value as FileAnswer[]).map(file => file.name).join('، ');
  if (Array.isArray(value)) return (value as string[]).join('، ');
  return value ?? '';
}

export function exportTable(form: Pick<Form, 'questions'>, responses: FormResponse[], lang: Lang): Array<Array<string | number>> {
  const questions = answerable(form.questions);
  const header = [lang === 'ar' ? 'وقت الإرسال' : 'Submitted', ...questions.map(item => item.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled'))];
  const rows = [...responses].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(response => [
    new Date(response.created_at).toLocaleString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Muscat', dateStyle: 'short', timeStyle: 'short' }),
    ...questions.map(question => answerCell(question, response.answers[question.id])),
  ]);
  return [header, ...rows];
}

// ---- words ----------------------------------------------------------------------------------

export function relativeTime(iso: string, now: number, lang: Lang): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return lang === 'ar' ? 'الآن' : 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return lang === 'ar' ? `قبل ${arabicCount(minutes, { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' })}` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === 'ar' ? `قبل ${arabicCount(hours, { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' })}` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return lang === 'ar' ? `قبل ${arabicCount(days, { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا' })}` : `${days} d ago`;
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Forms = { zero: string; one: string; two: string; few: string; many: string };
export const countLine = (count: number, lang: Lang, forms: Forms, english: [string, string]) =>
  lang === 'en' ? `${count} ${count === 1 ? english[0] : english[1]}` : count === 0 ? forms.zero : arabicCount(count, forms);

export const responsesLine = (count: number, lang: Lang) =>
  countLine(count, lang, { zero: 'لا ردود', one: 'رد واحد', two: 'ردّان', few: 'ردود', many: 'ردًا' }, ['response', 'responses']);
export const questionsLine = (count: number, lang: Lang) =>
  countLine(count, lang, { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: 'أسئلة', many: 'سؤالًا' }, ['question', 'questions']);

export function greeting(now: Date, lang: Lang): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Muscat' }).format(now));
  if (lang === 'en') return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return hour < 12 ? 'صباح الخير' : 'مساء الخير';
}

export const formLink = (id: string, origin = location.origin) => `${origin}/f/${id}`;

/** A per-browser key so "one response per device" can be checked on the server. */
export function deviceKey(storage: Pick<Storage, 'getItem' | 'setItem'> | null): string {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 32);
  try {
    const saved = storage?.getItem('reid-form-device');
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const key = fresh();
    storage?.setItem('reid-form-device', key);
    return key;
  } catch { return fresh(); }
}

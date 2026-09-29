// One question in the editor. Collapsed it shows what a respondent will see;
// selected it opens every control for its type.
import React from 'react';
import {
  ArrowDown, ArrowUp, CheckSquare, ChevronDown, Circle, Copy, GripVertical, ImagePlus, List, LoaderCircle, Plus, Star, Trash2, X,
} from 'lucide-react';
import { messageFor } from '../db';
import * as api from './api';
import { AutoTextArea, compressImage, Switch } from './forms-ui';
import { convertQuestion, fileKinds, newId, parseOptions, questionTypes, type FileKind, type Lang, type Option, type Question, type QuestionType } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

type Props = {
  lang: Lang; formId: string; question: Question; index: number; total: number; active: boolean; activate: () => void;
  change: (question: Question) => void; duplicate: () => void; remove: () => void; move: (by: -1 | 1) => void; onError: (text: string) => void;
};

export function QuestionCard({ lang, formId, question, index, total, active, activate, change, duplicate, remove, move, onError }: Props) {
  const set = (patch: Partial<Question>) => change({ ...question, ...patch });
  const section = question.type === 'section';
  const [describe, setDescribe] = React.useState(Boolean(question.description));
  const [uploading, setUploading] = React.useState<string | null>(null);

  const upload = async (file: File | undefined, apply: (url: string) => void, key: string) => {
    if (!file) return;
    setUploading(key);
    const blob = await compressImage(file, 1400, 0.84);
    const result = await api.uploadMedia(formId, blob, blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');
    setUploading(null);
    if (result.ok) apply(result.data); else onError(messageFor(result.error, lang));
  };

  return (
    <article className="q-card" data-active={active} data-section={section} onFocusCapture={activate} onClick={activate}>
      <span className="q-card__grip" aria-hidden="true"><GripVertical /></span>
      {section && <span className="q-card__section-tag">{tr(lang, 'قسم جديد — يبدأ صفحة', 'New section — starts a page')}</span>}
      <div className="q-card__top">
        <AutoTextArea className="q-card__title" value={question.title} maxLength={500} onChange={title => set({ title })}
          placeholder={section ? tr(lang, 'عنوان القسم', 'Section title') : tr(lang, 'السؤال', 'Question')} label={tr(lang, `السؤال ${index + 1}`, `Question ${index + 1}`)} />
        {active && !section && (
          <label className="q-card__type">
            <span className="fx-visually-hidden">{tr(lang, 'نوع السؤال', 'Question type')}</span>
            <select value={question.type} onChange={event => change(convertQuestion(question, event.target.value as QuestionType, lang))}>
              {(Object.keys(questionTypes) as QuestionType[]).filter(type => type !== 'section').map(type => <option key={type} value={type}>{questionTypes[type].label[lang]}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        )}
        {!active && !section && <span className="q-card__type-label">{questionTypes[question.type].label[lang]}{question.required ? ' *' : ''}</span>}
      </div>

      {(describe || question.description) && (active || question.description) && (
        <AutoTextArea className="q-card__description" value={question.description ?? ''} maxLength={2000} onChange={description => set({ description })}
          placeholder={tr(lang, 'وصف (اختياري)', 'Description (optional)')} label={tr(lang, 'وصف السؤال', 'Question description')} />
      )}
      {question.image && (
        <figure className="q-card__image">
          <img src={question.image} alt="" loading="lazy" />
          {active && <button type="button" className="fx-icon-button" aria-label={tr(lang, 'إزالة الصورة', 'Remove image')} onClick={() => set({ image: null })}><X /></button>}
        </figure>
      )}

      {!section && <Body lang={lang} question={question} active={active} set={set} uploading={uploading} upload={upload} />}

      {active && (
        <div className="q-card__footer">
          <div className="q-card__extras">
            {!describe && !question.description && <button type="button" className="fx-text-button" onClick={() => setDescribe(true)}>{tr(lang, '+ وصف', '+ Description')}</button>}
            {!question.image && (
              <label className="fx-text-button">
                {uploading === 'image' ? <LoaderCircle className="fx-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
                {tr(lang, 'صورة', 'Image')}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void upload(event.target.files?.[0], url => set({ image: url }), 'image'); event.target.value = ''; }} />
              </label>
            )}
          </div>
          <div className="q-card__tools">
            <button type="button" className="fx-icon-button" disabled={index === 0} onClick={event => { event.stopPropagation(); move(-1); }} aria-label={tr(lang, 'تحريك لأعلى', 'Move up')} title={tr(lang, 'تحريك لأعلى', 'Move up')}><ArrowUp /></button>
            <button type="button" className="fx-icon-button" disabled={index === total - 1} onClick={event => { event.stopPropagation(); move(1); }} aria-label={tr(lang, 'تحريك لأسفل', 'Move down')} title={tr(lang, 'تحريك لأسفل', 'Move down')}><ArrowDown /></button>
            <button type="button" className="fx-icon-button" onClick={event => { event.stopPropagation(); duplicate(); }} aria-label={tr(lang, 'تكرار', 'Duplicate')} title={tr(lang, 'تكرار', 'Duplicate')}><Copy /></button>
            <button type="button" className="fx-icon-button fx-icon-button--danger" onClick={event => { event.stopPropagation(); remove(); }} aria-label={tr(lang, 'حذف', 'Delete')} title={tr(lang, 'حذف', 'Delete')}><Trash2 /></button>
            {!section && <span className="q-card__divider" aria-hidden="true" />}
            {!section && <Switch checked={Boolean(question.required)} onChange={required => set({ required })} label={tr(lang, 'إلزامي', 'Required')} />}
          </div>
        </div>
      )}
    </article>
  );
}

function Body({ lang, question, active, set, uploading, upload }: {
  lang: Lang; question: Question; active: boolean; set: (patch: Partial<Question>) => void; uploading: string | null;
  upload: (file: File | undefined, apply: (url: string) => void, key: string) => Promise<void>;
}) {
  const type = question.type;
  if (['choice', 'checkbox', 'dropdown', 'image_choice'].includes(type)) {
    return <Options lang={lang} question={question} active={active} set={set} uploading={uploading} upload={upload} />;
  }
  if (type === 'rating') {
    const max = question.max ?? 5;
    return (
      <div className="q-preview q-preview--stars">
        <span aria-hidden="true">{range(1, max).map(n => <Star key={n} />)}</span>
        {active && (
          <label className="q-inline">{tr(lang, 'عدد النجوم', 'Stars')}
            <select value={max} onChange={event => set({ max: Number(event.target.value) })}>{range(3, 10).map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
      </div>
    );
  }
  if (type === 'scale') {
    const min = question.min ?? 1, max = question.max ?? 5;
    return (
      <div className="q-scale-edit">
        {active ? (
          <>
            <div className="q-inline-row">
              <label className="q-inline">{tr(lang, 'من', 'From')}
                <select value={min} onChange={event => set({ min: Number(event.target.value) })}><option value={0}>0</option><option value={1}>1</option></select>
              </label>
              <label className="q-inline">{tr(lang, 'إلى', 'To')}
                <select value={max} onChange={event => set({ max: Number(event.target.value) })}>{range(2, 10).map(n => <option key={n} value={n}>{n}</option>)}</select>
              </label>
            </div>
            <div className="q-inline-row">
              <label className="q-label-input"><b>{min}</b><input value={question.minLabel ?? ''} maxLength={60} dir="auto" onChange={event => set({ minLabel: event.target.value })} placeholder={tr(lang, 'تسمية البداية (اختياري)', 'Start label (optional)')} /></label>
              <label className="q-label-input"><b>{max}</b><input value={question.maxLabel ?? ''} maxLength={60} dir="auto" onChange={event => set({ maxLabel: event.target.value })} placeholder={tr(lang, 'تسمية النهاية (اختياري)', 'End label (optional)')} /></label>
            </div>
          </>
        ) : (
          <div className="q-preview q-preview--scale" aria-hidden="true">
            {question.minLabel && <small>{question.minLabel}</small>}
            {range(min, max).map(n => <span key={n}>{n}</span>)}
            {question.maxLabel && <small>{question.maxLabel}</small>}
          </div>
        )}
      </div>
    );
  }
  if (type === 'file') {
    const accept = question.accept ?? [];
    return active ? (
      <fieldset className="q-accept">
        <legend>{tr(lang, 'الأنواع المسموحة (حتى 10 ميجابايت)', 'Allowed types (up to 10 MB)')}</legend>
        {(Object.keys(fileKinds) as FileKind[]).map(kind => (
          <label key={kind} className="q-accept__item">
            <input type="checkbox" checked={accept.includes(kind)} onChange={event => set({ accept: event.target.checked ? [...accept, kind] : accept.filter(item => item !== kind) })} />
            {fileKinds[kind].label[lang]}
          </label>
        ))}
      </fieldset>
    ) : <p className="q-preview">{tr(lang, 'رفع ملف', 'File upload')} · {accept.length ? accept.map(kind => fileKinds[kind].label[lang]).join('، ') : tr(lang, 'كل الأنواع', 'Any type')}</p>;
  }
  const hint: Partial<Record<QuestionType, { ar: string; en: string }>> = {
    short: { ar: 'نص قصير', en: 'Short text' }, paragraph: { ar: 'نص طويل', en: 'Long text' }, email: { ar: 'name@example.com', en: 'name@example.com' },
    phone: { ar: 'رقم الهاتف', en: 'Phone number' }, number: { ar: 'رقم', en: 'Number' }, date: { ar: 'يوم / شهر / سنة', en: 'Day / month / year' }, time: { ar: 'ساعة : دقيقة', en: 'Hour : minute' },
  };
  return <p className="q-preview q-preview--line" data-long={type === 'paragraph'}>{hint[type]?.[lang]}</p>;
}

function Options({ lang, question, active, set, uploading, upload }: {
  lang: Lang; question: Question; active: boolean; set: (patch: Partial<Question>) => void; uploading: string | null;
  upload: (file: File | undefined, apply: (url: string) => void, key: string) => Promise<void>;
}) {
  const options = question.options ?? [];
  const type = question.type;
  const marker = (n: number) => type === 'checkbox' ? <CheckSquare aria-hidden="true" /> : type === 'dropdown' ? <b aria-hidden="true">{n}.</b> : type === 'image_choice' ? null : <Circle aria-hidden="true" />;
  const setOptions = (next: Option[]) => set({ options: next.slice(0, 100) });
  const change = (id: string, patch: Partial<Option>) => setOptions(options.map(option => (option.id === id ? { ...option, ...patch } : option)));
  const addOption = () => setOptions([...options, { id: newId(), label: tr(lang, `الخيار ${options.length + 1}`, `Option ${options.length + 1}`) }]);
  const paste = (id: string, event: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = parseOptions(event.clipboardData.getData('text'));
    if (lines.length < 2) return;
    event.preventDefault();
    const at = options.findIndex(option => option.id === id);
    const added = lines.map(label => ({ id: newId(), label }));
    setOptions([...options.slice(0, at), { ...options[at], label: added[0].label }, ...added.slice(1), ...options.slice(at + 1)]);
  };
  const duplicateLabels = new Set(options.map(option => option.label.trim()).filter((label, index, all) => label && all.indexOf(label) !== index));

  if (!active) {
    return (
      <ul className={type === 'image_choice' ? 'q-options q-options--images q-options--preview' : 'q-options q-options--preview'}>
        {options.slice(0, 6).map((option, index) => (
          <li key={option.id}>{type === 'image_choice' ? option.image ? <img src={option.image} alt="" loading="lazy" /> : <span className="q-option-image q-option-image--empty" /> : marker(index + 1)}<span dir="auto">{option.label}</span></li>
        ))}
        {options.length > 6 && <li className="q-options__more">+{options.length - 6}</li>}
        {question.other && <li>{marker(options.length + 1)}<span>{tr(lang, 'أخرى…', 'Other…')}</span></li>}
      </ul>
    );
  }
  return (
    <div className="q-options-edit">
      <ul className={type === 'image_choice' ? 'q-options q-options--images' : 'q-options'}>
        {options.map((option, index) => (
          <li key={option.id}>
            {type === 'image_choice' ? (
              <label className="q-option-image" style={option.image ? { backgroundImage: `url("${option.image}")` } : undefined} title={tr(lang, 'صورة الخيار', 'Option image')}>
                {uploading === option.id ? <LoaderCircle className="fx-spin" aria-hidden="true" /> : !option.image && <ImagePlus aria-hidden="true" />}
                <span className="fx-visually-hidden">{tr(lang, 'صورة الخيار', 'Option image')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void upload(event.target.files?.[0], url => change(option.id, { image: url }), option.id); event.target.value = ''; }} />
              </label>
            ) : marker(index + 1)}
            <input className="q-option-input" value={option.label} maxLength={500} dir="auto" data-duplicate={duplicateLabels.has(option.label.trim()) || undefined}
              aria-label={tr(lang, `الخيار ${index + 1}`, `Option ${index + 1}`)} onChange={event => change(option.id, { label: event.target.value })} onPaste={event => paste(option.id, event)} />
            <button type="button" className="fx-icon-button" disabled={options.length <= 1} onClick={() => setOptions(options.filter(item => item.id !== option.id))} aria-label={tr(lang, 'حذف الخيار', 'Remove option')}><X /></button>
          </li>
        ))}
        {question.other && (
          <li className="q-option-other">
            {marker(options.length + 1)}<span>{tr(lang, 'أخرى… (يكتب المستجيب إجابته)', 'Other… (respondent types an answer)')}</span>
            <button type="button" className="fx-icon-button" onClick={() => set({ other: false })} aria-label={tr(lang, 'إزالة «أخرى»', 'Remove “Other”')}><X /></button>
          </li>
        )}
      </ul>
      {duplicateLabels.size > 0 && <small className="q-warning">{tr(lang, 'بعض الخيارات مكررة؛ الملخص سيجمعها معًا.', 'Some options repeat; the summary will count them together.')}</small>}
      <div className="q-options-actions">
        <button type="button" className="fx-text-button" onClick={addOption}><Plus aria-hidden="true" />{tr(lang, 'إضافة خيار', 'Add option')}</button>
        {(type === 'choice' || type === 'checkbox') && !question.other && <button type="button" className="fx-text-button" onClick={() => set({ other: true })}><List aria-hidden="true" />{tr(lang, 'إضافة «أخرى»', 'Add “Other”')}</button>}
        <small className="fx-muted">{tr(lang, 'نصيحة: الصق قائمة من عدة أسطر في أي خيار لتضيفها دفعة واحدة.', 'Tip: paste several lines into an option to add them all at once.')}</small>
      </div>
    </div>
  );
}

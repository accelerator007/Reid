// One form: the questions editor, its responses and its settings. Edits save
// themselves shortly after typing stops; the header says whether they have.
import React from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CloudOff, Eye, ImagePlus, LayoutList, ListPlus, LoaderCircle, Plus, Settings2, Share2, SplitSquareVertical, Trash2, UsersRound,
} from 'lucide-react';
import { messageFor, type AppError } from '../db';
import { useSession } from '../shell';
import { Button, EmptyState, InlineAlert, Skeleton } from '../ui';
import * as api from './api';
import { AccessDialog, ShareDialog } from './form-dialogs';
import { FormResponses } from './form-responses';
import { FormSettings } from './form-settings';
import { AutoTextArea, compressImage, Menu, useFlip, useToast } from './forms-ui';
import { QuestionCard } from './question-card';
import { duplicateQuestion, moveQuestion, newQuestion, questionTypes, themeNames, themes, type Form, type FormRole, type Lang, type Question, type QuestionType } from './model';
import type { Navigate } from './forms-workspace';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'questions' | 'responses' | 'settings';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function FormEditor({ lang, id, tab, navigate }: { lang: Lang; id: string; tab: Tab; navigate: Navigate }) {
  const { user } = useSession();
  const toast = useToast();
  const [form, setForm] = React.useState<Form | null>(null);
  const [role, setRole] = React.useState<FormRole>('viewer');
  const [missing, setMissing] = React.useState(false);
  const [error, setError] = React.useState<AppError | null>(null);
  const [save, setSave] = React.useState<SaveState>('idle');
  const [sharing, setSharing] = React.useState(false);
  const [access, setAccess] = React.useState(false);
  const latest = React.useRef<Form | null>(null);
  const pending = React.useRef<api.FormFields>({});
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (!user) return;
    void api.loadForm(id, user.id).then(result => {
      if (result.data) { setForm(result.data.form); latest.current = result.data.form; setRole(result.data.role); }
      else if (!result.error) setMissing(true);
      setError(result.error);
    });
  }, [id, user]);

  const flush = React.useCallback(async () => {
    window.clearTimeout(timer.current);
    const fields = pending.current;
    if (!Object.keys(fields).length) return;
    pending.current = {};
    setSave('saving');
    const result = await api.saveForm(id, fields);
    if (result.ok) setSave(Object.keys(pending.current).length ? 'saving' : 'saved');
    else { pending.current = { ...fields, ...pending.current }; setSave('error'); }
  }, [id]);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) { void flush(); event.preventDefault(); } };
    addEventListener('beforeunload', warn);
    return () => { removeEventListener('beforeunload', warn); void flush(); };
  }, [flush]);

  const update = React.useCallback((patch: api.FormFields) => {
    if (!latest.current) return;
    latest.current = { ...latest.current, ...patch } as Form;
    setForm(latest.current);
    pending.current = { ...pending.current, ...patch };
    setSave('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  }, [flush]);
  const setQuestions = React.useCallback((change: (questions: Question[]) => Question[]) => {
    if (latest.current) update({ questions: change(latest.current.questions) });
  }, [update]);

  const go = (next: Tab) => navigate(`/forms/${id}${next === 'questions' ? '' : `/${next}`}`);
  const back = () => { void flush(); navigate('/forms'); };
  const current: Tab = role === 'viewer' ? 'responses' : tab;

  if (missing) {
    return (
      <main className="form-editor">
        <EmptyState icon={<LayoutList />} title={tr(lang, 'النموذج غير موجود', 'Form not found')}
          description={tr(lang, 'ربما حُذف، أو لم يُشارك معك بعد.', 'It may have been deleted, or not shared with you yet.')}
          action={<Button onClick={() => navigate('/forms')}>{tr(lang, 'كل النماذج', 'All forms')}</Button>} />
      </main>
    );
  }
  const tabs: Array<[Tab, string, React.ReactNode]> = [
    ['questions', tr(lang, 'الأسئلة', 'Questions'), <LayoutList key="q" />],
    ['responses', tr(lang, 'الردود', 'Responses'), <BarChart3 key="r" />],
    ['settings', tr(lang, 'الإعدادات', 'Settings'), <Settings2 key="s" />],
  ];
  const visibleTabs = role === 'viewer' ? tabs.filter(([id_]) => id_ === 'responses') : tabs;

  return (
    <main className="form-editor" data-theme={form?.theme}>
      <div className="form-bar">
        <button type="button" className="fx-icon-button" onClick={back} aria-label={tr(lang, 'كل النماذج', 'All forms')} title={tr(lang, 'كل النماذج', 'All forms')}>
          {lang === 'ar' ? <ArrowRight /> : <ArrowLeft />}
        </button>
        <div className="form-bar__title">
          <strong dir="auto">{form ? form.title || tr(lang, 'بدون عنوان', 'Untitled') : '…'}</strong>
          <SaveIndicator lang={lang} state={save} retry={() => void flush()} />
        </div>
        <div className="form-bar__actions">
          <a className="fx-icon-button" href={`/f/${id}`} target="_blank" rel="noreferrer" aria-label={tr(lang, 'معاينة', 'Preview')} title={tr(lang, 'معاينة', 'Preview')}><Eye /></a>
          {role === 'owner' && <button type="button" className="fx-icon-button" onClick={() => setAccess(true)} aria-label={tr(lang, 'الأشخاص والوصول', 'People and access')} title={tr(lang, 'الأشخاص والوصول', 'People and access')}><UsersRound /></button>}
          <Button variant="primary" size="sm" icon={<Share2 />} data-ripple onClick={() => setSharing(true)} disabled={!form}>{tr(lang, 'مشاركة', 'Share')}</Button>
        </div>
      </div>
      <div className="form-tabs" role="tablist" aria-label={tr(lang, 'أقسام النموذج', 'Form sections')} style={{ '--count': visibleTabs.length, '--at': visibleTabs.findIndex(([id_]) => id_ === current) } as React.CSSProperties}>
        <span className="form-tabs__pill" aria-hidden="true" />
        {visibleTabs.map(([id_, label, icon]) => (
          <button key={id_} type="button" role="tab" aria-selected={current === id_} onClick={() => go(id_)}>{icon}{label}</button>
        ))}
      </div>

      {error && <InlineAlert>{messageFor(error, lang)}</InlineAlert>}
      {!form && !error && <div className="form-loading"><Skeleton lines={8} /></div>}
      {form && (
        <div className="form-panel" key={current} data-tab={current}>
          {current === 'questions' && <QuestionsTab lang={lang} form={form} update={update} setQuestions={setQuestions} onError={text => toast(text, 'danger')} />}
          {current === 'responses' && <FormResponses lang={lang} form={form} role={role} update={update} />}
          {current === 'settings' && <FormSettings lang={lang} form={form} role={role} update={update} openAccess={() => setAccess(true)} deleted={() => navigate('/forms')} />}
        </div>
      )}
      {sharing && form && <ShareDialog lang={lang} form={form} onClose={() => setSharing(false)} />}
      {access && form && <AccessDialog lang={lang} form={form} onClose={() => setAccess(false)} />}
    </main>
  );
}

function SaveIndicator({ lang, state, retry }: { lang: Lang; state: SaveState; retry: () => void }) {
  if (state === 'idle') return <small className="form-save">{tr(lang, 'يُحفظ تلقائيًا', 'Saves automatically')}</small>;
  if (state === 'saving') return <small className="form-save" data-state="saving"><LoaderCircle aria-hidden="true" />{tr(lang, 'جارٍ الحفظ…', 'Saving…')}</small>;
  if (state === 'saved') return <small className="form-save" data-state="saved"><Check aria-hidden="true" />{tr(lang, 'تم الحفظ', 'Saved')}</small>;
  return <button type="button" className="form-save" data-state="error" onClick={retry}><CloudOff aria-hidden="true" />{tr(lang, 'لم يُحفظ — أعد المحاولة', 'Not saved — retry')}</button>;
}

function QuestionsTab({ lang, form, update, setQuestions, onError }: {
  lang: Lang; form: Form; update: (patch: api.FormFields) => void; setQuestions: (change: (questions: Question[]) => Question[]) => void; onError: (text: string) => void;
}) {
  const [active, setActive] = React.useState<string | null>(form.questions[0]?.id ?? null);
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<string | null>(null);
  const list = useFlip<HTMLOListElement>(form.questions.map(item => item.id));

  const add = (type: QuestionType) => {
    const question = newQuestion(type, lang);
    setQuestions(questions => {
      const at = active ? questions.findIndex(item => item.id === active) : -1;
      return at < 0 ? [...questions, question] : [...questions.slice(0, at + 1), question, ...questions.slice(at + 1)];
    });
    setActive(question.id); setFresh(question.id);
    requestAnimationFrame(() => document.getElementById(`q-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const remove = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => { setQuestions(questions => questions.filter(item => item.id !== id)); setLeaving(null); }, 220);
  };
  const types = (Object.keys(questionTypes) as QuestionType[]).filter(type => type !== 'section');

  return (
    <div className="form-builder">
      <div className="form-builder__main">
        <FormHeader lang={lang} form={form} update={update} onError={onError} />
        <ol className="form-questions" ref={list}>
          {form.questions.map((question, index) => (
            <li key={question.id} id={`q-${question.id}`} data-flip={question.id} className={leaving === question.id ? 'fx-leave' : fresh === question.id ? 'fx-enter' : undefined}
              onAnimationEnd={() => fresh === question.id && setFresh(null)}>
              <QuestionCard lang={lang} formId={form.id} question={question} index={index} total={form.questions.length}
                active={active === question.id} activate={() => setActive(question.id)}
                change={next => setQuestions(questions => questions.map(item => (item.id === question.id ? next : item)))}
                duplicate={() => {
                  const copy = duplicateQuestion(question);
                  setQuestions(questions => [...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)]);
                  setActive(copy.id); setFresh(copy.id);
                }}
                remove={() => remove(question.id)}
                move={by => setQuestions(questions => moveQuestion(questions, index, by))}
                onError={onError} />
            </li>
          ))}
        </ol>
        {!form.questions.length && (
          <EmptyState icon={<ListPlus />} title={tr(lang, 'لا أسئلة بعد', 'No questions yet')}
            action={<Button variant="primary" icon={<Plus />} onClick={() => add('short')}>{tr(lang, 'أضف سؤالًا', 'Add a question')}</Button>} />
        )}
      </div>
      <div className="form-toolbox" role="toolbar" aria-label={tr(lang, 'إضافة', 'Add')}>
        <Menu label={tr(lang, 'إضافة سؤال', 'Add question')} dir={lang === 'ar' ? 'rtl' : 'ltr'}
          trigger={<><Plus aria-hidden="true" /><span>{tr(lang, 'سؤال', 'Question')}</span></>}
          items={types.map(type => ({ label: questionTypes[type].label[lang], onSelect: () => add(type) }))} />
        <button type="button" className="form-toolbox__button" onClick={() => add('section')}><SplitSquareVertical aria-hidden="true" /><span>{tr(lang, 'قسم', 'Section')}</span></button>
        <a className="form-toolbox__button" href={`/f/${form.id}`} target="_blank" rel="noreferrer"><Eye aria-hidden="true" /><span>{tr(lang, 'معاينة', 'Preview')}</span></a>
      </div>
    </div>
  );
}

function FormHeader({ lang, form, update, onError }: { lang: Lang; form: Form; update: (patch: api.FormFields) => void; onError: (text: string) => void }) {
  const [uploading, setUploading] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const workshop = form.workshop ?? {};
  const setWorkshop = (key: keyof Form['workshop'], value: string) => update({ workshop: { ...workshop, [key]: value.slice(0, 200) } });
  const cover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const blob = await compressImage(file, 1800, 0.84);
    const result = await api.uploadMedia(form.id, blob, blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');
    setUploading(false);
    if (result.ok) update({ cover_url: result.data }); else onError(messageFor(result.error, lang));
  };
  return (
    <section className="form-head-card">
      <div className="form-head-card__cover" style={form.cover_url ? { backgroundImage: `url("${form.cover_url}")` } : undefined}>
        <div className="form-head-card__cover-actions">
          <Button size="sm" icon={uploading ? <LoaderCircle className="fx-spin" /> : <ImagePlus />} disabled={uploading} onClick={() => input.current?.click()}>
            {form.cover_url ? tr(lang, 'تغيير الغلاف', 'Change cover') : tr(lang, 'صورة غلاف', 'Cover image')}
          </Button>
          {form.cover_url && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => update({ cover_url: null })}>{tr(lang, 'إزالة', 'Remove')}</Button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void cover(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      <div className="form-head-card__body">
        <input className="form-title-input" value={form.title} maxLength={200} dir="auto" onChange={event => update({ title: event.target.value })}
          placeholder={tr(lang, 'عنوان النموذج', 'Form title')} aria-label={tr(lang, 'عنوان النموذج', 'Form title')} />
        <AutoTextArea className="form-description-input" value={form.description} maxLength={4000} onChange={value => update({ description: value })}
          placeholder={tr(lang, 'وصف النموذج (اختياري)', 'Form description (optional)')} label={tr(lang, 'وصف النموذج', 'Form description')} />
        <fieldset className="form-workshop">
          <legend>{tr(lang, 'بيانات الورشة', 'Workshop details')}</legend>
          <label><span>{tr(lang, 'رقم الورشة', 'Number')}</span><input value={workshop.number ?? ''} inputMode="numeric" maxLength={10} onChange={event => setWorkshop('number', event.target.value)} /></label>
          <label className="form-workshop__wide"><span>{tr(lang, 'اسم الورشة', 'Workshop name')}</span><input value={workshop.name ?? ''} onChange={event => setWorkshop('name', event.target.value)} dir="auto" /></label>
          <label><span>{tr(lang, 'التاريخ', 'Date')}</span><input type="date" value={workshop.date ?? ''} onChange={event => setWorkshop('date', event.target.value)} /></label>
          <label><span>{tr(lang, 'المقدّم', 'Presenter')}</span><input value={workshop.presenter ?? ''} onChange={event => setWorkshop('presenter', event.target.value)} dir="auto" /></label>
          <label><span>{tr(lang, 'المكان', 'Location')}</span><input value={workshop.location ?? ''} onChange={event => setWorkshop('location', event.target.value)} dir="auto" /></label>
        </fieldset>
        <div className="form-colors" role="radiogroup" aria-label={tr(lang, 'لون النموذج', 'Form colour')}>
          <span>{tr(lang, 'اللون', 'Colour')}</span>
          {themes.map(theme => (
            <button key={theme} type="button" role="radio" aria-checked={form.theme === theme} data-theme={theme} className="form-color"
              title={themeNames[theme][lang]} aria-label={themeNames[theme][lang]} onClick={() => update({ theme })}><Check aria-hidden="true" /></button>
          ))}
        </div>
      </div>
    </section>
  );
}

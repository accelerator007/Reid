// /f/:id — the page a respondent sees. It renders at once without waiting
// for sign-in, validates as it goes, sends through submit_form_response(),
// and says plainly when a form is closed, already answered or missing.
import React from 'react';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, FileText, Hash, LoaderCircle, Lock, MapPin, Paperclip, Pencil, RotateCcw, SearchX, Send, Star, User, X,
} from 'lucide-react';
import reidLogo from '../../assets/img/reid-logo.svg';
import * as api from './api';
import { compressImage } from './forms-ui';
import {
  MAX_FILE_MB, SERIES, acceptAttribute, answerError, answerErrors, deviceKey, fileProblem, isEmpty, paginate, ratingLine, ratingWord,
  scaleRows, submitErrors, type Answer, type Answers, type AnswerError, type FileAnswer, type Lang, type Question,
} from './model';
import './respond.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const formIdFromUrl = () => location.pathname.replace(/\/+$/, '').split('/')[2] ?? '';
const sentKey = (id: string) => `reid-form-sent:${id}`;
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

type State = 'loading' | 'missing' | 'closed' | 'answered' | 'form' | 'sent';

export function RespondPage({ lang, toggleLang }: { lang: Lang; toggleLang: () => void }) {
  const id = formIdFromUrl();
  const [form, setForm] = React.useState<api.PublicForm | null>(null);
  const [state, setState] = React.useState<State>('loading');
  const [loadError, setLoadError] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoadError(false);
    const result = await api.loadPublicForm(id);
    if (!result.ok) { setLoadError(true); return; }
    if (!result.data) { setState('missing'); return; }
    setForm(result.data);
    document.title = `${result.data.title || tr(lang, 'نموذج', 'Form')} · ${SERIES[lang]}`;
    if (!result.data.open) setState('closed');
    else if (result.data.one_per_device && remembered(sentKey(id)) && !result.data.can_manage) setState('answered');
    else setState('form');
  }, [id, lang]);
  React.useEffect(() => { void load(); }, [load]);

  return (
    <div className="respond" data-theme={form?.theme ?? 'brand'} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {form?.can_manage && (
        <div className="respond-preview" role="note">
          <span>{tr(lang, 'معاينة: هكذا يرى المشاركون النموذج. ردك يُحتسب إن أرسلته.', 'Preview: this is what respondents see. A response you send counts.')}</span>
          <a href={`/forms/${id}`}><Pencil aria-hidden="true" />{tr(lang, 'تعديل', 'Edit')}</a>
        </div>
      )}
      <div className="respond-top">
        <span className="respond-brand"><img src={reidLogo} alt="" aria-hidden="true" /><span>{SERIES[lang]}</span></span>
        <button type="button" className="respond-lang" onClick={toggleLang}>{lang === 'ar' ? 'English' : 'العربية'}</button>
      </div>
      <main className="respond-main">
        {state === 'loading' && !loadError && <LoadingCard />}
        {loadError && (
          <StatusCard icon={<SearchX />} title={tr(lang, 'تعذّر فتح النموذج', 'Could not open the form')} text={tr(lang, 'تحقق من الاتصال ثم حاول مرة أخرى.', 'Check your connection and try again.')}
            action={<button type="button" className="respond-button" onClick={() => void load()}>{tr(lang, 'أعد المحاولة', 'Try again')}</button>} />
        )}
        {state === 'missing' && <StatusCard icon={<SearchX />} title={tr(lang, 'النموذج غير موجود', 'This form does not exist')} text={tr(lang, 'ربما حُذف أو أن الرابط غير مكتمل.', 'It may have been deleted, or the link is incomplete.')} />}
        {state === 'closed' && form && <StatusCard icon={<Lock />} title={form.title} text={tr(lang, 'هذا النموذج لم يعد يستقبل ردودًا. شكرًا لاهتمامك.', 'This form is no longer accepting responses. Thank you for your interest.')} />}
        {state === 'answered' && form && <StatusCard icon={<Check />} title={form.title} text={tr(lang, 'سبق إرسال رد من هذا الجهاز. شكرًا لك!', 'A response was already sent from this device. Thank you!')} />}
        {state === 'form' && form && <FormFlow lang={lang} form={form} done={() => { setState('sent'); if (form.one_per_device) { try { localStorage.setItem(sentKey(id), '1'); } catch { /* private mode */ } } }}
          refused={code => setState(code === 'form_closed' ? 'closed' : code === 'form_not_found' ? 'missing' : 'answered')} />}
        {state === 'sent' && form && <Success lang={lang} form={form} again={form.one_per_device ? null : () => setState('form')} />}
      </main>
      <div className="respond-footer">{tr(lang, 'لا تُرسل كلمات المرور عبر النماذج.', 'Never send passwords through forms.')} · <a href="/">{tr(lang, 'ريّد', 'Reid')}</a></div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="respond-loading" aria-busy="true" aria-live="polite">
      <div className="respond-loading__art" aria-hidden="true"><span /><span /><span /></div>
      <div className="respond-loading__bar" aria-hidden="true"><i /></div>
    </div>
  );
}

function StatusCard({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <section className="respond-card respond-status">
      <span className="respond-status__icon" aria-hidden="true">{icon}</span>
      <h1 dir="auto">{title}</h1>
      <p>{text}</p>
      {action}
    </section>
  );
}

type Other = Record<string, { on: boolean; text: string }>;

function FormFlow({ lang, form, done, refused }: { lang: Lang; form: api.PublicForm; done: () => void; refused: (code: string) => void }) {
  const pages = React.useMemo(() => paginate(form.questions), [form.questions]);
  const [page, setPage] = React.useState(0);
  const [answers, setAnswers] = React.useState<Answers>({});
  const [other, setOther] = React.useState<Other>({});
  const [errors, setErrors] = React.useState<Record<string, AnswerError | string>>({});
  const [shaking, setShaking] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [failure, setFailure] = React.useState('');
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const current = pages[page];
  const last = page === pages.length - 1;
  const hasRequired = form.questions.some(question => question.required);

  const valueOf = (question: Question): Answer | undefined => {
    const own = answers[question.id];
    const extra = other[question.id];
    if (question.type === 'choice' && extra?.on) return extra.text.trim();
    if (question.type === 'checkbox' && extra?.on) return [...((own as string[] | undefined) ?? []), ...(extra.text.trim() ? [extra.text.trim()] : [])];
    return own;
  };
  const set = (question: Question, value: Answer | undefined) => {
    setAnswers(all => { const next = { ...all }; if (value === undefined) delete next[question.id]; else next[question.id] = value; return next; });
    if (errors[question.id]) setErrors(all => { const next = { ...all }; delete next[question.id]; return next; });
  };
  const flag = (id: string, error: AnswerError | string) => {
    setErrors(all => ({ ...all, [id]: error }));
    setShaking(id);
    window.setTimeout(() => setShaking(value => (value === id ? null : value)), 500);
    const card = document.getElementById(`field-${id}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.querySelector<HTMLElement>('input,textarea,select,button')?.focus({ preventScroll: true });
  };
  const check = (questions: Question[]) => {
    const found: Record<string, AnswerError> = {};
    for (const question of questions) {
      const error = answerError(question, valueOf(question));
      if (error) found[question.id] = error;
    }
    const first = questions.find(question => found[question.id]);
    setErrors(all => ({ ...Object.fromEntries(Object.entries(all).filter(([key]) => !questions.some(question => question.id === key))), ...found }));
    if (first) flag(first.id, found[first.id]);
    return !first;
  };
  const move = (by: 1 | -1) => {
    if (by === 1 && !check(current.questions)) return;
    setDirection(by);
    setPage(value => Math.max(0, Math.min(pages.length - 1, value + by)));
    requestAnimationFrame(() => scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const submit = async () => {
    if (!check(current.questions)) return;
    for (let index = 0; index < pages.length; index += 1) {
      const missing = pages[index].questions.find(question => answerError(question, valueOf(question)));
      if (missing) { setPage(index); requestAnimationFrame(() => flag(missing.id, answerError(missing, valueOf(missing))!)); return; }
    }
    const payload: Answers = {};
    for (const question of form.questions) {
      if (question.type === 'section') continue;
      const value = valueOf(question);
      if (!isEmpty(value)) payload[question.id] = value!;
    }
    setSending(true); setFailure('');
    const result = await api.submitResponse(form.id, payload, deviceKey(safeStorage()));
    setSending(false);
    if (result.ok) { done(); return; }
    if (['form_closed', 'form_not_found', 'already_submitted'].includes(result.code)) { refused(result.code); return; }
    setFailure(submitErrors[result.code]?.[lang] ?? tr(lang, 'تعذّر الإرسال. تحقق من الاتصال وحاول مرة أخرى؛ إجاباتك محفوظة في الصفحة.', 'Could not send. Check your connection and try again; your answers are still here.'));
  };

  return (
    <form className="respond-flow" noValidate onSubmit={event => { event.preventDefault(); if (last) void submit(); else move(1); }}>
      <div className="respond-card respond-head">
        {form.cover_url && <img className="respond-head__cover" src={form.cover_url} alt="" />}
        <span className="respond-head__stripe" aria-hidden="true" />
        <div className="respond-head__body">
          <h1 dir="auto">{form.title}</h1>
          {form.description && <p dir="auto">{form.description}</p>}
          <WorkshopBadges lang={lang} workshop={form.workshop} />
          {hasRequired && <small className="respond-required-note"><b aria-hidden="true">*</b> {tr(lang, 'يشير إلى سؤال إلزامي', 'Indicates a required question')}</small>}
        </div>
        {pages.length > 1 && (
          <div className="respond-progress" role="progressbar" aria-valuemin={1} aria-valuemax={pages.length} aria-valuenow={page + 1}
            aria-valuetext={tr(lang, `الصفحة ${page + 1} من ${pages.length}`, `Page ${page + 1} of ${pages.length}`)}>
            <i style={{ transform: `scaleX(${(page + 1) / pages.length})` }} />
          </div>
        )}
      </div>

      <div className="respond-page" key={page} data-direction={direction}>
        {current.section && (
          <section className="respond-card respond-section">
            <h2 dir="auto">{current.section.title}</h2>
            {current.section.description && <p dir="auto">{current.section.description}</p>}
          </section>
        )}
        {current.questions.map(question => (
          <Field key={question.id} lang={lang} formId={form.id} question={question} value={answers[question.id]} other={other[question.id]}
            error={errors[question.id]} shaking={shaking === question.id}
            onChange={value => set(question, value)}
            onOther={next => { setOther(all => ({ ...all, [question.id]: next })); if (errors[question.id]) setErrors(all => { const copy = { ...all }; delete copy[question.id]; return copy; }); }}
            onUploading={by => setUploading(count => count + by)} />
        ))}
      </div>

      {failure && <p className="respond-failure" role="alert">{failure}</p>}
      <div className="respond-nav">
        {page > 0 ? <button type="button" className="respond-button respond-button--ghost" onClick={() => move(-1)}>{lang === 'ar' ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}{tr(lang, 'السابق', 'Back')}</button> : <span />}
        {pages.length > 1 && <span className="respond-nav__page">{tr(lang, `الصفحة ${page + 1} من ${pages.length}`, `Page ${page + 1} of ${pages.length}`)}</span>}
        <button type="submit" className="respond-button" disabled={sending || uploading > 0} aria-busy={sending || undefined}>
          {sending ? <LoaderCircle className="respond-spin" aria-hidden="true" /> : last ? <Send aria-hidden="true" /> : null}
          {uploading > 0 ? tr(lang, 'جارٍ رفع الملفات…', 'Uploading files…') : last ? tr(lang, 'إرسال', 'Send') : tr(lang, 'التالي', 'Next')}
          {!last && !sending && (lang === 'ar' ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />)}
        </button>
      </div>
    </form>
  );
}

const safeStorage = () => { try { return localStorage; } catch { return null; } };

function WorkshopBadges({ lang, workshop }: { lang: Lang; workshop: api.PublicForm['workshop'] }) {
  const date = workshop.date ? new Date(`${workshop.date}T00:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const items: Array<[React.ReactNode, string]> = [
    [<Hash key="n" />, workshop.number ? tr(lang, `الورشة ${workshop.number}`, `Workshop ${workshop.number}`) : ''],
    [<FileText key="w" />, workshop.name ?? ''], [<CalendarDays key="d" />, date], [<User key="p" />, workshop.presenter ?? ''], [<MapPin key="l" />, workshop.location ?? ''],
  ];
  const shown = items.filter(([, text]) => text);
  if (!shown.length) return null;
  return <ul className="respond-badges">{shown.map(([icon, text]) => <li key={text}><span aria-hidden="true">{icon}</span><bdi>{text}</bdi></li>)}</ul>;
}

function Field({ lang, formId, question, value, other, error, shaking, onChange, onOther, onUploading }: {
  lang: Lang; formId: string; question: Question; value: Answer | undefined; other?: { on: boolean; text: string }; error?: string; shaking: boolean;
  onChange: (value: Answer | undefined) => void; onOther: (next: { on: boolean; text: string }) => void; onUploading: (by: 1 | -1) => void;
}) {
  const titleId = `title-${question.id}`;
  const errorId = `error-${question.id}`;
  const described = error ? errorId : undefined;
  const message = error ? (answerErrors as Record<string, { ar: string; en: string }>)[error]?.[lang] ?? error : '';
  const text = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input className="respond-input" aria-labelledby={titleId} aria-describedby={described} aria-invalid={!!error || undefined} aria-required={question.required || undefined}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''} dir="auto" {...props} />
  );
  return (
    <section id={`field-${question.id}`} className="respond-card respond-field" data-error={!!error || undefined} data-shake={shaking || undefined}>
      <h3 id={titleId} dir="auto">{question.title}{question.required && <b className="respond-star" aria-label={tr(lang, 'إلزامي', 'required')}> *</b>}</h3>
      {question.description && <p className="respond-field__description" dir="auto">{question.description}</p>}
      {question.image && <img className="respond-field__image" src={question.image} alt="" loading="lazy" />}
      {question.type === 'short' && text({ type: 'text', maxLength: 1000, onChange: event => onChange(event.target.value) })}
      {question.type === 'email' && text({ type: 'email', inputMode: 'email', autoComplete: 'email', maxLength: 254, dir: 'ltr', onChange: event => onChange(event.target.value) })}
      {question.type === 'phone' && text({ type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 20, dir: 'ltr', placeholder: '+968', onChange: event => onChange(event.target.value) })}
      {question.type === 'number' && text({ type: 'text', inputMode: 'decimal', dir: 'ltr', onChange: event => { const raw = event.target.value.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim(); onChange(raw === '' ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : raw); } })}
      {question.type === 'date' && text({ type: 'date', onChange: event => onChange(event.target.value) })}
      {question.type === 'time' && text({ type: 'time', onChange: event => onChange(event.target.value) })}
      {question.type === 'paragraph' && <GrowArea titleId={titleId} described={described} invalid={!!error} value={typeof value === 'string' ? value : ''} onChange={onChange} />}
      {(question.type === 'choice' || question.type === 'checkbox') && <Choices lang={lang} question={question} value={value} other={other} titleId={titleId} onChange={onChange} onOther={onOther} />}
      {question.type === 'dropdown' && (
        <select className="respond-input" aria-labelledby={titleId} aria-describedby={described} aria-invalid={!!error || undefined} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)}>
          <option value="">{tr(lang, 'اختر…', 'Choose…')}</option>
          {(question.options ?? []).map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      )}
      {question.type === 'image_choice' && (
        <div className="respond-images" role="radiogroup" aria-labelledby={titleId}>
          {(question.options ?? []).map(option => (
            <label key={option.id} className="respond-image" data-checked={value === option.label || undefined}>
              <input type="radio" name={question.id} checked={value === option.label} onChange={() => onChange(option.label)} />
              {option.image ? <img src={option.image} alt="" loading="lazy" /> : <span className="respond-image__empty" aria-hidden="true" />}
              <span className="respond-image__label" dir="auto"><i aria-hidden="true"><Check /></i>{option.label}</span>
            </label>
          ))}
        </div>
      )}
      {question.type === 'rating' && <Rating lang={lang} question={question} value={typeof value === 'number' ? value : undefined} titleId={titleId} onChange={onChange} />}
      {question.type === 'scale' && <Scale lang={lang} question={question} value={typeof value === 'number' ? value : undefined} titleId={titleId} onChange={onChange} />}
      {question.type === 'file' && <Files lang={lang} formId={formId} question={question} value={Array.isArray(value) ? value as FileAnswer[] : []} onChange={onChange} onUploading={onUploading} titleId={titleId} />}
      {error && <p id={errorId} className="respond-error" role="alert">{message}</p>}
    </section>
  );
}

function GrowArea({ titleId, described, invalid, value, onChange }: { titleId: string; described?: string; invalid: boolean; value: string; onChange: (value: string) => void }) {
  const node = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => { const area = node.current; if (area) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; } }, [value]);
  return <textarea ref={node} rows={3} className="respond-input respond-textarea" aria-labelledby={titleId} aria-describedby={described} aria-invalid={invalid || undefined} maxLength={10000} dir="auto" value={value} onChange={event => onChange(event.target.value)} />;
}

function Choices({ lang, question, value, other, titleId, onChange, onOther }: {
  lang: Lang; question: Question; value: Answer | undefined; other?: { on: boolean; text: string }; titleId: string;
  onChange: (value: Answer | undefined) => void; onOther: (next: { on: boolean; text: string }) => void;
}) {
  const many = question.type === 'checkbox';
  const picked = many ? ((value as string[] | undefined) ?? []) : [];
  const otherOn = other?.on ?? false;
  return (
    <div className="respond-choices" role={many ? 'group' : 'radiogroup'} aria-labelledby={titleId}>
      {(question.options ?? []).map(option => {
        const checked = many ? picked.includes(option.label) : value === option.label && !otherOn;
        return (
          <label key={option.id} className="respond-choice" data-checked={checked || undefined}>
            <input type={many ? 'checkbox' : 'radio'} name={question.id} checked={checked}
              onChange={event => {
                if (many) onChange(event.target.checked ? [...picked, option.label] : picked.filter(item => item !== option.label));
                else { onChange(option.label); if (otherOn) onOther({ on: false, text: other?.text ?? '' }); }
              }} />
            <span className="respond-choice__mark" aria-hidden="true">{many && <Check />}</span>
            <span dir="auto">{option.label}</span>
          </label>
        );
      })}
      {question.other && (
        <div className="respond-choice respond-choice--other" data-checked={otherOn || undefined}>
          <label>
            <input type={many ? 'checkbox' : 'radio'} name={question.id} checked={otherOn}
              onChange={event => { onOther({ on: many ? event.target.checked : true, text: other?.text ?? '' }); if (!many) onChange(undefined); }} />
            <span className="respond-choice__mark" aria-hidden="true">{many && <Check />}</span>
            <span>{tr(lang, 'أخرى:', 'Other:')}</span>
          </label>
          <input className="respond-input respond-input--inline" value={other?.text ?? ''} maxLength={500} dir="auto" aria-label={tr(lang, 'إجابة أخرى', 'Other answer')}
            onChange={event => { onOther({ on: true, text: event.target.value }); if (!many) onChange(undefined); }} />
        </div>
      )}
    </div>
  );
}

function Rating({ lang, question, value, titleId, onChange }: { lang: Lang; question: Question; value?: number; titleId: string; onChange: (value: number) => void }) {
  const max = question.max ?? 5;
  const [hover, setHover] = React.useState<number | null>(null);
  const [pulse, setPulse] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const choose = (n: number) => { onChange(n); setPulse(n); window.setTimeout(() => setPulse(null), 420); };
  const keys = (event: React.KeyboardEvent) => {
    const forward = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    if ([forward, 'ArrowUp'].includes(event.key)) { event.preventDefault(); choose(Math.min(max, (value ?? 0) + 1)); }
    if ([back, 'ArrowDown'].includes(event.key)) { event.preventDefault(); choose(Math.max(1, (value ?? 2) - 1)); }
  };
  return (
    <div className="respond-rating" style={{ '--stars': max } as React.CSSProperties}>
      <div className="respond-rating__stars" role="radiogroup" aria-labelledby={titleId} onKeyDown={keys} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: max }, (_, index) => index + 1).map(n => (
          <button key={n} type="button" role="radio" aria-checked={value === n} tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
            aria-label={ratingLine(n, max, lang)} className="respond-star-button" data-on={n <= shown || undefined} data-pulse={pulse === n || undefined}
            onMouseEnter={() => setHover(n)} onClick={() => choose(n)}>
            <Star aria-hidden="true" /><small>{n}</small>
          </button>
        ))}
      </div>
      <div className="respond-rating__ends" aria-hidden="true"><span>{ratingWord(1, max, lang)}</span><span>{ratingWord(max, max, lang)}</span></div>
      <p className="respond-rating__live" aria-live="polite">{value ? ratingLine(value, max, lang) : tr(lang, 'اختر من 1 إلى ' + max, `Choose 1 to ${max}`)}</p>
    </div>
  );
}

function Scale({ lang, question, value, titleId, onChange }: { lang: Lang; question: Question; value?: number; titleId: string; onChange: (value: number) => void }) {
  const min = question.min ?? 1, max = question.max ?? 5;
  const rows = scaleRows(min, max);
  return (
    <div className="respond-scale">
      <div className="respond-scale__rows" role="radiogroup" aria-labelledby={titleId} data-rows={rows.length}>
        {rows.map((row, index) => (
          <div className="respond-scale__row" key={index}>
            {row.map(n => (
              <label key={n} className="respond-scale__option" data-checked={value === n || undefined}>
                <input type="radio" name={question.id} checked={value === n} onChange={() => onChange(n)}
                  aria-label={n === min && question.minLabel ? `${n} — ${question.minLabel}` : n === max && question.maxLabel ? `${n} — ${question.maxLabel}` : String(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {(question.minLabel || question.maxLabel) && (
        <div className="respond-scale__ends">
          <span><b>{min}</b> <bdi>{question.minLabel || '—'}</bdi></span>
          <span><b>{max}</b> <bdi>{question.maxLabel || '—'}</bdi></span>
        </div>
      )}
    </div>
  );
}

function Files({ lang, formId, question, value, onChange, onUploading, titleId }: {
  lang: Lang; formId: string; question: Question; value: FileAnswer[]; onChange: (value: Answer | undefined) => void;
  onUploading: (by: 1 | -1) => void; titleId: string;
}) {
  const [busy, setBusy] = React.useState<string[]>([]);
  const [problem, setProblem] = React.useState('');
  const latest = React.useRef(value);
  latest.current = value;
  const pick = async (files: FileList | null) => {
    setProblem('');
    for (const file of Array.from(files ?? []).slice(0, 5 - latest.current.length)) {
      const issue = fileProblem(file, question.accept);
      if (issue) { setProblem(`${file.name}: ${answerErrors[issue][lang]}`); continue; }
      setBusy(list => [...list, file.name]); onUploading(1);
      const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
      const result = await api.uploadAnswerFile(formId, blob, blob === file ? file.name : file.name.replace(/\.[^.]+$/, '.jpg'));
      setBusy(list => list.filter(name => name !== file.name)); onUploading(-1);
      if (result.ok) onChange([...latest.current, result.data]);
      else setProblem(tr(lang, `تعذّر رفع ${file.name}. حاول مرة أخرى.`, `Could not upload ${file.name}. Try again.`));
    }
  };
  return (
    <div className="respond-files">
      <label className="respond-file-pick" data-disabled={value.length >= 5 || undefined}>
        <Paperclip aria-hidden="true" />
        <span>{tr(lang, 'اختر ملفًا', 'Choose a file')}</span>
        <small>{tr(lang, `حتى ${MAX_FILE_MB} ميجابايت`, `Up to ${MAX_FILE_MB} MB`)}</small>
        <input type="file" multiple accept={acceptAttribute(question.accept)} aria-labelledby={titleId} disabled={value.length >= 5}
          onChange={event => { void pick(event.target.files); event.target.value = ''; }} />
      </label>
      {(value.length > 0 || busy.length > 0) && (
        <ul className="respond-file-list">
          {value.map(file => (
            <li key={file.path}>
              <FileText aria-hidden="true" /><bdi>{file.name}</bdi><small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
              <button type="button" aria-label={tr(lang, `إزالة ${file.name}`, `Remove ${file.name}`)} onClick={() => onChange(value.filter(item => item.path !== file.path))}><X /></button>
            </li>
          ))}
          {busy.map(name => <li key={name} data-busy><LoaderCircle className="respond-spin" aria-hidden="true" /><bdi>{name}</bdi><small>{tr(lang, 'جارٍ الرفع…', 'Uploading…')}</small></li>)}
        </ul>
      )}
      {problem && <p className="respond-error" role="alert">{problem}</p>}
    </div>
  );
}

function Success({ lang, form, again }: { lang: Lang; form: api.PublicForm; again: (() => void) | null }) {
  const pieces = React.useMemo(() => Array.from({ length: 36 }, (_, index) => ({
    left: `${(index * 97) % 100}%`, delay: `${(index % 9) * 60}ms`, spin: `${(index * 53) % 360}deg`, drift: `${((index * 37) % 120) - 60}px`, tone: index % 4,
  })), []);
  return (
    <section className="respond-card respond-success">
      <div className="respond-confetti" aria-hidden="true">
        {pieces.map((piece, index) => <i key={index} data-tone={piece.tone} style={{ insetInlineStart: piece.left, animationDelay: piece.delay, '--spin': piece.spin, '--drift': piece.drift } as React.CSSProperties} />)}
      </div>
      <svg className="respond-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27 l7 7 l15 -16" /></svg>
      <h1>{tr(lang, 'تم الإرسال', 'Sent')}</h1>
      <p dir="auto">{form.confirm_message || tr(lang, 'شكرًا لك! وصلنا ردك.', 'Thank you! We received your response.')}</p>
      {again && <button type="button" className="respond-button respond-button--ghost" onClick={again}><RotateCcw aria-hidden="true" />{tr(lang, 'إرسال رد آخر', 'Send another response')}</button>}
    </section>
  );
}

// A form's responses: a summary per question (bars, stars, scales, text,
// files), one response at a time, or the whole table; Excel export, and
// deleting for owners and editors.
import React from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Download, FileDown, FileText, Inbox, RefreshCw, Star, Table2, Trash2, UserRound } from 'lucide-react';
import { messageFor, type AppError } from '../db';
import { Button, EmptyState, InlineAlert, Skeleton } from '../ui';
import * as api from './api';
import { ConfirmDialog } from './form-dialogs';
import { CountUp, Switch, useReveal, useToast } from './forms-ui';
import {
  answerCell, answerable, exportTable, formRating, isOpen, questionTypes, responsesLine, summarize,
  type FileAnswer, type Form, type FormResponse, type FormRole, type Lang, type Question,
} from './model';
import { buildXlsx, fitWidths, type Cell } from './xlsx';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type View = 'summary' | 'single' | 'table';

export function FormResponses({ lang, form, role, update }: { lang: Lang; form: Form; role: FormRole; update: (patch: api.FormFields) => void }) {
  const toast = useToast();
  const [responses, setResponses] = React.useState<FormResponse[] | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [view, setView] = React.useState<View>('summary');
  const [clearing, setClearing] = React.useState(false);
  const canDelete = role !== 'viewer';
  const load = React.useCallback(async () => {
    const result = await api.loadResponses(form.id);
    if (result.ok) setResponses(result.data); else setError(result.error);
  }, [form.id]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [load]);

  const questions = answerable(form.questions);
  const rating = responses ? formRating(form.questions, responses) : null;
  const remove = async (items: FormResponse[]) => {
    const result = await api.deleteResponses(items, form.questions);
    if (!result.ok) { toast(messageFor(result.error, lang), 'danger'); return; }
    toast(items.length === 1 ? tr(lang, 'حُذف الرد.', 'Response deleted.') : tr(lang, 'حُذفت كل الردود.', 'All responses deleted.'));
    await load();
  };
  const exportExcel = () => {
    if (!responses) return;
    const table = exportTable(form, responses, lang);
    const summary: Cell[][] = [[tr(lang, 'السؤال', 'Question'), tr(lang, 'النوع', 'Type'), tr(lang, 'عدد الإجابات', 'Answers'), tr(lang, 'المتوسط', 'Average'), tr(lang, 'الأكثر اختيارًا', 'Most chosen'), tr(lang, 'النسبة %', 'Share %')]];
    for (const question of questions) {
      const result = summarize(question, responses, lang);
      const top = result.kind === 'choice' ? [...result.rows].sort((a, b) => b.count - a.count)[0] : undefined;
      summary.push([question.title, questionTypes[question.type].label[lang], result.total,
        result.kind === 'rating' || result.kind === 'scale' ? result.average ?? '' : '', top?.count ? top.label : '', top?.count ? top.share : '']);
    }
    if (rating != null) summary.push([], [tr(lang, 'متوسط التقييم العام (من 5)', 'Overall rating (of 5)'), '', responses.length, rating]);
    const bytes = buildXlsx([
      { name: tr(lang, 'الردود', 'Responses'), rows: table, widths: fitWidths(table, 50), rtl: lang === 'ar', filter: true },
      { name: tr(lang, 'الملخص والتقييمات', 'Summary'), rows: summary, widths: fitWidths(summary, 60), rtl: lang === 'ar', filter: false },
    ]);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${(form.title || 'form').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.xlsx` });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="responses">
      <div className="responses-head">
        <div className="responses-head__count">
          <span>{tr(lang, 'إجمالي الردود', 'Total responses')}</span>
          <strong>{responses ? <CountUp value={responses.length} /> : '—'}</strong>
          {rating != null && <span className="responses-head__rating"><Star aria-hidden="true" />{rating.toFixed(1)} {tr(lang, 'من 5', 'of 5')}</span>}
        </div>
        <div className="responses-head__actions">
          {canDelete && <Switch checked={form.accepting} onChange={accepting => update({ accepting })} label={tr(lang, 'استقبال الردود', 'Accepting responses')}
            description={!isOpen(form) && form.accepting ? tr(lang, 'انتهى موعد الإغلاق', 'The closing date has passed') : undefined} />}
          <Button icon={<RefreshCw />} onClick={() => void load()}>{tr(lang, 'تحديث', 'Refresh')}</Button>
          <Button variant="primary" icon={<FileDown />} data-ripple disabled={!responses?.length} onClick={exportExcel}>{tr(lang, 'تصدير Excel', 'Export Excel')}</Button>
          {canDelete && <Button variant="ghost" icon={<Trash2 />} disabled={!responses?.length} onClick={() => setClearing(true)}>{tr(lang, 'حذف الكل', 'Delete all')}</Button>}
        </div>
      </div>
      {error && <InlineAlert>{messageFor(error, lang)}</InlineAlert>}
      <div className="responses-views" role="tablist" aria-label={tr(lang, 'طريقة العرض', 'View')}>
        {([['summary', 'ملخص', 'Summary', <BarChart3 key="a" />], ['single', 'فردي', 'Individual', <UserRound key="b" />], ['table', 'جدول', 'Table', <Table2 key="c" />]] as const).map(([id, ar, en, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{icon}{tr(lang, ar, en)}</button>
        ))}
      </div>
      {!responses && !error && <Skeleton lines={6} />}
      {responses && !responses.length && (
        <EmptyState icon={<Inbox />} title={tr(lang, 'لا ردود بعد', 'No responses yet')}
          description={form.accepting ? tr(lang, 'شارك الرابط أو رمز QR، وستظهر الردود هنا.', 'Share the link or the QR code; responses appear here.') : tr(lang, 'النموذج مغلق. فعّل «استقبال الردود» ليبدأ الاستقبال.', 'The form is closed. Turn on “Accepting responses” to start.')} />
      )}
      {responses && responses.length > 0 && (
        <div className="responses-panel" key={view}>
          {view === 'summary' && <Summary lang={lang} questions={questions} responses={responses} />}
          {view === 'single' && <Single lang={lang} questions={questions} responses={responses} canDelete={canDelete} remove={item => void remove([item])} />}
          {view === 'table' && <Table lang={lang} form={form} responses={responses} />}
        </div>
      )}
      <ConfirmDialog lang={lang} open={clearing} danger title={tr(lang, 'حذف كل الردود؟', 'Delete every response?')}
        description={tr(lang, 'ستُحذف كل الردود وملفاتها المرفوعة نهائيًا. صدّرها أولًا إن احتجتها.', 'Every response and its uploaded files will be deleted permanently. Export first if you need them.')}
        confirm={tr(lang, 'حذف الكل', 'Delete all')} onClose={() => setClearing(false)} onConfirm={async () => { if (responses) await remove(responses); setClearing(false); }} />
    </div>
  );
}

function Summary({ lang, questions, responses }: { lang: Lang; questions: Question[]; responses: FormResponse[] }) {
  const root = useReveal<HTMLDivElement>([responses.length]);
  return (
    <div className="summary" ref={root}>
      {questions.map(question => {
        const result = summarize(question, responses, lang);
        return (
          <section key={question.id} className="summary-card" data-reveal>
            <div className="summary-card__head">
              <h3 dir="auto">{question.title || tr(lang, 'بدون عنوان', 'Untitled')}</h3>
              <small>{questionTypes[question.type].label[lang]} · {responsesLine(result.total, lang)}</small>
            </div>
            {result.kind === 'choice' && (
              <ul className="bars">
                {result.rows.map(row => (
                  <li key={row.label}>
                    {row.image && <img src={row.image} alt="" loading="lazy" className="bars__image" />}
                    <span className="bars__label" dir="auto">{row.label}</span>
                    <span className="bars__track" aria-hidden="true"><i style={{ '--share': `${row.share}%` } as React.CSSProperties} /></span>
                    <span className="bars__value">{row.count} <small>({row.share}%)</small></span>
                  </li>
                ))}
              </ul>
            )}
            {result.kind === 'rating' && (
              <div className="rating-summary">
                <div className="rating-summary__big">
                  <strong>{result.average?.toFixed(2) ?? '—'}</strong>
                  <Stars value={result.average ?? 0} max={result.max} />
                  <small>{tr(lang, `من ${result.max}`, `of ${result.max}`)}</small>
                </div>
                <ul className="bars bars--compact">
                  {[...result.rows].reverse().map(row => (
                    <li key={row.value}>
                      <span className="bars__label">{row.value} <Star aria-hidden="true" /></span>
                      <span className="bars__track" aria-hidden="true"><i style={{ '--share': `${row.share}%` } as React.CSSProperties} /></span>
                      <span className="bars__value">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.kind === 'scale' && (
              <div className="scale-summary">
                <p>{tr(lang, 'المتوسط', 'Average')}: <strong>{result.average?.toFixed(2) ?? '—'}</strong></p>
                <div className="columns" aria-hidden="true">
                  {result.rows.map(row => (
                    <span key={row.value} className="columns__item"><i style={{ '--share': `${Math.max(row.share, row.count ? 4 : 0)}%` } as React.CSSProperties} /><b>{row.value}</b><small>{row.count}</small></span>
                  ))}
                </div>
                <ul className="fx-visually-hidden">{result.rows.map(row => <li key={row.value}>{row.value}: {row.count}</li>)}</ul>
              </div>
            )}
            {result.kind === 'text' && <TextAnswers lang={lang} items={result.items} />}
            {result.kind === 'files' && (
              result.items.length ? <ul className="file-list">{result.items.map(file => <FileLink key={file.path} lang={lang} file={file} />)}</ul>
                : <p className="fx-muted">{tr(lang, 'لا ملفات.', 'No files.')}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Stars filled to the exact average, e.g. 4.3 fills the fifth star by 30%. */
export function Stars({ value, max }: { value: number; max: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} / ${max}`}>
      {Array.from({ length: max }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return <span key={index} className="stars__one" style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}><Star aria-hidden="true" /><Star aria-hidden="true" /></span>;
      })}
    </span>
  );
}

function TextAnswers({ lang, items }: { lang: Lang; items: string[] }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? items : items.slice(0, 8);
  if (!items.length) return <p className="fx-muted">{tr(lang, 'لا إجابات.', 'No answers.')}</p>;
  return (
    <>
      <ul className="text-answers">{shown.map((item, index) => <li key={index} dir="auto">{item}</li>)}</ul>
      {items.length > 8 && <button type="button" className="fx-text-button" onClick={() => setAll(value => !value)}>{all ? tr(lang, 'عرض أقل', 'Show less') : tr(lang, `عرض الكل (${items.length})`, `Show all (${items.length})`)}</button>}
    </>
  );
}

function FileLink({ lang, file }: { lang: Lang; file: FileAnswer }) {
  const toast = useToast();
  const open = async () => {
    const result = await api.openFile(file.path);
    if (result.ok && result.data) window.open(result.data, '_blank', 'noopener');
    else toast(tr(lang, 'تعذّر تحميل الملف؛ ربما حُذف.', 'Could not download the file; it may have been deleted.'), 'danger');
  };
  return (
    <li>
      <button type="button" className="file-link" onClick={() => void open()}>
        <FileText aria-hidden="true" /><bdi>{file.name}</bdi><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><Download aria-hidden="true" />
      </button>
    </li>
  );
}

function Single({ lang, questions, responses, canDelete, remove }: { lang: Lang; questions: Question[]; responses: FormResponse[]; canDelete: boolean; remove: (item: FormResponse) => void }) {
  const ordered = [...responses].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [at, setAt] = React.useState(ordered.length - 1);
  const index = Math.min(at, ordered.length - 1);
  const item = ordered[index];
  const prev = () => setAt(Math.max(0, index - 1));
  const next = () => setAt(Math.min(ordered.length - 1, index + 1));
  return (
    <div className="single">
      <div className="single__nav">
        <button type="button" className="fx-icon-button" disabled={index === 0} onClick={prev} aria-label={tr(lang, 'الرد السابق', 'Previous response')}>{lang === 'ar' ? <ArrowRight /> : <ArrowLeft />}</button>
        <strong>{tr(lang, `الرد ${index + 1} من ${ordered.length}`, `Response ${index + 1} of ${ordered.length}`)}</strong>
        <button type="button" className="fx-icon-button" disabled={index === ordered.length - 1} onClick={next} aria-label={tr(lang, 'الرد التالي', 'Next response')}>{lang === 'ar' ? <ArrowLeft /> : <ArrowRight />}</button>
        <small>{new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Muscat', dateStyle: 'medium', timeStyle: 'short' })}</small>
        {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => remove(item)}>{tr(lang, 'حذف الرد', 'Delete response')}</Button>}
      </div>
      <dl className="single__answers">
        {questions.map(question => {
          const value = item.answers[question.id];
          return (
            <div key={question.id}>
              <dt dir="auto">{question.title || tr(lang, 'بدون عنوان', 'Untitled')}</dt>
              <dd>
                {question.type === 'file' && Array.isArray(value) && value.length
                  ? <ul className="file-list">{(value as FileAnswer[]).map(file => <FileLink key={file.path} lang={lang} file={file} />)}</ul>
                  : question.type === 'rating' && typeof value === 'number'
                    ? <span className="single__rating"><Stars value={value} max={question.max ?? 5} /> {value}</span>
                    : <span dir="auto">{String(answerCell(question, value)) || <em className="fx-muted">{tr(lang, 'بدون إجابة', 'No answer')}</em>}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Table({ lang, form, responses }: { lang: Lang; form: Form; responses: FormResponse[] }) {
  const [header, ...rows] = exportTable(form, responses, lang);
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={tr(lang, 'جدول الردود', 'Responses table')}>
      <table className="responses-table">
        <thead><tr>{header.map((cell, index) => <th key={index} scope="col" dir="auto">{cell}</th>)}</tr></thead>
        <tbody>{rows.reverse().map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} dir="auto" data-number={typeof cell === 'number' || undefined}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

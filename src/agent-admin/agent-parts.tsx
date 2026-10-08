// Pieces the agent list and the agent detail share: the time format, one run
// in a log, and the dialog that decides a run held for approval.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { decideRun } from '../agents';
import { messageForRaw } from '../db';
import { Badge, Button, Dialog, Field, InlineAlert, TextArea } from '../ui';
import type { RunWithRequester } from './api';
import { fieldLabel, levelLabel, runStates, type Lang } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

export const when = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });

/** A run held for a human decision, with an optional note kept on the record. */
export function DecideDialog({ lang, run, agentLabel, onClose, onDone }: {
  lang: Lang; run: RunWithRequester | null; agentLabel: string; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setNote(''); setError(''); }, [run?.id]);
  if (!run) return null;
  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision); setError('');
    try { await decideRun(run.id, decision, note.trim() || undefined); await onDone(); onClose(); }
    catch (thrown) { setError(messageForRaw(thrown, lang)); }
    finally { setBusy(null); }
  };
  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={tr(lang, 'قرار على تشغيل وكيل', 'Decide an agent run')}
      description={`${agentLabel} · ${levelLabel(run.approval_level, lang)}`}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <p className="decide__explain">
        {tr(lang,
          'هذا التشغيل متوقف حتى تقرر. عند الاعتماد ينفّذه الوكيل مباشرة؛ عند الرفض يُغلق ولا يُنفّذ شيء.',
          'This run is on hold until you decide. Approving lets the agent carry it out; rejecting closes it with nothing done.')}
      </p>
      <section className="decide__request" aria-label={tr(lang, 'تفاصيل الإجراء', 'Action details')}>
        <div><small>{tr(lang, 'العملية المطلوبة', 'Requested action')}</small><strong dir="ltr">{run.requested_tool || tr(lang, 'تشغيل محادثة', 'Conversation run')}</strong></div>
        {Object.keys(run.request_summary || {}).length > 0 && <dl>
          {Object.entries(run.request_summary).map(([key, value]) => <div key={key}><dt>{fieldLabel(key, lang)}</dt><dd dir={typeof value === 'string' && /^[\x00-\x7F]*$/.test(value) ? 'ltr' : undefined}>{String(value ?? '—')}</dd></div>)}
        </dl>}
      </section>
      <Field label={tr(lang, 'ملاحظة للسجل (اختياري)', 'Note for the record (optional)')} wide>
        <TextArea value={note} onChange={event => setNote(event.target.value)} maxLength={500} />
      </Field>
      <div className="decide__actions">
        <Button variant="ghost" onClick={onClose}>{tr(lang, 'إلغاء', 'Cancel')}</Button>
        <Button variant="danger" busy={busy === 'rejected'} disabled={!!busy} onClick={() => void decide('rejected')}>{tr(lang, 'رفض', 'Reject')}</Button>
        <Button variant="primary" busy={busy === 'approved'} disabled={!!busy} onClick={() => void decide('approved')}>{tr(lang, 'اعتماد وتنفيذ', 'Approve and run')}</Button>
      </div>
    </Dialog>
  );
}

export function RunRowView({ lang, run, agentLabel, requester, onAgent, actions }: {
  lang: Lang; run: RunWithRequester; agentLabel?: string; requester?: string; onAgent?: () => void; actions?: React.ReactNode;
}) {
  const state = runStates[run.run_state];
  return (
    <article className="run" data-state={run.run_state}>
      <div className="run__head">
        <Badge tone={state.tone} dot>{state.label[lang]}</Badge>
        {agentLabel && (onAgent ? <button type="button" className="run__agent" onClick={onAgent}>{agentLabel}</button> : <strong>{agentLabel}</strong>)}
        <small>{when(run.created_at, lang)}{requester ? ` · ${requester}` : ''}</small>
      </div>
      {run.output_preview && <p className="run__output">{run.output_preview}</p>}
      {run.error && <p className="run__error"><AlertTriangle aria-hidden="true" />{messageForRaw(run.error, lang)}</p>}
      <div className="run__facts">
        {run.latency_ms != null && <span>{tr(lang, 'المدة', 'Time')}: <b dir="ltr">{(run.latency_ms / 1000).toFixed(1)}s</b></span>}
        {run.quality_score != null && <span>{tr(lang, 'جودة الرد', 'Quality')}: <b dir="ltr">{run.quality_score}/100</b></span>}
        {run.revision_count > 0 && <span>{tr(lang, 'رُوجع تلقائيًا', 'Auto-revised')}</span>}
        {run.approval_level >= 2 && <span>L{run.approval_level}</span>}
      </div>
      {actions}
    </article>
  );
}

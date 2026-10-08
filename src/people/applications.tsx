// Join applications, inside People for those who decide them (owner,
// super_admin, admin, hr). Approving invites the applicant by email; a failed
// invitation stays listed until it is sent again.
import React from 'react';
import { ExternalLink, FileText, Inbox, MailWarning, Send } from 'lucide-react';
import { messageFor, type AppError } from '../db';
import { Badge, Button, Card, Dialog, EmptyState, Field, InlineAlert, SectionHeader, Skeleton, TextArea } from '../ui';
import * as api from './api';
import { accountTypes, type Lang } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const day = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Muscat' });

export function Applications({ lang, onCount }: { lang: Lang; onCount: (count: number) => void }) {
  const [data, setData] = React.useState<api.Applications | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [notice, setNotice] = React.useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [reviewing, setReviewing] = React.useState<api.Application | null>(null);
  const [suggested, setSuggested] = React.useState<'approved' | 'rejected' | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const result = await api.loadApplications();
    if (result.data) { setData(result.data); onCount(result.data.pending.length); }
    setError(result.error);
  }, [onCount]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let timer: number | undefined;
    return api.subscribeToApplications(() => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 400); });
  }, [load]);
  // A link from an email (?review=id&decision=approved) opens that application
  // with the suggested decision marked; the decision itself is still manual.
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('review');
    const match = wanted && data?.pending.find(item => item.id === wanted);
    if (!match) return;
    const decision = params.get('decision');
    setSuggested(decision === 'approved' || decision === 'rejected' ? decision : null);
    setReviewing(match);
    params.delete('review'); params.delete('decision');
    const rest = params.toString();
    history.replaceState({}, '', `${location.pathname}${rest ? `?${rest}` : ''}`);
  }, [data]);

  const retry = async (item: api.Application) => {
    setRetrying(item.id); setNotice(null);
    const result = await api.decideApplication(item.id, 'retry_invitation');
    setRetrying(null);
    if (!result.ok) setNotice({ tone: 'danger', text: messageFor(result.error, lang) });
    else setNotice(result.data.invitationStatus === 'sent'
      ? { tone: 'success', text: tr(lang, `أُرسلت الدعوة إلى ${item.email}.`, `Invitation sent to ${item.email}.`) }
      : { tone: 'danger', text: tr(lang, 'تعذّر إرسال الدعوة مرة أخرى.', 'The invitation failed again.') });
    await load();
  };

  if (!data && !error) return <Skeleton lines={5} />;
  return (
    <div className="applications">
      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'أعد المحاولة', 'Try again')}</Button>}>{messageFor(error, lang)}</InlineAlert>}
      {notice && <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>}

      {data && data.failedInvites.length > 0 && (
        <Card>
          <SectionHeader title={tr(lang, 'دعوات لم تصل', 'Invitations that did not go out')}
            description={tr(lang, 'قُبل الطلب لكن فشل إرسال البريد. أعد الإرسال بعد التأكد من العنوان.', 'Approved, but the email failed. Resend after checking the address.')} />
          <div className="applications__list">
            {data.failedInvites.map(item => (
              <div className="application-row" key={item.id}>
                <span className="application-row__icon" data-tone="danger" aria-hidden="true"><MailWarning /></span>
                <div className="application-row__text"><strong><bdi>{item.full_name}</bdi></strong><small><bdi>{item.email}</bdi></small></div>
                <Button size="sm" icon={<Send />} busy={retrying === item.id} disabled={!!retrying} onClick={() => void retry(item)}>{tr(lang, 'أعد الإرسال', 'Resend')}</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data && (data.pending.length ? (
        <div className="applications__list">
          {data.pending.map(item => (
            <button type="button" className="application-row application-row--link" key={item.id} onClick={() => { setSuggested(null); setReviewing(item); }}>
              <span className="application-row__icon" aria-hidden="true"><FileText /></span>
              <span className="application-row__text">
                <strong><bdi>{item.full_name}</bdi></strong>
                <small dir="auto">{[item.title, item.organization].filter(Boolean).join(' · ')}</small>
                <span className="application-row__reason" dir="auto">{item.join_reason}</span>
              </span>
              <span className="application-row__meta">
                <Badge tone="info">{accountTypes[item.account_type]?.[lang] ?? item.account_type}</Badge>
                <small>{day(item.created_at, lang)}</small>
              </span>
            </button>
          ))}
        </div>
      ) : <EmptyState icon={<Inbox />} title={tr(lang, 'لا طلبات انضمام جديدة', 'No new join requests')}
        description={tr(lang, 'الطلبات من صفحة «انضم لنا» تظهر هنا للمراجعة.', 'Requests from the apply page appear here for review.')} />)}

      <ReviewDialog lang={lang} application={reviewing} suggested={suggested} onClose={() => setReviewing(null)}
        onDecided={async text => { setNotice(text); await load(); }} />
    </div>
  );
}

function ReviewDialog({ lang, application, suggested, onClose, onDecided }: {
  lang: Lang; application: api.Application | null; suggested: 'approved' | 'rejected' | null; onClose: () => void;
  onDecided: (notice: { tone: 'success' | 'warning' | 'danger'; text: string }) => Promise<void>;
}) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setReason(''); setError(''); }, [application?.id]);
  if (!application) return null;
  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision); setError('');
    const result = await api.decideApplication(application.id, decision, decision === 'rejected' ? reason.trim() : undefined);
    setBusy(null);
    if (!result.ok) { setError(messageFor(result.error, lang)); return; }
    onClose();
    await onDecided(decision === 'rejected'
      ? { tone: 'success', text: tr(lang, `رُفض طلب ${application.full_name}.`, `${application.full_name}'s request was rejected.`) }
      : result.data.invitationStatus === 'failed'
        ? { tone: 'warning', text: tr(lang, 'قُبل الطلب لكن فشل إرسال الدعوة. تجده في «دعوات لم تصل».', 'Approved, but the invitation failed. It is listed under invitations that did not go out.') }
        : { tone: 'success', text: tr(lang, `قُبل ${application.full_name} وأُرسلت له دعوة.`, `${application.full_name} was approved and invited.`) });
  };
  const openCv = async () => {
    if (!application.cv_path) return;
    const result = await api.openCv(application.cv_path);
    if (!result.ok || !result.data) setError(tr(lang, 'تعذّر فتح السيرة الذاتية.', 'Could not open the CV.'));
  };
  const facts: Array<[string, React.ReactNode]> = [
    [tr(lang, 'البريد', 'Email'), <bdi>{application.email}</bdi>],
    [tr(lang, 'الهاتف', 'Phone'), <bdi dir="ltr">{application.phone}</bdi>],
    [tr(lang, 'الجهة', 'Organisation'), application.organization],
    [tr(lang, 'المسمى', 'Title'), application.title],
    [tr(lang, 'نوع الحساب', 'Account type'), accountTypes[application.account_type]?.[lang] ?? application.account_type],
    [tr(lang, 'المشروع أو البحث', 'Project or research'), application.project_or_research || '—'],
  ];
  return (
    <Dialog open size="lg" onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={application.full_name}
      description={tr(lang, `قُدّم في ${day(application.created_at, lang)}`, `Submitted ${day(application.created_at, lang)}`)}>
      {error && <InlineAlert>{error}</InlineAlert>}
      {suggested && (
        <InlineAlert tone="info">
          {tr(lang,
            `فُتح هذا الطلب من رابط ${suggested === 'approved' ? 'القبول' : 'الرفض'} في البريد. راجع البيانات ثم أكّد القرار بنفسك.`,
            `Opened from the email ${suggested === 'approved' ? 'approval' : 'rejection'} link. Review it, then confirm yourself.`)}
        </InlineAlert>
      )}
      <dl className="application-facts">
        {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="application-links">
        {application.linkedin_url && <a href={application.linkedin_url} target="_blank" rel="noreferrer">LinkedIn <ExternalLink aria-hidden="true" /></a>}
        {application.github_url && <a href={application.github_url} target="_blank" rel="noreferrer">GitHub <ExternalLink aria-hidden="true" /></a>}
        {application.cv_path && <button type="button" onClick={() => void openCv()}>{tr(lang, 'السيرة الذاتية', 'CV')} <FileText aria-hidden="true" /></button>}
      </div>
      <section className="application-text">
        <h3>{tr(lang, 'لماذا يريد الانضمام', 'Why they want to join')}</h3>
        <p dir="auto">{application.join_reason}</p>
        {application.cover_letter && <><h3>{tr(lang, 'الرسالة التعريفية', 'Cover letter')}</h3><p dir="auto">{application.cover_letter}</p></>}
      </section>
      <Field label={tr(lang, 'سبب الرفض (داخلي)', 'Rejection reason (internal)')} hint={tr(lang, 'مطلوب عند الرفض، ولا يُرسل للمتقدم.', 'Required to reject; never sent to the applicant.')} wide>
        <TextArea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} />
      </Field>
      <div className="application-actions">
        <Button variant="danger" busy={busy === 'rejected'} disabled={!!busy || !reason.trim()} onClick={() => void decide('rejected')}>{tr(lang, 'رفض الطلب', 'Reject')}</Button>
        <Button variant="primary" icon={<Send />} busy={busy === 'approved'} disabled={!!busy} onClick={() => void decide('approved')}>{tr(lang, 'قبول وإرسال دعوة', 'Approve and invite')}</Button>
      </div>
    </Dialog>
  );
}

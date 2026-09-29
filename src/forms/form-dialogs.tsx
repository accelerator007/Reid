// The forms dialogs: templates, sharing (link, WhatsApp, QR), people and
// access, and a confirmation for anything that cannot be undone.
import React from 'react';
import { Copy, Download, ExternalLink, FileText, Link2, MessageCircle, Plus, Trash2, UserPlus } from 'lucide-react';
import reidLogo from '../../assets/img/reid-logo.svg';
import { messageFor } from '../db';
import { useSession } from '../shell';
import { Badge, Button, Dialog, EmptyState, InlineAlert, Select, Skeleton } from '../ui';
import * as api from './api';
import { copyText, useToast } from './forms-ui';
import { MAX_COLLABORATORS, SERIES, formLink, templateQuestionCount, templates, questionsLine, type Form, type Lang, type TemplateId } from './model';
import { downloadCanvas, drawQr } from './qr';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function ConfirmDialog({ lang, open, title, description, confirm, danger, onClose, onConfirm }: {
  lang: Lang; open: boolean; title: string; description: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={title} description={description}>
      <div className="fx-dialog-actions">
        <Button variant="ghost" onClick={onClose}>{tr(lang, 'إلغاء', 'Cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>{confirm}</Button>
      </div>
    </Dialog>
  );
}

export function TemplatesDialog({ lang, open, onClose, onCreated }: { lang: Lang; open: boolean; onClose: () => void; onCreated: (form: Form) => void }) {
  const { user } = useSession();
  const [busy, setBusy] = React.useState<TemplateId | null>(null);
  const [error, setError] = React.useState('');
  if (!open) return null;
  const create = async (id: TemplateId) => {
    if (!user) return;
    setBusy(id); setError('');
    const template = templates.find(item => item.id === id)!;
    const result = await api.createForm(user.id, { ...template.build(lang), theme: 'brand' });
    setBusy(null);
    if (!result.ok || !result.data) { setError(result.ok ? tr(lang, 'تعذّر إنشاء النموذج.', 'Could not create the form.') : messageFor(result.error, lang)); return; }
    onClose();
    onCreated(result.data);
  };
  return (
    <Dialog open size="lg" onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={tr(lang, 'نموذج جديد', 'New form')}
      description={tr(lang, 'ابدأ من قالب وعدّله كما تريد.', 'Start from a template and change anything.')}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="fx-templates">
        {templates.map(template => (
          <button key={template.id} type="button" className="fx-template" data-template={template.id} data-ripple disabled={!!busy} aria-busy={busy === template.id || undefined} onClick={() => void create(template.id)}>
            <span className="fx-template__art" aria-hidden="true">{template.id === 'blank' ? <Plus /> : <FileText />}</span>
            <strong>{template.label[lang]}</strong>
            <small>{template.hint[lang]}</small>
            <Badge>{template.id === 'blank' ? tr(lang, 'فارغ', 'Empty') : questionsLine(templateQuestionCount(template), lang)}</Badge>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function ShareDialog({ lang, form, onClose }: { lang: Lang; form: Pick<Form, 'id' | 'title'>; onClose: () => void }) {
  const toast = useToast();
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const link = formLink(form.id);
  const title = form.title || tr(lang, 'نموذج', 'Form');
  React.useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--brand-9').trim() || '#5b3fa6';
    const paint = (logo: HTMLImageElement | null) => drawQr(node, { text: link, title, subtitle: SERIES[lang], accent, ink: '#1c1530', logo, rtl: lang === 'ar' });
    paint(null);
    const logo = new Image();
    logo.onload = () => paint(logo);
    logo.src = reidLogo;
    // The Arabic face may still be loading; redraw once it is ready.
    void document.fonts?.ready.then(() => paint(logo.complete ? logo : null));
  }, [link, title, lang]);
  const copy = async () => toast((await copyText(link)) ? tr(lang, 'نُسخ الرابط.', 'Link copied.') : tr(lang, 'تعذّر النسخ.', 'Could not copy.'), 'success');
  return (
    <Dialog open size="lg" onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={tr(lang, 'مشاركة النموذج', 'Share the form')} description={title}>
      <div className="fx-share">
        <div className="fx-share__link">
          <label className="fx-link-field">
            <Link2 aria-hidden="true" />
            <input readOnly value={link} dir="ltr" aria-label={tr(lang, 'رابط النموذج', 'Form link')} onFocus={event => event.currentTarget.select()} />
          </label>
          <div className="fx-share__buttons">
            <Button variant="primary" icon={<Copy />} data-ripple onClick={() => void copy()}>{tr(lang, 'نسخ الرابط', 'Copy link')}</Button>
            <a className="ui-button ui-button--secondary ui-button--md" href={whatsapp(`${title}\n${link}`)} target="_blank" rel="noreferrer">
              <span className="ui-button__icon" aria-hidden="true"><MessageCircle /></span><span>{tr(lang, 'واتساب', 'WhatsApp')}</span>
            </a>
            <a className="ui-button ui-button--ghost ui-button--md" href={link} target="_blank" rel="noreferrer">
              <span className="ui-button__icon" aria-hidden="true"><ExternalLink /></span><span>{tr(lang, 'فتح', 'Open')}</span>
            </a>
          </div>
        </div>
        <figure className="fx-qr">
          <canvas ref={canvas} role="img" aria-label={tr(lang, `رمز QR لنموذج ${title}`, `QR code for ${title}`)} />
          <Button icon={<Download />} onClick={() => canvas.current && void downloadCanvas(canvas.current, `qr-${form.id.slice(0, 8)}.png`)}>{tr(lang, 'تحميل الصورة', 'Download PNG')}</Button>
        </figure>
      </div>
    </Dialog>
  );
}

export function AccessDialog({ lang, form, onClose }: { lang: Lang; form: Pick<Form, 'id' | 'title' | 'owner_id'>; onClose: () => void }) {
  const toast = useToast();
  const [people, setPeople] = React.useState<api.Person[] | null>(null);
  const [rows, setRows] = React.useState<api.Collaborator[] | null>(null);
  const [pick, setPick] = React.useState('');
  const [role, setRole] = React.useState<'editor' | 'viewer'>('editor');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const [admins, collaborators] = await Promise.all([api.loadAdmins(), api.loadCollaborators(form.id)]);
    if (admins.ok) setPeople(admins.data); else setError(messageFor(admins.error, lang));
    if (collaborators.ok) setRows(collaborators.data); else setError(messageFor(collaborators.error, lang));
  }, [form.id, lang]);
  React.useEffect(() => { void load(); }, [load]);
  const byId = new Map((people ?? []).map(person => [person.id, person]));
  const owner = byId.get(form.owner_id);
  const available = (people ?? []).filter(person => person.id !== form.owner_id && !rows?.some(row => row.user_id === person.id));
  const invite = `${location.origin}/forms/${form.id}`;
  const add = async () => {
    if (!pick) return;
    if ((rows?.length ?? 0) >= MAX_COLLABORATORS) { setError(tr(lang, `الحد الأقصى ${MAX_COLLABORATORS} شخصًا.`, `At most ${MAX_COLLABORATORS} people.`)); return; }
    setBusy(true); setError('');
    const result = await api.addCollaborator(form.id, pick, role);
    setBusy(false);
    if (!result.ok) { setError(messageFor(result.error, lang)); return; }
    setPick('');
    toast(tr(lang, 'أُضيف. أرسل له رابط الدعوة.', 'Added. Send them the invite link.'));
    await load();
  };
  const change = async (userId: string, next: 'editor' | 'viewer') => {
    const result = await api.setCollaboratorRole(form.id, userId, next);
    if (!result.ok) setError(messageFor(result.error, lang)); else await load();
  };
  const remove = async (userId: string) => {
    const result = await api.removeCollaborator(form.id, userId);
    if (!result.ok) setError(messageFor(result.error, lang)); else { toast(tr(lang, 'أُزيل من النموذج.', 'Removed from the form.')); await load(); }
  };
  const nameOf = (person?: api.Person) => person?.full_name || person?.email || '—';
  return (
    <Dialog open size="lg" onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={tr(lang, 'الأشخاص والوصول', 'People and access')} description={form.title}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="fx-access-add">
        <Select value={pick} onChange={event => setPick(event.target.value)} aria-label={tr(lang, 'اختر إداريًا', 'Choose an administrator')} disabled={!people}>
          <option value="">{available.length ? tr(lang, 'اختر إداريًا…', 'Choose an administrator…') : tr(lang, 'لا يوجد إداريون آخرون', 'No other administrators')}</option>
          {available.map(person => <option key={person.id} value={person.id}>{nameOf(person)}{person.email ? ` — ${person.email}` : ''}</option>)}
        </Select>
        <Select value={role} onChange={event => setRole(event.target.value as 'editor' | 'viewer')} aria-label={tr(lang, 'الدور', 'Role')}>
          <option value="editor">{tr(lang, 'محرر', 'Editor')}</option>
          <option value="viewer">{tr(lang, 'مشاهد', 'Viewer')}</option>
        </Select>
        <Button variant="primary" icon={<UserPlus />} busy={busy} disabled={!pick} onClick={() => void add()}>{tr(lang, 'إضافة', 'Add')}</Button>
      </div>
      <p className="fx-muted">{tr(lang, 'المحرر يعدّل الأسئلة والإعدادات ويرى الردود ويحذفها. المشاهد يرى الردود ويصدّرها فقط. النماذج للإداريين فقط.', 'Editors change questions and settings and can read and delete responses. Viewers read and export responses. Forms are for administrators only.')}</p>
      {!rows || !people ? <Skeleton lines={3} /> : (
        <ul className="fx-people">
          <li>
            <span className="fx-people__avatar" aria-hidden="true">{Array.from(nameOf(owner))[0]}</span>
            <span className="fx-people__who"><strong><bdi>{nameOf(owner)}</bdi></strong><small><bdi>{owner?.email}</bdi></small></span>
            <Badge tone="brand">{tr(lang, 'المالك', 'Owner')}</Badge>
          </li>
          {rows.map(row => {
            const person = byId.get(row.user_id);
            return (
              <li key={row.user_id}>
                <span className="fx-people__avatar" aria-hidden="true">{Array.from(nameOf(person))[0]}</span>
                <span className="fx-people__who"><strong><bdi>{nameOf(person)}</bdi></strong><small><bdi>{person?.email}</bdi></small></span>
                <Select value={row.role} onChange={event => void change(row.user_id, event.target.value as 'editor' | 'viewer')} aria-label={tr(lang, 'الدور', 'Role')}>
                  <option value="editor">{tr(lang, 'محرر', 'Editor')}</option>
                  <option value="viewer">{tr(lang, 'مشاهد', 'Viewer')}</option>
                </Select>
                <button type="button" className="fx-icon-button" aria-label={tr(lang, 'إزالة', 'Remove')} title={tr(lang, 'إزالة', 'Remove')} onClick={() => void remove(row.user_id)}><Trash2 /></button>
              </li>
            );
          })}
          {!rows.length && <li className="fx-people__empty"><EmptyState icon={<UserPlus />} title={tr(lang, 'النموذج خاص بك حاليًا', 'Only you have access')} /></li>}
        </ul>
      )}
      <div className="fx-invite">
        <strong>{tr(lang, 'رابط الدعوة', 'Invite link')}</strong>
        <small>{tr(lang, 'بعد تسجيل الدخول يعود الشخص إلى هذا النموذج مباشرة.', 'After signing in they come straight back to this form.')}</small>
        <div className="fx-share__buttons">
          <Button icon={<Copy />} onClick={async () => toast((await copyText(invite)) ? tr(lang, 'نُسخ رابط الدعوة.', 'Invite link copied.') : tr(lang, 'تعذّر النسخ.', 'Could not copy.'))}>{tr(lang, 'نسخ', 'Copy')}</Button>
          <a className="ui-button ui-button--secondary ui-button--md" href={whatsapp(tr(lang, `أضفتك إلى نموذج «${form.title}» في ريّد:\n${invite}`, `I added you to the form “${form.title}” on Reid:\n${invite}`))} target="_blank" rel="noreferrer">
            <span className="ui-button__icon" aria-hidden="true"><MessageCircle /></span><span>{tr(lang, 'إرسال بواتساب', 'Send on WhatsApp')}</span>
          </a>
        </div>
      </div>
    </Dialog>
  );
}

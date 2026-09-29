// A form's settings: accepting responses, one per device, closing on a date,
// the confirmation message, the link, access, and deleting the form.
import React from 'react';
import { Copy, ExternalLink, Link2, Trash2, UsersRound } from 'lucide-react';
import { messageFor } from '../db';
import { Button, Field, TextArea } from '../ui';
import * as api from './api';
import { ConfirmDialog } from './form-dialogs';
import { copyText, Switch, useToast } from './forms-ui';
import { formLink, isOpen, type Form, type FormRole, type Lang } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

/** datetime-local works in local wall time; the database stores an instant. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function FormSettings({ lang, form, role, update, openAccess, deleted }: {
  lang: Lang; form: Form; role: FormRole; update: (patch: api.FormFields) => void; openAccess: () => void; deleted: () => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const link = formLink(form.id);
  const closedByDate = form.accepting && !isOpen(form);
  return (
    <div className="settings">
      <section className="settings-card">
        <h2>{tr(lang, 'الردود', 'Responses')}</h2>
        <Switch checked={form.accepting} onChange={accepting => update({ accepting })} label={tr(lang, 'استقبال الردود', 'Accepting responses')}
          description={closedByDate ? tr(lang, 'مفعّل، لكن موعد الإغلاق مرّ فالنموذج مغلق.', 'On, but the closing date has passed so the form is closed.') : tr(lang, 'عند الإيقاف يرى المستجيب أن النموذج مغلق.', 'When off, respondents see that the form is closed.')} />
        <Switch checked={form.one_per_device} onChange={one_per_device => update({ one_per_device })} label={tr(lang, 'رد واحد لكل جهاز', 'One response per device')}
          description={tr(lang, 'يمنع الإرسال مرتين من نفس المتصفح، ويُتحقق منه في الخادم.', 'Stops a second response from the same browser; checked on the server.')} />
        <div className="settings-row">
          <Field label={tr(lang, 'إغلاق تلقائي في', 'Close automatically at')} hint={tr(lang, 'اتركه فارغًا ليبقى مفتوحًا. بتوقيت جهازك.', 'Leave empty to stay open. In your device’s time.')}>
            <input className="ui-input" type="datetime-local" value={toLocalInput(form.close_at)}
              onChange={event => update({ close_at: event.target.value ? new Date(event.target.value).toISOString() : null })} />
          </Field>
          {form.close_at && <Button variant="ghost" size="sm" onClick={() => update({ close_at: null })}>{tr(lang, 'بدون موعد', 'No date')}</Button>}
        </div>
        <Field label={tr(lang, 'رسالة التأكيد', 'Confirmation message')} hint={tr(lang, 'تظهر بعد الإرسال.', 'Shown after sending.')} wide>
          <TextArea value={form.confirm_message} maxLength={1000} dir="auto" onChange={event => update({ confirm_message: event.target.value })}
            placeholder={tr(lang, 'شكرًا لك! وصلنا ردك.', 'Thank you! We received your response.')} />
        </Field>
      </section>

      <section className="settings-card">
        <h2>{tr(lang, 'الرابط', 'Link')}</h2>
        <label className="fx-link-field"><Link2 aria-hidden="true" /><input readOnly value={link} dir="ltr" aria-label={tr(lang, 'رابط النموذج', 'Form link')} onFocus={event => event.currentTarget.select()} /></label>
        <div className="fx-share__buttons">
          <Button icon={<Copy />} onClick={async () => toast((await copyText(link)) ? tr(lang, 'نُسخ الرابط.', 'Link copied.') : tr(lang, 'تعذّر النسخ.', 'Could not copy.'))}>{tr(lang, 'نسخ', 'Copy')}</Button>
          <a className="ui-button ui-button--ghost ui-button--md" href={link} target="_blank" rel="noreferrer"><span className="ui-button__icon" aria-hidden="true"><ExternalLink /></span><span>{tr(lang, 'فتح', 'Open')}</span></a>
          {role === 'owner' && <Button icon={<UsersRound />} onClick={openAccess}>{tr(lang, 'الأشخاص والوصول', 'People and access')}</Button>}
        </div>
      </section>

      {role === 'owner' && (
        <section className="settings-card settings-card--danger">
          <h2>{tr(lang, 'حذف النموذج', 'Delete the form')}</h2>
          <p>{tr(lang, 'يحذف النموذج وكل ردوده وملفاته نهائيًا.', 'Deletes the form with every response and file, permanently.')}</p>
          <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirming(true)}>{tr(lang, 'حذف النموذج', 'Delete form')}</Button>
        </section>
      )}
      <ConfirmDialog lang={lang} open={confirming} danger title={tr(lang, 'حذف النموذج؟', 'Delete this form?')}
        description={tr(lang, 'لا يمكن التراجع. صدّر الردود أولًا إن احتجتها.', 'This cannot be undone. Export the responses first if you need them.')}
        confirm={tr(lang, 'حذف نهائي', 'Delete permanently')} onClose={() => setConfirming(false)}
        onConfirm={async () => {
          const result = await api.deleteForm(form.id);
          if (!result.ok) { toast(messageFor(result.error, lang), 'danger'); return; }
          toast(tr(lang, 'حُذف النموذج.', 'The form was deleted.'));
          deleted();
        }} />
    </div>
  );
}

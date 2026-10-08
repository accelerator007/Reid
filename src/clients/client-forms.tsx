// "Add" dialogs for the clients pages. Each reports its own error and closes
// only after the write succeeded.
import React from 'react';
import { messageFor, type Result } from '../db';
import { Dialog, Field, FormGrid, InlineAlert, Select, TextInput } from '../ui';
import { followUpTypes, leadStages, type Company, type Contact, type Deal, type Lang, type Lead } from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim() || null;

export type ClientDialog = 'company' | 'contact' | 'lead' | 'deal' | 'followUp' | null;

type Props = {
  lang: Lang; open: ClientDialog; onClose: () => void;
  companies: Company[]; contacts: Contact[]; leads: Lead[]; deals: Deal[];
  save: (kind: Exclude<ClientDialog, null>, fields: Record<string, string | number | null>) => Promise<Result<unknown>>;
};

const titles: Record<Exclude<ClientDialog, null>, { ar: string; en: string }> = {
  company: { ar: 'شركة جديدة', en: 'New company' },
  contact: { ar: 'جهة اتصال جديدة', en: 'New contact' },
  lead: { ar: 'فرصة جديدة', en: 'New lead' },
  deal: { ar: 'صفقة جديدة', en: 'New deal' },
  followUp: { ar: 'متابعة جديدة', en: 'New follow-up' },
};

export function ClientForms({ lang, open, onClose, companies, contacts, leads, deals, save }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (open) setError(''); }, [open]);
  if (!open) return null;

  const submit = async (data: FormData, form: HTMLFormElement) => {
    const fields: Record<string, string | number | null> = {};
    data.forEach((value, key) => { fields[key] = String(value).trim() || null; });
    if (open === 'lead') fields.probability = Number(fields.probability ?? 20);
    if (open === 'lead' && fields.next_follow_up_at) fields.next_follow_up_at = new Date(String(fields.next_follow_up_at)).toISOString();
    if (open === 'followUp') {
      const [kind, id] = String(fields.about ?? '').split(':');
      delete fields.about;
      if (kind && id) fields[`${kind}_id`] = id;
      if (fields.due_at) fields.due_at = new Date(String(fields.due_at)).toISOString();
    }
    setBusy(true);
    const result = await save(open, fields);
    setBusy(false);
    if (result.ok) { form.reset(); onClose(); } else setError(messageFor(result.error, lang));
  };

  const companyOptions = companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>);
  const contactOptions = contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>);

  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={titles[open][lang]}>
      {error && <InlineAlert>{error}</InlineAlert>}
      <FormGrid busy={busy} submit={tr(lang, 'حفظ', 'Save')} cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }} onSubmit={submit}>
        {open === 'company' && <>
          <Field label={tr(lang, 'اسم الشركة', 'Company name')} required wide><TextInput name="name" required maxLength={160} /></Field>
          <Field label={tr(lang, 'القطاع', 'Industry')}><TextInput name="industry" placeholder={tr(lang, 'صحة، تعليم، تجزئة…', 'Health, education, retail…')} /></Field>
          <Field label={tr(lang, 'الهاتف', 'Phone')}><TextInput name="phone" type="tel" dir="ltr" /></Field>
          <Field label={tr(lang, 'البريد الإلكتروني', 'Email')} wide><TextInput name="email" type="email" dir="ltr" /></Field>
        </>}
        {open === 'contact' && <>
          <Field label={tr(lang, 'الاسم', 'Name')} required><TextInput name="name" required maxLength={120} /></Field>
          <Field label={tr(lang, 'المسمى الوظيفي', 'Position')}><TextInput name="position" /></Field>
          <Field label={tr(lang, 'الشركة', 'Company')}><Select name="company_id" defaultValue=""><option value="">{tr(lang, 'بدون شركة', 'No company')}</option>{companyOptions}</Select></Field>
          <Field label={tr(lang, 'الهاتف', 'Phone')}><TextInput name="phone" type="tel" dir="ltr" /></Field>
          <Field label={tr(lang, 'البريد الإلكتروني', 'Email')} wide><TextInput name="email" type="email" dir="ltr" /></Field>
        </>}
        {open === 'lead' && <>
          <Field label={tr(lang, 'الفرصة', 'Lead')} required wide><TextInput name="title" required maxLength={200} placeholder={tr(lang, 'مثال: نظام حجز لعيادات الأمل', 'e.g. Booking system for Al Amal clinics')} /></Field>
          <Field label={tr(lang, 'الشركة', 'Company')}><Select name="company_id" defaultValue=""><option value="">—</option>{companyOptions}</Select></Field>
          <Field label={tr(lang, 'جهة الاتصال', 'Contact')}><Select name="contact_id" defaultValue=""><option value="">—</option>{contactOptions}</Select></Field>
          <Field label={tr(lang, 'المرحلة', 'Stage')}><Select name="stage" defaultValue="new">{Object.entries(leadStages).filter(([key]) => !['converted', 'lost'].includes(key)).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}</Select></Field>
          <Field label={tr(lang, 'احتمال النجاح ٪', 'Likelihood %')}><TextInput name="probability" type="number" min={0} max={100} defaultValue={20} /></Field>
          <Field label={tr(lang, 'المصدر', 'Source')}><TextInput name="source" placeholder={tr(lang, 'واتساب، معرض، توصية…', 'WhatsApp, event, referral…')} /></Field>
          <Field label={tr(lang, 'المتابعة القادمة', 'Next follow-up')}><TextInput name="next_follow_up_at" type="datetime-local" /></Field>
        </>}
        {open === 'deal' && <>
          <Field label={tr(lang, 'الصفقة', 'Deal')} required wide><TextInput name="title" required maxLength={200} /></Field>
          <Field label={tr(lang, 'الشركة', 'Company')}><Select name="company_id" defaultValue=""><option value="">—</option>{companyOptions}</Select></Field>
          <Field label={tr(lang, 'جهة الاتصال', 'Contact')}><Select name="contact_id" defaultValue=""><option value="">—</option>{contactOptions}</Select></Field>
          <Field label={tr(lang, 'الإغلاق المتوقع', 'Expected close')}><TextInput name="expected_close_date" type="date" /></Field>
        </>}
        {open === 'followUp' && <>
          <Field label={tr(lang, 'الموضوع', 'Subject')} required wide><TextInput name="subject" required maxLength={200} /></Field>
          <Field label={tr(lang, 'النوع', 'Type')}><Select name="activity_type" defaultValue="call">{Object.entries(followUpTypes).map(([key, value]) => <option key={key} value={key}>{value[lang]}</option>)}</Select></Field>
          <Field label={tr(lang, 'الموعد', 'When')}><TextInput name="due_at" type="datetime-local" /></Field>
          <Field label={tr(lang, 'بخصوص', 'About')} required wide>
            <Select name="about" required defaultValue="">
              <option value="" disabled>{tr(lang, 'اختر شركة أو شخصًا أو فرصة…', 'Choose a company, person or lead…')}</option>
              {leads.length > 0 && <optgroup label={tr(lang, 'الفرص', 'Leads')}>{leads.map(lead => <option key={lead.id} value={`lead:${lead.id}`}>{lead.title}</option>)}</optgroup>}
              {deals.length > 0 && <optgroup label={tr(lang, 'الصفقات', 'Deals')}>{deals.map(deal => <option key={deal.id} value={`deal:${deal.id}`}>{deal.title}</option>)}</optgroup>}
              {companies.length > 0 && <optgroup label={tr(lang, 'الشركات', 'Companies')}>{companies.map(company => <option key={company.id} value={`company:${company.id}`}>{company.name}</option>)}</optgroup>}
              {contacts.length > 0 && <optgroup label={tr(lang, 'جهات الاتصال', 'Contacts')}>{contacts.map(contact => <option key={contact.id} value={`contact:${contact.id}`}>{contact.name}</option>)}</optgroup>}
            </Select>
          </Field>
        </>}
      </FormGrid>
    </Dialog>
  );
}

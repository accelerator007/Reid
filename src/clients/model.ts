// Clients (/crm): companies, contacts, leads, deals, follow-ups and executive
// reports. Reid runs without money, so nothing here carries a value.
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };
type Option = { label: Label; tone: Tone };
const option = (ar: string, en: string, tone: Tone): Option => ({ label: { ar, en }, tone });

export type Company = { id: string; name: string; industry: string | null; email: string | null; phone: string | null; status: string; owner_id: string | null };
export type Contact = { id: string; name: string; email: string | null; phone: string | null; position: string | null; company_id: string | null; stage: string; owner_id: string | null };
export type Lead = { id: string; title: string; stage: string; probability: number; next_follow_up_at: string | null; company_id: string | null; contact_id: string | null; owner_id: string | null };
export type Deal = { id: string; title: string; stage: string; expected_close_date: string | null; company_id: string | null; contact_id: string | null; owner_id: string | null };
export type FollowUp = {
  id: string; activity_type: string; subject: string; due_at: string | null; completed_at: string | null; created_at: string;
  company_id: string | null; contact_id: string | null; lead_id: string | null; deal_id: string | null;
};
export type Report = { id: string; period: string; period_start: string; period_end: string; metrics: Record<string, unknown>; generated_at: string; email_status: string };

export const leadStages: Record<string, Option> = {
  new: option('جديد', 'New', 'info'),
  qualified: option('مؤهَّل', 'Qualified', 'brand'),
  proposal: option('عرض مقدَّم', 'Proposal', 'accent'),
  negotiation: option('تفاوض', 'Negotiation', 'warning'),
  converted: option('تحوّل لعميل', 'Converted', 'success'),
  lost: option('خسرناه', 'Lost', 'neutral'),
};
export const dealStages: Record<string, Option> = {
  discovery: option('استكشاف', 'Discovery', 'info'),
  proposal: option('عرض مقدَّم', 'Proposal', 'accent'),
  negotiation: option('تفاوض', 'Negotiation', 'warning'),
  won: option('تمت', 'Won', 'success'),
  lost: option('لم تتم', 'Lost', 'neutral'),
};
export const companyStatuses: Record<string, Option> = {
  prospect: option('محتمل', 'Prospect', 'info'),
  active: option('عميل نشط', 'Active client', 'success'),
  inactive: option('غير نشط', 'Inactive', 'neutral'),
};
export const contactStages: Record<string, Option> = {
  lead: option('محتمل', 'Prospect', 'info'),
  customer: option('عميل', 'Client', 'success'),
};
export const followUpTypes: Record<string, Label> = {
  call: { ar: 'اتصال', en: 'Call' },
  email: { ar: 'بريد', en: 'Email' },
  meeting: { ar: 'اجتماع', en: 'Meeting' },
  task: { ar: 'مهمة', en: 'Task' },
  note: { ar: 'ملاحظة', en: 'Note' },
};

export const optionOf = (table: Record<string, Option>, value: string): Option =>
  table[value] ?? { label: { ar: value, en: value }, tone: 'neutral' };

/** The pipeline shows open stages only; converted and lost leads leave it. */
export const pipelineStages = ['new', 'qualified', 'proposal', 'negotiation'] as const;

export const isOpenLead = (lead: Lead) => !['converted', 'lost'].includes(lead.stage);
export const isOpenDeal = (deal: Deal) => !['won', 'lost'].includes(deal.stage);

/** Open leads whose next follow-up time has passed — the Sales to-do list. */
export function followUpsDue(leads: Lead[], now: Date): Lead[] {
  return leads
    .filter(lead => isOpenLead(lead) && lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= now)
    .sort((a, b) => (a.next_follow_up_at ?? '').localeCompare(b.next_follow_up_at ?? ''));
}

/** Open deals expected to close within the next `days` days (inclusive). */
export function closingSoon(deals: Deal[], now: Date, days = 14): Deal[] {
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now));
  const limit = new Date(today.getTime() + days * 86_400_000);
  return deals
    .filter(deal => isOpenDeal(deal) && deal.expected_close_date)
    .filter(deal => { const close = new Date(deal.expected_close_date!); return close >= today && close <= limit; })
    .sort((a, b) => a.expected_close_date!.localeCompare(b.expected_close_date!));
}

/** What a follow-up is about, e.g. "company:<id>", for its link and label. */
export function followUpTarget(item: FollowUp): { kind: 'company' | 'contact' | 'lead' | 'deal'; id: string } | null {
  if (item.lead_id) return { kind: 'lead', id: item.lead_id };
  if (item.deal_id) return { kind: 'deal', id: item.deal_id };
  if (item.contact_id) return { kind: 'contact', id: item.contact_id };
  if (item.company_id) return { kind: 'company', id: item.company_id };
  return null;
}

// The metric keys public.generate_executive_report writes.
export const reportMetricLabels: Record<string, Label> = {
  active_projects: { ar: 'مشاريع نشطة', en: 'Active projects' },
  open_tasks: { ar: 'مهام مفتوحة', en: 'Open tasks' },
  employees: { ar: 'موظفون', en: 'Employees' },
  new_leads: { ar: 'فرص جديدة', en: 'New leads' },
  open_deals: { ar: 'صفقات مفتوحة', en: 'Open deals' },
  won_deals: { ar: 'صفقات تمت', en: 'Deals won' },
  pending_applications: { ar: 'طلبات انضمام معلّقة', en: 'Pending applications' },
  agent_failures: { ar: 'تعثّر الوكلاء', en: 'Agent failures' },
};

/** Only numeric report metrics are shown; unknown keys keep their raw name. */
export function reportFigures(report: Report, lang: Lang): { key: string; label: string; value: number }[] {
  return Object.entries(report.metrics ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, value]) => ({ key, label: reportMetricLabels[key]?.[lang] ?? key.replace(/_/g, ' '), value }));
}

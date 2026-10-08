// /crm — the client pipeline without money: leads by stage, deals, companies,
// people, follow-ups and the executive reports.
import React from 'react';
import type { User } from '@supabase/supabase-js';
import {
  BellRing, Building2, CalendarClock, Check, ChartColumn, Contact as ContactIcon, FileBarChart, Handshake, Kanban, Mail, Phone,
  Plus, Search, Target, X,
} from 'lucide-react';
import { messageFor, type AppError, type Result } from '../db';
import { Badge, Button, Card, EmptyState, InlineAlert, ListRow, SectionHeader, Select, Skeleton, StatCard, TabPanel, Tabs, type TabItem } from '../ui';
import * as api from './api';
import { ClientForms, type ClientDialog } from './client-forms';
import {
  closingSoon, companyStatuses, contactStages, dealStages, followUpTarget, followUpTypes, followUpsDue, isOpenDeal, isOpenLead,
  leadStages, optionOf, pipelineStages, reportFigures, type Lang, type Lead,
} from './model';
import { arabicCount } from '../owner-overview.model';
import './clients.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'pipeline' | 'leads' | 'deals' | 'companies' | 'contacts' | 'followUps' | 'reports';
const addFor: Partial<Record<Tab, Exclude<ClientDialog, null>>> = {
  pipeline: 'lead', leads: 'lead', deals: 'deal', companies: 'company', contacts: 'contact', followUps: 'followUp',
};
const addLabel: Record<Exclude<ClientDialog, null>, { ar: string; en: string }> = {
  lead: { ar: 'فرصة جديدة', en: 'New lead' }, deal: { ar: 'صفقة جديدة', en: 'New deal' }, company: { ar: 'شركة جديدة', en: 'New company' },
  contact: { ar: 'جهة اتصال', en: 'New contact' }, followUp: { ar: 'متابعة جديدة', en: 'New follow-up' },
};

export function CrmWorkspace({ lang, user }: { lang: Lang; user: User }) {
  const [data, setData] = React.useState<api.ClientsData | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<Tab>('pipeline');
  const [dialog, setDialog] = React.useState<ClientDialog>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await api.loadClients();
    if (result.data) setData(result.data);
    setError(result.error);
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const act = async (write: Promise<Result<unknown>>) => {
    const result = await write;
    if (!result.ok) setError(result.error);
    await load();
    return result;
  };

  const now = new Date();
  const companyName = (id: string | null) => data?.companies.find(company => company.id === id)?.name;
  const due = data ? followUpsDue(data.leads, now) : [];
  const soon = data ? closingSoon(data.deals, now) : [];
  const openFollowUps = data?.followUps.filter(item => !item.completed_at) ?? [];
  const match = (...values: Array<string | null | undefined>) => !query.trim() || values.some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const dateText = (value: string | null, withTime = false) => value
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Muscat' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value))
    : '—';

  const tabs: TabItem<Tab>[] = [
    { id: 'pipeline', label: tr(lang, 'المسار', 'Pipeline'), icon: <Kanban /> },
    { id: 'leads', label: tr(lang, 'الفرص', 'Leads'), icon: <Target />, count: data?.leads.filter(isOpenLead).length },
    { id: 'deals', label: tr(lang, 'الصفقات', 'Deals'), icon: <Handshake />, count: data?.deals.filter(isOpenDeal).length },
    { id: 'companies', label: tr(lang, 'الشركات', 'Companies'), icon: <Building2 />, count: data?.companies.length },
    { id: 'contacts', label: tr(lang, 'جهات الاتصال', 'Contacts'), icon: <ContactIcon />, count: data?.contacts.length },
    { id: 'followUps', label: tr(lang, 'المتابعات', 'Follow-ups'), icon: <BellRing />, count: openFollowUps.length },
    { id: 'reports', label: tr(lang, 'التقارير', 'Reports'), icon: <FileBarChart /> },
  ];
  const adding = addFor[tab];

  return (
    <main className="clients">
      <div className="clients-head">
        <div>
          <h1>{tr(lang, 'العملاء', 'Clients')}</h1>
          <p>{tr(lang, 'الفرص والصفقات والمتابعات في مسار واحد واضح.', 'Leads, deals and follow-ups in one clear pipeline.')}</p>
        </div>
        {adding && <Button variant="primary" icon={<Plus />} onClick={() => setDialog(adding)}>{addLabel[adding][lang]}</Button>}
      </div>

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'تحديث', 'Refresh')}</Button>}>{messageFor(error, lang)}</InlineAlert>}

      <section className="clients-stats" aria-label={tr(lang, 'مؤشرات العملاء', 'Client indicators')}>
        <StatCard icon={<Target />} tone="brand" loading={!data} label={tr(lang, 'فرص مفتوحة', 'Open leads')} value={data?.leads.filter(isOpenLead).length ?? 0} onOpen={() => setTab('leads')} />
        <StatCard icon={<BellRing />} tone={due.length ? 'danger' : 'neutral'} loading={!data} label={tr(lang, 'متابعات مستحقة', 'Follow-ups due')} value={due.length}
          hint={due.length ? tr(lang, 'اتصل بهم اليوم', 'Call them today') : tr(lang, 'لا شيء متأخر', 'Nothing late')} onOpen={() => setTab('pipeline')} />
        <StatCard icon={<Handshake />} tone="accent" loading={!data} label={tr(lang, 'صفقات مفتوحة', 'Open deals')} value={data?.deals.filter(isOpenDeal).length ?? 0} onOpen={() => setTab('deals')} />
        <StatCard icon={<Check />} tone="success" loading={!data} label={tr(lang, 'صفقات تمت', 'Deals won')} value={data?.deals.filter(deal => deal.stage === 'won').length ?? 0} onOpen={() => setTab('deals')} />
      </section>

      <Tabs items={tabs} value={tab} onChange={value => { setTab(value); setQuery(''); }} label={tr(lang, 'أقسام العملاء', 'Client sections')} dir={dir} />
      <TabPanel id={tab}>
        {!data && !error && <Skeleton lines={6} />}

        {data && tab === 'pipeline' && (
          <div className="clients-pipeline">
            <div className="pipeline">
              {pipelineStages.map(stage => {
                const cards = data.leads.filter(lead => lead.stage === stage);
                const meta = optionOf(leadStages, stage);
                return (
                  <section className="pipeline__column" key={stage} aria-label={meta.label[lang]}>
                    <div className={`pipeline__head ui-tone--${meta.tone}`}><span />{meta.label[lang]}<b>{cards.length}</b></div>
                    {cards.map(lead => <LeadCard key={lead.id} lang={lang} lead={lead} company={companyName(lead.company_id)} now={now} dateText={dateText}
                      move={stageValue => void act(api.setLeadStage(lead.id, stageValue))} />)}
                    {!cards.length && <p className="pipeline__empty">{tr(lang, 'لا فرص هنا', 'No leads here')}</p>}
                  </section>
                );
              })}
            </div>
            <div className="clients-aside">
              <Card>
                <SectionHeader title={tr(lang, 'اتصل اليوم', 'Call today')} action={due.length ? <Badge tone="danger" dot>{due.length}</Badge> : undefined} />
                {due.length ? <div className="clients-list">{due.slice(0, 6).map(lead => (
                  <ListRow key={lead.id} dir={dir} icon={<Phone />} tone="danger" title={lead.title}
                    description={`${companyName(lead.company_id) ?? '—'} · ${dateText(lead.next_follow_up_at, true)}`} />
                ))}</div> : <p className="clients-muted">{tr(lang, 'لا متابعات متأخرة.', 'No overdue follow-ups.')}</p>}
              </Card>
              <Card>
                <SectionHeader title={tr(lang, 'صفقات تُغلق قريبًا', 'Closing soon')} />
                {soon.length ? <div className="clients-list">{soon.map(deal => (
                  <ListRow key={deal.id} dir={dir} icon={<Handshake />} tone="accent" title={deal.title}
                    description={`${companyName(deal.company_id) ?? '—'} · ${dateText(deal.expected_close_date)}`}
                    meta={<Badge tone={optionOf(dealStages, deal.stage).tone}>{optionOf(dealStages, deal.stage).label[lang]}</Badge>} />
                ))}</div> : <p className="clients-muted">{tr(lang, 'لا صفقات خلال أسبوعين.', 'Nothing in the next two weeks.')}</p>}
              </Card>
            </div>
          </div>
        )}

        {data && tab !== 'pipeline' && tab !== 'reports' && (
          <label className="clients-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(lang, 'ابحث…', 'Search…')} aria-label={tr(lang, 'بحث', 'Search')} />
            {query && <button type="button" onClick={() => setQuery('')} aria-label={tr(lang, 'مسح', 'Clear')}><X /></button>}
          </label>
        )}

        {data && tab === 'leads' && (
          <Rows empty={<EmptyState icon={<Target />} title={tr(lang, 'لا توجد فرص', 'No leads')} description={tr(lang, 'كل عميل محتمل يبدأ هنا.', 'Every prospect starts here.')} />}>
            {data.leads.filter(lead => match(lead.title, companyName(lead.company_id))).map(lead => (
              <div className="clients-row" key={lead.id}>
                <ListRow dir={dir} icon={<Target />} tone={optionOf(leadStages, lead.stage).tone} title={lead.title}
                  description={`${companyName(lead.company_id) ?? tr(lang, 'بدون شركة', 'No company')} · ${lead.probability}٪${lead.next_follow_up_at ? ` · ${tr(lang, 'متابعة', 'Follow up')} ${dateText(lead.next_follow_up_at, true)}` : ''}`} />
                <Select className="clients-stage" value={lead.stage} aria-label={tr(lang, 'المرحلة', 'Stage')} onChange={event => void act(api.setLeadStage(lead.id, event.target.value))}>
                  {Object.entries(leadStages).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}
                </Select>
              </div>
            ))}
          </Rows>
        )}

        {data && tab === 'deals' && (
          <Rows empty={<EmptyState icon={<Handshake />} title={tr(lang, 'لا توجد صفقات', 'No deals')} />}>
            {data.deals.filter(deal => match(deal.title, companyName(deal.company_id))).map(deal => (
              <div className="clients-row" key={deal.id}>
                <ListRow dir={dir} icon={<Handshake />} tone={optionOf(dealStages, deal.stage).tone} title={deal.title}
                  description={`${companyName(deal.company_id) ?? '—'} · ${tr(lang, 'الإغلاق المتوقع', 'Expected close')} ${dateText(deal.expected_close_date)}`} />
                <Select className="clients-stage" value={deal.stage} aria-label={tr(lang, 'المرحلة', 'Stage')} onChange={event => void act(api.setDealStage(deal.id, event.target.value))}>
                  {Object.entries(dealStages).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}
                </Select>
              </div>
            ))}
          </Rows>
        )}

        {data && tab === 'companies' && (
          <Rows grid empty={<EmptyState icon={<Building2 />} title={tr(lang, 'لا توجد شركات', 'No companies')} />}>
            {data.companies.filter(company => match(company.name, company.industry, company.email)).map(company => {
              const status = optionOf(companyStatuses, company.status);
              const people = data.contacts.filter(contact => contact.company_id === company.id).length;
              const open = data.leads.filter(lead => lead.company_id === company.id && isOpenLead(lead)).length;
              return (
                <article className="company-card" key={company.id}>
                  <div className="company-card__top"><span className="company-card__mark" aria-hidden="true">{company.name.slice(0, 1)}</span><Badge tone={status.tone}>{status.label[lang]}</Badge></div>
                  <strong>{company.name}</strong>
                  <small>{company.industry || tr(lang, 'قطاع غير محدد', 'Industry not set')}</small>
                  <div className="company-card__links">
                    {company.phone && <a href={`tel:${company.phone}`} dir="ltr"><Phone aria-hidden="true" />{company.phone}</a>}
                    {company.email && <a href={`mailto:${company.email}`} dir="ltr"><Mail aria-hidden="true" />{company.email}</a>}
                  </div>
                  <div className="company-card__foot">
                    <span>{tr(lang, people ? arabicCount(people, { one: 'جهة اتصال واحدة', two: 'جهتا اتصال', few: 'جهات اتصال', many: 'جهة اتصال' }) : 'لا جهات اتصال', `${people} contacts`)}</span>
                    <span>{tr(lang, open ? arabicCount(open, { one: 'فرصة مفتوحة', two: 'فرصتان مفتوحتان', few: 'فرص مفتوحة', many: 'فرصة مفتوحة' }) : 'لا فرص مفتوحة', `${open} open leads`)}</span>
                  </div>
                </article>
              );
            })}
          </Rows>
        )}

        {data && tab === 'contacts' && (
          <Rows empty={<EmptyState icon={<ContactIcon />} title={tr(lang, 'لا توجد جهات اتصال', 'No contacts')} />}>
            {data.contacts.filter(contact => match(contact.name, contact.email, contact.position, companyName(contact.company_id))).map(contact => (
              <div className="clients-row" key={contact.id}>
                <ListRow dir={dir} icon={<span className="contact-initial">{contact.name.slice(0, 1)}</span>} tone="accent" title={contact.name}
                  description={[contact.position, companyName(contact.company_id)].filter(Boolean).join(' · ') || '—'}
                  meta={<Badge tone={optionOf(contactStages, contact.stage).tone}>{optionOf(contactStages, contact.stage).label[lang]}</Badge>} />
                <div className="contact-actions">
                  {contact.phone && <a className="ui-icon-button" href={`tel:${contact.phone}`} aria-label={tr(lang, `اتصال بـ ${contact.name}`, `Call ${contact.name}`)}><Phone /></a>}
                  {contact.email && <a className="ui-icon-button" href={`mailto:${contact.email}`} aria-label={tr(lang, `مراسلة ${contact.name}`, `Email ${contact.name}`)}><Mail /></a>}
                </div>
              </div>
            ))}
          </Rows>
        )}

        {data && tab === 'followUps' && (
          <Rows empty={<EmptyState icon={<BellRing />} title={tr(lang, 'لا توجد متابعات', 'No follow-ups')} />}>
            {data.followUps.filter(item => match(item.subject)).map(item => {
              const target = followUpTarget(item);
              const about = !target ? undefined
                : target.kind === 'lead' ? data.leads.find(row => row.id === target.id)?.title
                : target.kind === 'deal' ? data.deals.find(row => row.id === target.id)?.title
                : target.kind === 'company' ? data.companies.find(row => row.id === target.id)?.name
                : data.contacts.find(row => row.id === target.id)?.name;
              const late = !item.completed_at && item.due_at && new Date(item.due_at) < now;
              return (
                <div className="clients-row followup" key={item.id} data-done={!!item.completed_at} data-late={!!late}>
                  <button type="button" className="followup__check" onClick={() => void act(api.completeFollowUp(item.id, !item.completed_at))}
                    aria-pressed={!!item.completed_at} aria-label={item.completed_at ? tr(lang, 'إلغاء الإنجاز', 'Mark not done') : tr(lang, 'تم', 'Mark done')}>
                    <Check aria-hidden="true" />
                  </button>
                  <div className="followup__body">
                    <strong>{item.subject}</strong>
                    <small>{followUpTypes[item.activity_type]?.[lang] ?? item.activity_type} · {about || '—'}{item.due_at ? ` · ${dateText(item.due_at, true)}` : ''}</small>
                  </div>
                  {late && <Badge tone="danger">{tr(lang, 'متأخرة', 'Late')}</Badge>}
                </div>
              );
            })}
          </Rows>
        )}

        {data && tab === 'reports' && (
          <>
            <div className="clients-reports-actions">
              <Button variant="primary" icon={<ChartColumn />} busy={busy} onClick={async () => { setBusy(true); await act(api.generateReport('daily')); setBusy(false); }}>{tr(lang, 'تقرير يومي', 'Daily report')}</Button>
              <Button icon={<CalendarClock />} busy={busy} onClick={async () => { setBusy(true); await act(api.generateReport('weekly')); setBusy(false); }}>{tr(lang, 'تقرير أسبوعي', 'Weekly report')}</Button>
            </div>
            {data.reports.length ? (
              <div className="reports">
                {data.reports.map(report => (
                  <Card key={report.id} className="report">
                    <div className="report__top">
                      <strong>{report.period === 'weekly' ? tr(lang, 'تقرير أسبوعي', 'Weekly report') : tr(lang, 'تقرير يومي', 'Daily report')}</strong>
                      <span>{dateText(report.period_start)} – {dateText(report.period_end)}</span>
                      <Badge tone={report.email_status === 'sent' ? 'success' : report.email_status === 'failed' ? 'danger' : 'neutral'}>
                        {report.email_status === 'sent' ? tr(lang, 'أُرسل بالبريد', 'Emailed') : report.email_status === 'failed' ? tr(lang, 'فشل الإرسال', 'Email failed') : report.email_status === 'pending' ? tr(lang, 'بانتظار الإرسال', 'Sending') : tr(lang, 'في النظام فقط', 'In app only')}
                      </Badge>
                    </div>
                    <dl className="report__figures">
                      {reportFigures(report, lang).map(figure => <div key={figure.key}><dt>{figure.label}</dt><dd>{figure.value}</dd></div>)}
                    </dl>
                  </Card>
                ))}
              </div>
            ) : <EmptyState icon={<FileBarChart />} title={tr(lang, 'لا توجد تقارير بعد', 'No reports yet')} description={tr(lang, 'أنشئ تقريرًا يوميًا أو أسبوعيًا بضغطة.', 'Generate a daily or weekly report in one click.')} />}
          </>
        )}
      </TabPanel>

      <ClientForms lang={lang} open={dialog} onClose={() => setDialog(null)}
        companies={data?.companies ?? []} contacts={data?.contacts ?? []} leads={data?.leads ?? []} deals={data?.deals ?? []}
        save={(kind, fields) => act({
          company: () => api.createCompany(user.id, fields as Record<string, string | null>),
          contact: () => api.createContact(user.id, fields as Record<string, string | null>),
          lead: () => api.createLead(user.id, fields),
          deal: () => api.createDeal(user.id, fields as Record<string, string | null>),
          followUp: () => api.createFollowUp(user.id, fields as Record<string, string | null>),
        }[kind]())} />
    </main>
  );
}

function Rows({ children, empty, grid = false }: { children: React.ReactNode; empty: React.ReactNode; grid?: boolean }) {
  const rows = React.Children.toArray(children);
  if (!rows.length) return <>{empty}</>;
  return <div className={grid ? 'companies-grid' : 'clients-rows'}>{rows}</div>;
}

function LeadCard({ lang, lead, company, now, dateText, move }: {
  lang: Lang; lead: Lead; company?: string; now: Date; dateText: (value: string | null, withTime?: boolean) => string; move: (stage: string) => void;
}) {
  const due = lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= now;
  return (
    <article className="lead-card" data-due={!!due}>
      <strong>{lead.title}</strong>
      {company && <small>{company}</small>}
      <div className="lead-card__meter" aria-label={tr(lang, `احتمال ${lead.probability}٪`, `${lead.probability}% likely`)}><span style={{ inlineSize: `${Math.min(100, Math.max(0, lead.probability))}%` }} /></div>
      <div className="lead-card__foot">
        <span className={due ? 'lead-card__due' : ''}><CalendarClock aria-hidden="true" />{lead.next_follow_up_at ? dateText(lead.next_follow_up_at) : tr(lang, 'بدون متابعة', 'No follow-up')}</span>
        <Select className="lead-card__move" value={lead.stage} aria-label={tr(lang, `مرحلة «${lead.title}»`, `Stage of “${lead.title}”`)} onChange={event => move(event.target.value)}>
          {Object.entries(leadStages).map(([key, value]) => <option key={key} value={key}>{value.label[lang]}</option>)}
        </Select>
      </div>
    </article>
  );
}

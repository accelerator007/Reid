import React from "react";
import type { User } from "@supabase/supabase-js";
import { firstError, list, messageFor, run, type AppError } from "./db";
import { supabase } from "./supabase";

type Lang = "ar" | "en";
type Tab = "overview" | "companies" | "contacts" | "leads" | "deals" | "activities" | "reports";
type Company = { id: string; name: string; industry: string | null; email: string | null; phone: string | null; status: string; owner_id: string | null };
type Contact = { id: string; name: string; email: string | null; phone: string | null; position: string | null; company_id: string | null; stage: string; owner_id: string | null };
type Lead = { id: string; title: string; stage: string; estimated_value: number; probability: number; next_follow_up_at: string | null; company_id: string | null; contact_id: string | null; owner_id: string | null };
type Deal = { id: string; title: string; stage: string; value: number; currency: string; expected_close_date: string | null; company_id: string | null; contact_id: string | null; owner_id: string | null };
type Activity = { id: string; activity_type: string; subject: string; due_at: string | null; completed_at: string | null; created_at: string };
type Report = { id: string; period: string; period_start: string; period_end: string; metrics: Record<string, number>; generated_at: string; email_status: string };

const copy = {
  ar: { title: "إدارة العملاء والمبيعات", subtitle: "العملاء المحتملون، الصفقات، المتابعة والتقارير التنفيذية في مكان واحد.", overview: "نظرة عامة", companies: "الشركات", contacts: "جهات الاتصال", leads: "العملاء المحتملون", deals: "الصفقات", activities: "المتابعات", reports: "التقارير", add: "إضافة", save: "حفظ", empty: "لا توجد سجلات مرئية لك.", retry: "أعد المحاولة" },
  en: { title: "CRM & Sales", subtitle: "Clients, pipeline, follow-ups and executive reports in one place.", overview: "Overview", companies: "Companies", contacts: "Contacts", leads: "Leads", deals: "Deals", activities: "Follow-ups", reports: "Reports", add: "Add", save: "Save", empty: "No records are visible to you.", retry: "Try again" },
};

const money = (value: number, currency = "OMR") => new Intl.NumberFormat("en-OM", { style: "currency", currency }).format(value || 0);
const valueOf = (form: FormData, key: string) => String(form.get(key) || "").trim();

export function CrmWorkspace({ lang, user }: { lang: Lang; user: User }) {
  const t = copy[lang];
  const [tab, setTab] = React.useState<Tab>("overview");
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [reports, setReports] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<AppError | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    if (!supabase) return;
    const results = await Promise.all([
      list<Company>(supabase.from("crm_companies").select("id,name,industry,email,phone,status,owner_id").order("created_at", { ascending: false })),
      list<Contact>(supabase.from("crm_contacts").select("id,name,email,phone,position,company_id,stage,owner_id").order("created_at", { ascending: false })),
      list<Lead>(supabase.from("crm_leads").select("id,title,stage,estimated_value,probability,next_follow_up_at,company_id,contact_id,owner_id").order("created_at", { ascending: false })),
      list<Deal>(supabase.from("crm_deals").select("id,title,stage,value,currency,expected_close_date,company_id,contact_id,owner_id").order("created_at", { ascending: false })),
      list<Activity>(supabase.from("crm_activities").select("id,activity_type,subject,due_at,completed_at,created_at").order("created_at", { ascending: false }).limit(100)),
      list<Report>(supabase.from("executive_reports").select("id,period,period_start,period_end,metrics,generated_at,email_status").order("generated_at", { ascending: false }).limit(30)),
    ]);
    const failure = firstError(results);
    setError(failure);
    if (results[0].ok) setCompanies(results[0].data);
    if (results[1].ok) setContacts(results[1].data);
    if (results[2].ok) setLeads(results[2].data);
    if (results[3].ok) setDeals(results[3].data);
    if (results[4].ok) setActivities(results[4].data);
    if (results[5].ok) setReports(results[5].data);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const mutate = async (action: () => PromiseLike<{ data: unknown; error: unknown }>, okText: string) => {
    setBusy(true); setMessage("");
    const result = await run(action());
    if (!result.ok) setError(result.error);
    else { setMessage(okText); await load(); }
    setBusy(false);
  };

  const createCompany = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => supabase!.from("crm_companies").insert({ name: valueOf(form,"name"), industry: valueOf(form,"industry") || null, email: valueOf(form,"email") || null, phone: valueOf(form,"phone") || null, owner_id: user.id }), lang === "ar" ? "تمت إضافة الشركة." : "Company added.");
    event.currentTarget.reset();
  };
  const createContact = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => supabase!.from("crm_contacts").insert({ name: valueOf(form,"name"), email: valueOf(form,"email") || null, phone: valueOf(form,"phone") || null, position: valueOf(form,"position") || null, company_id: valueOf(form,"company_id") || null, owner_id: user.id }), lang === "ar" ? "تمت إضافة جهة الاتصال." : "Contact added."); event.currentTarget.reset();
  };
  const createLead = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => supabase!.from("crm_leads").insert({ title: valueOf(form,"title"), company_id: valueOf(form,"company_id") || null, contact_id: valueOf(form,"contact_id") || null, source: valueOf(form,"source") || null, estimated_value: Number(valueOf(form,"value") || 0), probability: Number(valueOf(form,"probability") || 10), next_follow_up_at: valueOf(form,"follow_up") || null, owner_id: user.id }), lang === "ar" ? "تمت إضافة العميل المحتمل." : "Lead added."); event.currentTarget.reset();
  };
  const createDeal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void mutate(() => supabase!.from("crm_deals").insert({ title: valueOf(form,"title"), company_id: valueOf(form,"company_id") || null, contact_id: valueOf(form,"contact_id") || null, value: Number(valueOf(form,"value") || 0), currency: valueOf(form,"currency") || "OMR", expected_close_date: valueOf(form,"close") || null, owner_id: user.id }), lang === "ar" ? "تمت إضافة الصفقة." : "Deal added."); event.currentTarget.reset();
  };
  const createActivity = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const relation = valueOf(form,"relation").split(":");
    void mutate(() => supabase!.from("crm_activities").insert({ subject: valueOf(form,"subject"), activity_type: valueOf(form,"type"), [`${relation[0]}_id`]: relation[1], due_at: valueOf(form,"due") || null, owner_id: user.id }), lang === "ar" ? "تمت إضافة المتابعة." : "Follow-up added."); event.currentTarget.reset();
  };
  const updateStage = (table: "crm_leads" | "crm_deals", id: string, stage: string) => {
    const payload: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
    if (table === "crm_deals" && stage === "won") payload.closed_at = new Date().toISOString();
    void mutate(() => supabase!.from(table).update(payload).eq("id", id), lang === "ar" ? "تم تحديث المرحلة." : "Stage updated.");
  };
  const generate = async (period: "daily" | "weekly") => {
    if (!supabase) return; setBusy(true);
    const result = await run<Report>(supabase.rpc("generate_executive_report", { requested_period: period, requested_end: new Date().toISOString().slice(0,10) }));
    if (!result.ok) setError(result.error); else { setMessage(lang === "ar" ? "تم إنشاء التقرير." : "Report generated."); await load(); }
    setBusy(false);
  };

  const openValue = deals.filter(d => !["won","lost"].includes(d.stage)).reduce((sum,d) => sum + Number(d.value), 0);
  const wonValue = deals.filter(d => d.stage === "won").reduce((sum,d) => sum + Number(d.value), 0);
  const due = leads.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date() && !["converted","lost"].includes(l.stage)).length;
  const companyName = (id: string | null) => companies.find(c => c.id === id)?.name || "—";

  return <main className="crm-page">
    <header className="crm-heading"><div><span>REID CRM</span><h1>{t.title}</h1><p>{t.subtitle}</p></div></header>
    {error && <p className="load-error" role="alert">{messageFor(error,lang)} <button onClick={() => void load()}>{t.retry}</button></p>}
    {message && <p className="crm-message" role="status">{message}</p>}
    <nav className="crm-tabs" aria-label={t.title}>{(["overview","companies","contacts","leads","deals","activities","reports"] as Tab[]).map(item => <button key={item} className={tab===item?"active":""} onClick={() => setTab(item)}>{t[item]}</button>)}</nav>

    {tab === "overview" && <><section className="crm-kpis">
      <article><b>{companies.length}</b><small>{t.companies}</small></article><article><b>{leads.length}</b><small>{t.leads}</small></article><article><b>{money(openValue)}</b><small>{lang==="ar"?"قيمة خط المبيعات":"Open pipeline"}</small></article><article><b>{money(wonValue)}</b><small>{lang==="ar"?"صفقات رابحة":"Won value"}</small></article><article><b>{due}</b><small>{lang==="ar"?"متابعات متأخرة":"Overdue follow-ups"}</small></article>
    </section><section className="crm-board">{["new","qualified","proposal","negotiation","converted"].map(stage => <div key={stage}><h2>{stage}</h2>{leads.filter(l=>l.stage===stage).map(l=><article key={l.id}><b>{l.title}</b><small>{companyName(l.company_id)}</small><span>{money(l.estimated_value)} · {l.probability}%</span></article>)}</div>)}</section></>}

    {tab === "companies" && <CrmPanel title={t.companies}><form className="crm-form" onSubmit={createCompany}><input name="name" required placeholder={lang==="ar"?"اسم الشركة":"Company name"}/><input name="industry" placeholder={lang==="ar"?"القطاع":"Industry"}/><input name="email" type="email" placeholder="Email"/><input name="phone" placeholder={lang==="ar"?"الهاتف":"Phone"}/><button className="primary" disabled={busy}>{t.add}</button></form><CrmRows empty={t.empty}>{companies.map(c=><article key={c.id}><div><b>{c.name}</b><small>{c.industry||"—"}</small></div><span>{c.email||c.phone||"—"}</span><em>{c.status}</em></article>)}</CrmRows></CrmPanel>}
    {tab === "contacts" && <CrmPanel title={t.contacts}><form className="crm-form" onSubmit={createContact}><input name="name" required placeholder={lang==="ar"?"الاسم":"Name"}/><input name="email" type="email" placeholder="Email"/><input name="phone" placeholder={lang==="ar"?"الهاتف":"Phone"}/><input name="position" placeholder={lang==="ar"?"المسمى":"Position"}/><RelationSelect name="company_id" label={lang==="ar"?"الشركة":"Company"} rows={companies}/><button className="primary" disabled={busy}>{t.add}</button></form><CrmRows empty={t.empty}>{contacts.map(c=><article key={c.id}><div><b>{c.name}</b><small>{c.position||"—"}</small></div><span>{companyName(c.company_id)}</span><em>{c.email||c.phone||"—"}</em></article>)}</CrmRows></CrmPanel>}
    {tab === "leads" && <CrmPanel title={t.leads}><form className="crm-form" onSubmit={createLead}><input name="title" required placeholder={lang==="ar"?"عنوان الفرصة":"Lead title"}/><RelationSelect name="company_id" label={lang==="ar"?"الشركة":"Company"} rows={companies}/><RelationSelect name="contact_id" label={lang==="ar"?"جهة الاتصال":"Contact"} rows={contacts}/><input name="source" placeholder={lang==="ar"?"المصدر":"Source"}/><input name="value" type="number" min="0" placeholder={lang==="ar"?"القيمة المتوقعة":"Estimated value"}/><input name="probability" type="number" min="0" max="100" defaultValue="10"/><input name="follow_up" type="datetime-local"/><button className="primary" disabled={busy}>{t.add}</button></form><CrmRows empty={t.empty}>{leads.map(l=><article key={l.id}><div><b>{l.title}</b><small>{companyName(l.company_id)}</small></div><span>{money(l.estimated_value)} · {l.probability}%</span><select value={l.stage} onChange={e=>updateStage("crm_leads",l.id,e.target.value)}>{["new","qualified","proposal","negotiation","converted","lost"].map(s=><option key={s}>{s}</option>)}</select></article>)}</CrmRows></CrmPanel>}
    {tab === "deals" && <CrmPanel title={t.deals}><form className="crm-form" onSubmit={createDeal}><input name="title" required placeholder={lang==="ar"?"اسم الصفقة":"Deal title"}/><RelationSelect name="company_id" label={lang==="ar"?"الشركة":"Company"} rows={companies}/><RelationSelect name="contact_id" label={lang==="ar"?"جهة الاتصال":"Contact"} rows={contacts}/><input name="value" type="number" min="0" required placeholder={lang==="ar"?"القيمة":"Value"}/><select name="currency"><option>OMR</option><option>USD</option><option>AED</option><option>EUR</option></select><input name="close" type="date"/><button className="primary" disabled={busy}>{t.add}</button></form><CrmRows empty={t.empty}>{deals.map(d=><article key={d.id}><div><b>{d.title}</b><small>{companyName(d.company_id)}</small></div><span>{money(d.value,d.currency)}</span><select value={d.stage} onChange={e=>updateStage("crm_deals",d.id,e.target.value)}>{["discovery","proposal","negotiation","won","lost"].map(s=><option key={s}>{s}</option>)}</select></article>)}</CrmRows></CrmPanel>}
    {tab === "activities" && <CrmPanel title={t.activities}><form className="crm-form" onSubmit={createActivity}><input name="subject" required placeholder={lang==="ar"?"موضوع المتابعة":"Follow-up subject"}/><select name="type"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="task">Task</option><option value="note">Note</option></select><select name="relation" required defaultValue=""><option value="" disabled>{lang==="ar"?"مرتبطة بـ":"Related to"}</option>{companies.map(x=><option key={x.id} value={`company:${x.id}`}>{x.name}</option>)}{leads.map(x=><option key={x.id} value={`lead:${x.id}`}>{x.title}</option>)}{deals.map(x=><option key={x.id} value={`deal:${x.id}`}>{x.title}</option>)}</select><input name="due" type="datetime-local"/><button className="primary" disabled={busy}>{t.add}</button></form><CrmRows empty={t.empty}>{activities.map(a=><article key={a.id}><div><b>{a.subject}</b><small>{a.activity_type}</small></div><span>{a.due_at?new Date(a.due_at).toLocaleString(lang==="ar"?"ar-OM":"en-OM"):"—"}</span><em>{a.completed_at?(lang==="ar"?"مكتملة":"Complete"):(lang==="ar"?"مفتوحة":"Open")}</em></article>)}</CrmRows></CrmPanel>}
    {tab === "reports" && <CrmPanel title={t.reports}><div className="report-actions"><button className="primary" disabled={busy} onClick={()=>void generate("daily")}>{lang==="ar"?"إنشاء تقرير يومي":"Generate daily"}</button><button disabled={busy} onClick={()=>void generate("weekly")}>{lang==="ar"?"إنشاء تقرير أسبوعي":"Generate weekly"}</button></div><section className="report-grid">{reports.length?reports.map(r=><article key={r.id}><header><b>{r.period==="daily"?(lang==="ar"?"تقرير يومي":"Daily report"):(lang==="ar"?"تقرير أسبوعي":"Weekly report")}</b><small>{r.period_start} — {r.period_end}</small></header><dl>{Object.entries(r.metrics).map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{Number(value).toLocaleString("en-OM")}</dd></div>)}</dl><footer>{lang==="ar"?"حالة البريد":"Email"}: {r.email_status}</footer></article>):<p>{t.empty}</p>}</section></CrmPanel>}
  </main>;
}

function CrmPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="crm-panel"><h2>{title}</h2>{children}</section>; }
function CrmRows({ empty, children }: { empty: string; children: React.ReactNode }) { const rows=React.Children.toArray(children); return <div className="crm-rows">{rows.length?rows:<p>{empty}</p>}</div>; }
function RelationSelect({ name, label, rows }: { name: string; label: string; rows: {id:string;name?:string;title?:string}[] }) { return <select name={name} defaultValue=""><option value="">{label}</option>{rows.map(row=><option key={row.id} value={row.id}>{row.name||row.title}</option>)}</select>; }

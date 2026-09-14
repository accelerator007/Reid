import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  TicketCheck,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import { firstError, list, messageFor, run } from "./db";
import { useSession } from "./shell";
import type { Page } from "./routes";

type Lang = "ar" | "en";
type WorkshopStatus = "draft" | "published" | "completed" | "cancelled";
type WorkshopFormat = "onsite" | "online" | "hybrid";
type WorkshopVisibility = "public" | "internal";

type Workshop = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  status: WorkshopStatus;
  visibility: WorkshopVisibility;
  format: WorkshopFormat;
  venue_ar: string;
  venue_en: string;
  facilitator_name: string;
  registration_url: string | null;
  start_at: string;
  end_at: string;
  registration_deadline: string | null;
  capacity: number;
  price_omr: number;
};

type Registration = {
  workshop_id: string;
  attendee_id: string;
  status: "registered" | "waitlisted" | "attended" | "cancelled";
};

type Draft = Omit<Workshop, "id" | "price_omr" | "capacity"> & {
  id?: string;
  capacity: string;
  price_omr: string;
};

const tr = (lang: Lang, ar: string, en: string) => (lang === "ar" ? ar : en);
const editableRoles = ["owner", "super_admin", "admin", "hr"];
const workshopSelect = "id,title_ar,title_en,description_ar,description_en,status,visibility,format,venue_ar,venue_en,facilitator_name,registration_url,start_at,end_at,registration_deadline,capacity,price_omr";

function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultDraft(): Draft {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  return {
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    status: "draft",
    visibility: "public",
    format: "onsite",
    venue_ar: "",
    venue_en: "",
    facilitator_name: "",
    registration_url: null,
    start_at: localInput(start.toISOString()),
    end_at: localInput(end.toISOString()),
    registration_deadline: "",
    capacity: "20",
    price_omr: "0",
  };
}

export function Workshops({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const { user, roles } = useSession();
  const canManage = roles.some(role => editableRoles.includes(role));
  const [workshops, setWorkshops] = React.useState<Workshop[]>([]);
  const [registrations, setRegistrations] = React.useState<Registration[]>([]);
  const [busy, setBusy] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [filter, setFilter] = React.useState<"upcoming" | "published" | "draft" | "all">("upcoming");
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const load = React.useCallback(async () => {
    if (!supabase) {
      setError(tr(lang, "إعداد الاتصال غير مكتمل.", "Connection configuration is incomplete."));
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    let workshopQuery = supabase.from("workshops").select(workshopSelect).order("start_at", { ascending: true }).limit(200);
    if (!canManage) workshopQuery = workshopQuery.eq("status", "published");
    const workshopResult = await list<Workshop>(workshopQuery);
    const registrationResult = user
      ? await list<Registration>(supabase.from("workshop_registrations").select("workshop_id,attendee_id,status").limit(1000))
      : { ok: true as const, data: [] as Registration[] };
    const failure = firstError([workshopResult, registrationResult]);
    if (failure) setError(messageFor(failure, lang));
    if (workshopResult.ok) setWorkshops(workshopResult.data);
    if (registrationResult.ok) setRegistrations(registrationResult.data);
    setBusy(false);
  }, [canManage, lang, user]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !user || !draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    const start = new Date(draft.start_at);
    const end = new Date(draft.end_at);
    if (!draft.title_ar.trim() || !draft.title_en.trim() || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError(tr(lang, "راجع العناوين ووقت البداية والنهاية.", "Check the titles, start time, and end time."));
      setSaving(false);
      return;
    }
    const payload = {
      title_ar: draft.title_ar.trim(),
      title_en: draft.title_en.trim(),
      description_ar: draft.description_ar.trim(),
      description_en: draft.description_en.trim(),
      status: draft.status,
      visibility: draft.visibility,
      format: draft.format,
      venue_ar: draft.venue_ar.trim(),
      venue_en: draft.venue_en.trim(),
      facilitator_name: draft.facilitator_name.trim(),
      registration_url: draft.registration_url?.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      registration_deadline: draft.registration_deadline ? new Date(draft.registration_deadline).toISOString() : null,
      capacity: Number(draft.capacity),
      price_omr: Number(draft.price_omr),
    };
    const result = draft.id
      ? await run(supabase.from("workshops").update(payload).eq("id", draft.id).select("id").single())
      : await run(supabase.from("workshops").insert({ ...payload, created_by: user.id }).select("id").single());
    if (!result.ok) setError(messageFor(result.error, lang));
    else {
      setDraft(null);
      setNotice(tr(lang, "تم حفظ الورشة.", "Workshop saved."));
      await load();
    }
    setSaving(false);
  };

  const register = async (workshop: Workshop) => {
    if (!supabase) return;
    if (!user) {
      go("login");
      return;
    }
    setSaving(true);
    setError("");
    const own = registrations.find(item => item.workshop_id === workshop.id && item.attendee_id === user.id && ["registered", "waitlisted"].includes(item.status));
    const result = own
      ? await run(supabase.rpc("cancel_workshop_registration", { target_workshop: workshop.id }))
      : await run(supabase.rpc("register_for_workshop", { target_workshop: workshop.id }));
    if (!result.ok) setError(messageFor(result.error, lang));
    else {
      setNotice(own
        ? tr(lang, "تم إلغاء تسجيلك.", "Your registration was cancelled.")
        : tr(lang, "تم تسجيلك في الورشة.", "You are registered for the workshop."));
      await load();
    }
    setSaving(false);
  };

  const edit = (workshop: Workshop) => setDraft({
    ...workshop,
    start_at: localInput(workshop.start_at),
    end_at: localInput(workshop.end_at),
    registration_deadline: localInput(workshop.registration_deadline),
    capacity: String(workshop.capacity),
    price_omr: String(workshop.price_omr),
  });

  const now = Date.now();
  const visible = workshops.filter(workshop => {
    if (!canManage) return workshop.status === "published" && Date.parse(workshop.end_at) > now;
    if (filter === "upcoming") return Date.parse(workshop.end_at) > now && !["completed", "cancelled"].includes(workshop.status);
    if (filter === "published") return workshop.status === "published";
    if (filter === "draft") return workshop.status === "draft";
    return true;
  });
  const activeRegistrations = registrations.filter(item => ["registered", "attended"].includes(item.status));
  const formatter = new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Muscat" });
  const formatLabel = (format: WorkshopFormat) => ({ onsite: tr(lang, "حضوري", "On-site"), online: tr(lang, "عن بُعد", "Online"), hybrid: tr(lang, "هجين", "Hybrid") }[format]);
  const statusLabel = (status: WorkshopStatus) => ({ draft: tr(lang, "مسودة", "Draft"), published: tr(lang, "منشورة", "Published"), completed: tr(lang, "مكتملة", "Completed"), cancelled: tr(lang, "ملغاة", "Cancelled") }[status]);

  return <main className="os-page os-workshops">
    <div className="os-page-heading">
      <div><span className="os-eyebrow">REID WORKSHOPS</span><h1>{tr(lang, "ورش ريّد", "Reid workshops")}</h1><p>{tr(lang, "ورش عملية لبناء مهارات ومنتجات أفضل، مع تسجيل وإدارة واضحة من مكان واحد.", "Practical workshops for better skills and products, with clear registration and management in one place.")}</p></div>
      <div className="os-heading-actions">
        <button className="os-secondary" type="button" onClick={() => void load()} disabled={busy}><RefreshCw />{tr(lang, "تحديث", "Refresh")}</button>
        {canManage && <button className="os-primary" type="button" onClick={() => setDraft(defaultDraft())}><Plus />{tr(lang, "ورشة جديدة", "New workshop")}</button>}
      </div>
    </div>
    {error && <p className="os-alert" role="alert">{error}</p>}
    {notice && <p className="os-success" role="status">{notice}</p>}
    {canManage && <div className="os-metrics os-workshop-metrics">
      <section><span><CalendarDays /><small>{tr(lang, "القادمة", "Upcoming")}</small></span><b>{busy ? "—" : workshops.filter(item => Date.parse(item.end_at) > now && !["completed", "cancelled"].includes(item.status)).length}</b></section>
      <section><span><CheckCircle2 /><small>{tr(lang, "المنشورة", "Published")}</small></span><b>{busy ? "—" : workshops.filter(item => item.status === "published").length}</b></section>
      <section><span><TicketCheck /><small>{tr(lang, "التسجيلات", "Registrations")}</small></span><b>{busy ? "—" : activeRegistrations.length}</b></section>
      <section><span><UsersRound /><small>{tr(lang, "إجمالي المقاعد", "Total capacity")}</small></span><b>{busy ? "—" : workshops.filter(item => item.status === "published").reduce((sum, item) => sum + item.capacity, 0)}</b></section>
    </div>}
    {canManage && <div className="os-tabs" aria-label={tr(lang, "فلترة الورش", "Workshop filters")}>
      {(["upcoming", "published", "draft", "all"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{({ upcoming: tr(lang, "القادمة", "Upcoming"), published: tr(lang, "المنشورة", "Published"), draft: tr(lang, "المسودات", "Drafts"), all: tr(lang, "الكل", "All") })[value]}</button>)}
    </div>}
    {busy && <section className="os-panel os-workshop-loading"><RefreshCw /><p>{tr(lang, "جارٍ تحميل الورش…", "Loading workshops…")}</p></section>}
    {!busy && visible.length > 0 && <div className="os-workshop-grid">{visible.map(workshop => {
      const own = user ? registrations.find(item => item.workshop_id === workshop.id && item.attendee_id === user.id && ["registered", "waitlisted"].includes(item.status)) : null;
      const count = activeRegistrations.filter(item => item.workshop_id === workshop.id).length;
      const closed = Date.parse(workshop.registration_deadline || workshop.start_at) <= now;
      return <article className="os-panel os-workshop-card" key={workshop.id}>
        <header><span className="os-workshop-icon"><GraduationCap /></span><div><span className={`os-status ${workshop.status === "published" ? "good" : ""}`}>{statusLabel(workshop.status)}</span>{workshop.visibility === "internal" && <span className="os-status">{tr(lang, "داخلي", "Internal")}</span>}</div></header>
        <h2>{lang === "ar" ? workshop.title_ar : workshop.title_en}</h2>
        <p>{lang === "ar" ? workshop.description_ar : workshop.description_en}</p>
        <dl>
          <div><dt><CalendarDays />{tr(lang, "الموعد", "Schedule")}</dt><dd>{formatter.format(new Date(workshop.start_at))}</dd></div>
          <div><dt>{workshop.format === "online" ? <Video /> : <MapPin />}{formatLabel(workshop.format)}</dt><dd>{(lang === "ar" ? workshop.venue_ar : workshop.venue_en) || "—"}</dd></div>
          <div><dt><UsersRound />{tr(lang, "المقاعد", "Capacity")}</dt><dd>{canManage ? `${count} / ${workshop.capacity}` : workshop.capacity}</dd></div>
          <div><dt><TicketCheck />{tr(lang, "الرسوم", "Fee")}</dt><dd>{Number(workshop.price_omr) === 0 ? tr(lang, "مجانية", "Free") : `${Number(workshop.price_omr).toFixed(3)} OMR`}</dd></div>
        </dl>
        {workshop.facilitator_name && <small className="os-workshop-facilitator">{tr(lang, "يقدّمها", "Facilitated by")}: <b>{workshop.facilitator_name}</b></small>}
        <footer>
          {workshop.status === "published" && <button className={own ? "os-secondary" : "os-primary"} type="button" disabled={saving || (closed && !own)} onClick={() => void register(workshop)}>{own ? (own.status === "waitlisted" ? tr(lang, "إلغاء قائمة الانتظار", "Leave waitlist") : tr(lang, "إلغاء التسجيل", "Cancel registration")) : closed ? tr(lang, "التسجيل مغلق", "Registration closed") : tr(lang, "سجّل الآن", "Register now")}</button>}
          {workshop.registration_url && <a className="os-secondary" href={workshop.registration_url} target="_blank" rel="noreferrer">{tr(lang, "رابط إضافي", "More details")}<ExternalLink /></a>}
          {canManage && <button className="os-secondary" type="button" onClick={() => edit(workshop)}><Pencil />{tr(lang, "تعديل", "Edit")}</button>}
        </footer>
      </article>;
    })}</div>}
    {!busy && visible.length === 0 && <section className="os-panel os-empty"><GraduationCap /><h3>{tr(lang, "لا توجد ورش ظاهرة الآن", "No workshops are visible yet")}</h3><p>{tr(lang, canManage ? "أنشئ أول ورشة واحفظها كمسودة أو انشرها مباشرة." : "سنضيف الورش القادمة هنا فور فتح التسجيل.", canManage ? "Create the first workshop as a draft or publish it immediately." : "Upcoming workshops will appear here when registration opens.")}</p></section>}
    {draft && <div className="os-modal-backdrop" role="presentation"><section className="os-modal os-modal-wide" role="dialog" aria-modal="true" aria-labelledby="workshop-dialog-title">
      <button className="os-modal-close" type="button" onClick={() => setDraft(null)} aria-label={tr(lang, "إغلاق", "Close")}><X /></button>
      <h2 id="workshop-dialog-title">{draft.id ? tr(lang, "تعديل الورشة", "Edit workshop") : tr(lang, "ورشة جديدة", "New workshop")}</h2>
      <form onSubmit={event => void save(event)}>
        <div className="os-form-row"><label>{tr(lang, "العنوان بالعربية", "Arabic title")}<input required maxLength={180} value={draft.title_ar} onChange={event => setDraft({ ...draft, title_ar: event.target.value })} /></label><label>{tr(lang, "العنوان بالإنجليزية", "English title")}<input required maxLength={180} dir="ltr" value={draft.title_en} onChange={event => setDraft({ ...draft, title_en: event.target.value })} /></label></div>
        <div className="os-form-row"><label>{tr(lang, "الوصف بالعربية", "Arabic description")}<textarea rows={4} maxLength={4000} value={draft.description_ar} onChange={event => setDraft({ ...draft, description_ar: event.target.value })} /></label><label>{tr(lang, "الوصف بالإنجليزية", "English description")}<textarea rows={4} maxLength={4000} dir="ltr" value={draft.description_en} onChange={event => setDraft({ ...draft, description_en: event.target.value })} /></label></div>
        <div className="os-form-row"><label>{tr(lang, "البداية", "Starts")}<input required type="datetime-local" value={draft.start_at} onChange={event => setDraft({ ...draft, start_at: event.target.value })} /></label><label>{tr(lang, "النهاية", "Ends")}<input required type="datetime-local" value={draft.end_at} onChange={event => setDraft({ ...draft, end_at: event.target.value })} /></label></div>
        <div className="os-form-row"><label>{tr(lang, "آخر موعد للتسجيل", "Registration deadline")}<input type="datetime-local" value={draft.registration_deadline || ""} onChange={event => setDraft({ ...draft, registration_deadline: event.target.value })} /></label><label>{tr(lang, "المقدّم", "Facilitator")}<input maxLength={160} value={draft.facilitator_name} onChange={event => setDraft({ ...draft, facilitator_name: event.target.value })} /></label></div>
        <div className="os-form-row os-form-row-three"><label>{tr(lang, "الحالة", "Status")}<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as WorkshopStatus })}><option value="draft">{tr(lang, "مسودة", "Draft")}</option><option value="published">{tr(lang, "منشورة", "Published")}</option><option value="completed">{tr(lang, "مكتملة", "Completed")}</option><option value="cancelled">{tr(lang, "ملغاة", "Cancelled")}</option></select></label><label>{tr(lang, "الظهور", "Visibility")}<select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value as WorkshopVisibility })}><option value="public">{tr(lang, "عامة", "Public")}</option><option value="internal">{tr(lang, "داخلية", "Internal")}</option></select></label><label>{tr(lang, "النوع", "Format")}<select value={draft.format} onChange={event => setDraft({ ...draft, format: event.target.value as WorkshopFormat })}><option value="onsite">{tr(lang, "حضوري", "On-site")}</option><option value="online">{tr(lang, "عن بُعد", "Online")}</option><option value="hybrid">{tr(lang, "هجين", "Hybrid")}</option></select></label></div>
        <div className="os-form-row"><label>{tr(lang, "المكان بالعربية", "Arabic venue")}<input maxLength={240} value={draft.venue_ar} onChange={event => setDraft({ ...draft, venue_ar: event.target.value })} /></label><label>{tr(lang, "المكان بالإنجليزية", "English venue")}<input maxLength={240} dir="ltr" value={draft.venue_en} onChange={event => setDraft({ ...draft, venue_en: event.target.value })} /></label></div>
        <div className="os-form-row os-form-row-three"><label>{tr(lang, "السعة", "Capacity")}<input required type="number" min="1" max="10000" value={draft.capacity} onChange={event => setDraft({ ...draft, capacity: event.target.value })} /></label><label>{tr(lang, "السعر بالريال", "Price in OMR")}<input required type="number" min="0" step="0.001" value={draft.price_omr} onChange={event => setDraft({ ...draft, price_omr: event.target.value })} /></label><label>{tr(lang, "رابط تسجيل خارجي (اختياري)", "External registration URL (optional)")}<input type="url" dir="ltr" placeholder="https://" value={draft.registration_url || ""} onChange={event => setDraft({ ...draft, registration_url: event.target.value })} /></label></div>
        <button className="os-primary" type="submit" disabled={saving}>{saving ? tr(lang, "جارٍ الحفظ…", "Saving…") : tr(lang, "حفظ الورشة", "Save workshop")}</button>
      </form>
    </section></div>}
  </main>;
}

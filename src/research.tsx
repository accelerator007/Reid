import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { firstError, messageFor, toAppError } from "./db";
import { useSession } from "./shell";
import "./projects.css";
import "./project-permissions.css";
import "./research.css";

type Lang = "ar" | "en";
type Tab =
  | "overview"
  | "tasks"
  | "datasets"
  | "experiments"
  | "ethics"
  | "publications"
  | "documents"
  | "activity";
type Research = {
  id: string;
  title: string;
  abstract: string | null;
  field: string | null;
  status: string;
  supervisor_id: string | null;
  is_public: boolean;
  ethics_status: string | null;
  doi: string | null;
  conference: string | null;
  funding_source: string | null;
  funding_amount: number | null;
  currency: string;
  start_date: string | null;
  target_date: string | null;
  archived_at: string | null;
};
type Person = { id: string; full_name: string; email: string };
type Member = { research_id: string; user_id: string; member_role: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assignee_id: string | null;
  due_at: string | null;
};
type Dataset = {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  license: string | null;
  record_count: number | null;
  sensitivity: string;
  created_by: string;
};
type Experiment = {
  id: string;
  dataset_id: string | null;
  title: string;
  hypothesis: string | null;
  method: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  result_summary: string | null;
  created_by: string;
};
type Ethics = {
  id: string;
  title: string;
  authority: string;
  reference: string | null;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  expires_at: string | null;
  notes: string | null;
};
type Publication = {
  id: string;
  title: string;
  authors: string | null;
  venue_type: string;
  venue_name: string | null;
  doi: string | null;
  url: string | null;
  status: string;
  submitted_at: string | null;
  published_at: string | null;
  event_date: string | null;
};
type DocumentRow = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  restricted: boolean;
  uploaded_by: string;
  created_at: string;
};
type DocumentPermission = {
  id: string;
  document_id: string;
  user_id: string | null;
  role: string | null;
  can_read: boolean;
  can_write: boolean;
};
type Activity = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

const taskColumns = ["todo", "in_progress", "review", "done"],
  researchStatuses = ["proposal", "active", "in_review", "published", "closed"],
  experimentStatuses = ["planned", "running", "completed", "failed"],
  ethicsStatuses = ["draft", "submitted", "approved", "rejected", "expired"],
  publicationStatuses = [
    "draft",
    "submitted",
    "under_review",
    "accepted",
    "published",
    "rejected",
  ],
  venueTypes = ["journal", "conference", "preprint", "report", "thesis"],
  sensitivities = ["public", "internal", "restricted"],
  appRoles = [
    "owner",
    "super_admin",
    "admin",
    "hr",
    "sales",
    "employee",
    "project_member",
    "research_member",
    "guest",
  ],
  // The database enforces the same shape; the input hint keeps the error local.
  doiPattern = "10\\.[0-9]{4,9}/\\S+";

const copy = {
  ar: {
    title: "الأبحاث",
    new: "بحث جديد",
    overview: "نظرة عامة",
    tasks: "المهام",
    datasets: "مجموعات البيانات",
    experiments: "التجارب",
    ethics: "الموافقات الأخلاقية",
    publications: "المنشورات",
    documents: "الوثائق",
    activity: "النشاط",
    back: "كل الأبحاث",
    save: "حفظ",
    team: "فريق البحث",
    settings: "إعدادات البحث",
    supervisor: "المشرف",
    empty: "لا توجد أبحاث متاحة لك بعد.",
    secureOpen: "فتح آمن",
    restricted: "مقيدة — تحتاج صلاحية صريحة",
    grant: "منح صلاحية…",
    removeGrant: "إزالة الصلاحية",
    addPermission: "إضافة صلاحية وثيقة",
    archive: "أرشفة البحث",
    unarchive: "إلغاء الأرشفة",
    showArchived: "عرض المؤرشفة",
    onlyManager: "الإنشاء متاح للمشرف أو الإدارة فقط.",
  },
  en: {
    title: "Research",
    new: "New research",
    overview: "Overview",
    tasks: "Tasks",
    datasets: "Datasets",
    experiments: "Experiments",
    ethics: "Ethics approvals",
    publications: "Publications",
    documents: "Documents",
    activity: "Activity",
    back: "All research",
    save: "Save",
    team: "Research team",
    settings: "Research settings",
    supervisor: "Supervisor",
    empty: "No research is shared with you yet.",
    secureOpen: "Secure open",
    restricted: "Restricted — explicit permission required",
    grant: "Grant permission…",
    removeGrant: "Remove permission",
    addPermission: "Add document permission",
    archive: "Archive research",
    unarchive: "Unarchive",
    showArchived: "Show archived",
    onlyManager: "Only a supervisor or administrator can create records.",
  },
};

export function ResearchWorkspace({ lang, user }: { lang: Lang; user: User }) {
  // Roles come from the shell, which resolved them once for the session.
  const { roles } = useSession();
  const t = copy[lang],
    [research, setResearch] = React.useState<Research[]>([]),
    [people, setPeople] = React.useState<Person[]>([]),
    [selected, setSelected] = React.useState<string | null>(
      location.pathname.split("/")[2] || null,
    ),
    [tab, setTab] = React.useState<Tab>("overview"),
    [showArchived, setShowArchived] = React.useState(false),
    [members, setMembers] = React.useState<Member[]>([]),
    [tasks, setTasks] = React.useState<Task[]>([]),
    [datasets, setDatasets] = React.useState<Dataset[]>([]),
    [experiments, setExperiments] = React.useState<Experiment[]>([]),
    [ethics, setEthics] = React.useState<Ethics[]>([]),
    [publications, setPublications] = React.useState<Publication[]>([]),
    [documents, setDocuments] = React.useState<DocumentRow[]>([]),
    [permissions, setPermissions] = React.useState<DocumentPermission[]>([]),
    [activity, setActivity] = React.useState<Activity[]>([]),
    [message, setMessage] = React.useState(""),
    [busy, setBusy] = React.useState(false);

  const admin = roles.some((r) =>
      ["owner", "super_admin", "admin"].includes(r),
    ),
    item = research.find((r) => r.id === selected),
    // Mirrors public.can_manage_research; RLS remains the real boundary.
    supervisor =
      admin ||
      item?.supervisor_id === user.id ||
      members.some(
        (m) =>
          m.user_id === user.id &&
          ["supervisor", "lead"].includes(m.member_role),
      ),
    member = supervisor || members.some((m) => m.user_id === user.id);
  const person = (id: string | null) =>
    people.find((p) => p.id === id)?.full_name || "—";

  const loadResearch = React.useCallback(async () => {
    if (!supabase) return;
    const p = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .order("full_name");
    setPeople((p.data || []) as Person[]);
    const q = await supabase
      .from("research")
      .select(
        "id,title,abstract,field,status,supervisor_id,is_public,ethics_status,doi,conference,funding_source,funding_amount,currency,start_date,target_date,archived_at",
      )
      .order("updated_at", { ascending: false });
    setResearch((q.data || []) as Research[]);
    const failure = firstError(
      [p, q].map((x) =>
        x.error
          ? { ok: false as const, error: toAppError(x.error) }
          : { ok: true as const, data: null },
      ),
    );
    setMessage(failure ? messageFor(failure, lang) : "");
  }, [user.id, lang]);

  const loadDetail = React.useCallback(async () => {
    if (!supabase || !selected) return;
    const [m, ta, ds, ex, et, pu, dc, pe, ac] = await Promise.all([
      supabase
        .from("research_members")
        .select("research_id,user_id,member_role")
        .eq("research_id", selected),
      supabase
        .from("tasks")
        .select("id,title,description,status,priority,assignee_id,due_at")
        .eq("research_id", selected)
        .order("created_at"),
      supabase
        .from("research_datasets")
        .select(
          "id,name,description,source,license,record_count,sensitivity,created_by",
        )
        .eq("research_id", selected)
        .order("created_at"),
      supabase
        .from("research_experiments")
        .select(
          "id,dataset_id,title,hypothesis,method,status,started_at,ended_at,result_summary,created_by",
        )
        .eq("research_id", selected)
        .order("created_at", { ascending: false }),
      supabase
        .from("research_ethics_approvals")
        .select(
          "id,title,authority,reference,status,submitted_at,decided_at,decided_by,expires_at,notes",
        )
        .eq("research_id", selected)
        .order("created_at", { ascending: false }),
      supabase
        .from("research_publications")
        .select(
          "id,title,authors,venue_type,venue_name,doi,url,status,submitted_at,published_at,event_date",
        )
        .eq("research_id", selected)
        .order("created_at", { ascending: false }),
      supabase
        .from("research_documents")
        .select(
          "id,title,storage_path,category,restricted,uploaded_by,created_at",
        )
        .eq("research_id", selected)
        .order("created_at", { ascending: false }),
      supabase
        .from("research_document_permissions")
        .select("id,document_id,user_id,role,can_read,can_write"),
      supabase
        .from("research_activity")
        .select("id,actor_id,action,entity_type,entity_id,created_at")
        .eq("research_id", selected)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setMembers((m.data || []) as Member[]);
    setTasks((ta.data || []) as Task[]);
    setDatasets((ds.data || []) as Dataset[]);
    setExperiments((ex.data || []) as Experiment[]);
    setEthics((et.data || []) as Ethics[]);
    setPublications((pu.data || []) as Publication[]);
    setDocuments((dc.data || []) as DocumentRow[]);
    setPermissions((pe.data || []) as DocumentPermission[]);
    setActivity((ac.data || []) as Activity[]);
    // A raw Postgres string is not something a reader can act on.
    const failure = firstError(
      [m, ta, ds, ex, et, pu, dc, pe, ac].map((x) =>
        x.error
          ? { ok: false as const, error: toAppError(x.error) }
          : { ok: true as const, data: null },
      ),
    );
    setMessage(failure ? messageFor(failure, lang) : "");
  }, [selected, lang]);

  React.useEffect(() => {
    void loadResearch();
  }, [loadResearch]);
  React.useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  React.useEffect(() => {
    if (!supabase || !selected) return;
    const channel = supabase
      .channel(`research:${selected}`)
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        void loadResearch();
        void loadDetail();
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [selected, loadDetail, loadResearch]);

  const run = async (
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    setBusy(true);
    setMessage("");
    const { error } = await fn();
    setMessage(error?.message || (lang === "ar" ? "تم الحفظ." : "Saved."));
    setBusy(false);
    if (!error) {
      await loadResearch();
      await loadDetail();
    }
  };

  const Form = ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit: (f: FormData, form: HTMLFormElement) => Promise<void> | void;
  }) => (
    <form
      className="project-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(new FormData(e.currentTarget), e.currentTarget);
      }}
    >
      {children}
      <button className="primary" disabled={busy}>
        {t.save}
      </button>
    </form>
  );
  const Field = ({
    name,
    label,
    type = "text",
    required = true,
    value,
    pattern,
  }: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    value?: string | null;
    pattern?: string;
  }) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        pattern={pattern}
        defaultValue={value || ""}
      />
    </label>
  );
  const Choice = ({
    name,
    label,
    options,
    value,
  }: {
    name: string;
    label: string;
    options: readonly string[];
    value?: string;
  }) => (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map((x) => (
          <option key={x} value={x}>
            {x.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );

  const open = (id: string) => {
      history.pushState({}, "", `/research/${id}`);
      setSelected(id);
      setTab("overview");
      scrollTo(0, 0);
    },
    back = () => {
      history.pushState({}, "", "/research");
      setSelected(null);
    };

  if (!item)
    return (
      <main className="projects-page">
        <header className="projects-heading">
          <div>
            <span>REID RESEARCH</span>
            <h1>{t.title}</h1>
          </div>
          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {t.showArchived}
          </label>
        </header>
        {message && (
          <p role="status" className="workspace-message">
            {message}
          </p>
        )}
        <section className="project-cards">
          {research
            .filter((r) => (showArchived ? !!r.archived_at : !r.archived_at))
            .map((r) => (
              <button key={r.id} onClick={() => open(r.id)}>
                <i>{(r.field || r.title).slice(0, 1).toUpperCase()}</i>
                <div>
                  <small>
                    {r.field || "—"} · {r.status}
                    {r.is_public
                      ? lang === "ar"
                        ? " · عام"
                        : " · public"
                      : ""}
                  </small>
                  <h2>{r.title}</h2>
                  <p>{r.abstract || "—"}</p>
                  <span>
                    {person(r.supervisor_id)} · {r.target_date || "—"}
                  </span>
                </div>
              </button>
            ))}
        </section>
        {!research.some((r) =>
          showArchived ? !!r.archived_at : !r.archived_at,
        ) && <p className="research-empty">{t.empty}</p>}
        {admin ? (
          <section className="project-create">
            <h2>{t.new}</h2>
            <Form
              onSubmit={async (f, form) => {
                setBusy(true);
                const { data, error } = await supabase!
                  .from("research")
                  .insert({
                    title: f.get("title"),
                    abstract: f.get("abstract"),
                    field: f.get("field"),
                    supervisor_id: f.get("supervisor_id"),
                    status: "proposal",
                    is_public: f.get("is_public") === "on",
                    funding_source: f.get("funding_source") || null,
                    funding_amount: Number(f.get("funding_amount") || 0),
                    currency: f.get("currency"),
                    start_date: f.get("start_date") || null,
                    target_date: f.get("target_date") || null,
                    created_by: user.id,
                  })
                  .select("id")
                  .single();
                if (!error && data)
                  await supabase!
                    .from("research_members")
                    .insert({
                      research_id: data.id,
                      user_id: f.get("supervisor_id"),
                      member_role: "supervisor",
                    });
                setMessage(
                  error?.message ||
                    (lang === "ar" ? "تم إنشاء البحث." : "Research created."),
                );
                setBusy(false);
                form.reset();
                await loadResearch();
                if (data) open(data.id);
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "عنوان البحث" : "Research title"}
              />
              <Field
                name="field"
                label={lang === "ar" ? "المجال" : "Field"}
                required={false}
              />
              <Field
                name="abstract"
                label={lang === "ar" ? "الملخص" : "Abstract"}
              />
              <label>
                {t.supervisor}
                <select name="supervisor_id">
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="funding_source"
                label={lang === "ar" ? "جهة التمويل" : "Funding source"}
                required={false}
              />
              <Field
                name="funding_amount"
                label={lang === "ar" ? "قيمة التمويل" : "Funding amount"}
                type="number"
                required={false}
              />
              <Field
                name="currency"
                label={lang === "ar" ? "العملة" : "Currency"}
                value="OMR"
              />
              <Field
                name="start_date"
                label={lang === "ar" ? "البداية" : "Start"}
                type="date"
                required={false}
              />
              <Field
                name="target_date"
                label={lang === "ar" ? "الموعد المستهدف" : "Target"}
                type="date"
                required={false}
              />
              <label>
                <input name="is_public" type="checkbox" />
                {lang === "ar"
                  ? "بحث عام — يظهر لكل الموظفين"
                  : "Public — visible to every employee"}
              </label>
            </Form>
          </section>
        ) : (
          <p className="research-empty">{t.onlyManager}</p>
        )}
      </main>
    );

  const tabs: Tab[] = [
    "overview",
    "tasks",
    "datasets",
    "experiments",
    "ethics",
    "publications",
    "documents",
    "activity",
  ];
  const approvedEthics = ethics.filter((e) => e.status === "approved").length;

  return (
    <main className="project-dashboard">
      <button className="project-back" onClick={back}>
        ← {t.back}
      </button>
      <section className="project-hero">
        <div>
          <small>
            {item.field || "—"} · {item.status}
          </small>
          <h1>{item.title}</h1>
          <p>{item.abstract}</p>
        </div>
        <div>
          <b>
            {item.funding_amount || 0} {item.currency}
          </b>
          <span>
            {t.supervisor}: {person(item.supervisor_id)}
          </span>
          {item.doi && (
            <a
              href={`https://doi.org/${item.doi}`}
              target="_blank"
              rel="noreferrer"
            >
              DOI {item.doi} ↗
            </a>
          )}
        </div>
      </section>
      <nav className="project-tabs">
        {tabs.map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {t[x]}
          </button>
        ))}
      </nav>
      {message && (
        <p role="status" className="workspace-message">
          {message}
        </p>
      )}

      {tab === "overview" && (
        <section className="project-overview">
          <article>
            <small>{lang === "ar" ? "الباحثون" : "Researchers"}</small>
            <b>{members.length}</b>
          </article>
          <article>
            <small>{lang === "ar" ? "التجارب" : "Experiments"}</small>
            <b>
              {experiments.filter((x) => x.status === "completed").length}/
              {experiments.length}
            </b>
          </article>
          <article>
            <small>{lang === "ar" ? "موافقات معتمدة" : "Ethics approved"}</small>
            <b>
              {approvedEthics}/{ethics.length}
            </b>
          </article>
          <article>
            <small>{lang === "ar" ? "منشورات" : "Publications"}</small>
            <b>
              {publications.filter((x) => x.status === "published").length}/
              {publications.length}
            </b>
          </article>
          <div className="project-panel">
            <h2>{t.team}</h2>
            {members.map((m) => (
              <p key={m.user_id}>
                <b>{person(m.user_id)}</b>
                <span>{m.member_role}</span>
                {supervisor && m.user_id !== item.supervisor_id && (
                  <button
                    aria-label={lang === "ar" ? "إزالة باحث" : "Remove member"}
                    onClick={() =>
                      run(() =>
                        supabase!
                          .from("research_members")
                          .delete()
                          .eq("research_id", item.id)
                          .eq("user_id", m.user_id),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </p>
            ))}
            {supervisor && (
              <Form
                onSubmit={async (f, form) => {
                  await run(() =>
                    supabase!
                      .from("research_members")
                      .insert({
                        research_id: item.id,
                        user_id: f.get("user_id"),
                        member_role: f.get("member_role"),
                      }),
                  );
                  form.reset();
                }}
              >
                <label>
                  {lang === "ar" ? "باحث" : "Researcher"}
                  <select name="user_id">
                    {people
                      .filter((p) => !members.some((m) => m.user_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </select>
                </label>
                <Choice
                  name="member_role"
                  label={lang === "ar" ? "الدور" : "Role"}
                  options={["researcher", "lead", "supervisor", "reviewer"]}
                />
              </Form>
            )}
          </div>
          {supervisor && (
            <div className="project-panel">
              <h2>{t.settings}</h2>
              <Form
                onSubmit={async (f) =>
                  run(() =>
                    supabase!
                      .from("research")
                      .update({
                        title: f.get("title"),
                        abstract: f.get("abstract"),
                        field: f.get("field"),
                        status: f.get("status"),
                        is_public: f.get("is_public") === "on",
                        conference: f.get("conference") || null,
                        target_date: f.get("target_date") || null,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", item.id),
                  )
                }
              >
                <Field
                  name="title"
                  label={lang === "ar" ? "العنوان" : "Title"}
                  value={item.title}
                />
                <Field
                  name="field"
                  label={lang === "ar" ? "المجال" : "Field"}
                  required={false}
                  value={item.field}
                />
                <Field
                  name="abstract"
                  label={lang === "ar" ? "الملخص" : "Abstract"}
                  value={item.abstract}
                />
                <Choice
                  name="status"
                  label={lang === "ar" ? "الحالة" : "Status"}
                  options={researchStatuses}
                  value={item.status}
                />
                <Field
                  name="conference"
                  label={lang === "ar" ? "المؤتمر" : "Conference"}
                  required={false}
                  value={item.conference}
                />
                <Field
                  name="target_date"
                  label={lang === "ar" ? "الموعد" : "Target"}
                  type="date"
                  required={false}
                  value={item.target_date}
                />
                <label>
                  <input
                    name="is_public"
                    type="checkbox"
                    defaultChecked={item.is_public}
                  />
                  {lang === "ar" ? "بحث عام" : "Public research"}
                </label>
              </Form>
              <button
                className="archive"
                onClick={() =>
                  run(() =>
                    supabase!
                      .from("research")
                      .update({
                        archived_at: item.archived_at
                          ? null
                          : new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", item.id),
                  )
                }
              >
                {item.archived_at ? t.unarchive : t.archive}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "tasks" && (
        <section className="kanban">
          {taskColumns.map((column) => (
            <div key={column}>
              <h2>{column.replace("_", " ")}</h2>
              {tasks
                .filter((x) => x.status === column)
                .map((x) => (
                  <article key={x.id}>
                    <b>{x.title}</b>
                    <small>
                      {person(x.assignee_id)} · {x.due_at?.slice(0, 10) || "—"}
                    </small>
                    {(supervisor || x.assignee_id === user.id) && (
                      <select
                        aria-label={
                          lang === "ar" ? "حالة المهمة" : "Task status"
                        }
                        value={x.status}
                        onChange={(e) =>
                          run(() =>
                            supabase!
                              .from("tasks")
                              .update({ status: e.target.value })
                              .eq("id", x.id),
                          )
                        }
                      >
                        {taskColumns.map((c) => (
                          <option key={c} value={c}>
                            {c.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
            </div>
          ))}
          {supervisor && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("tasks")
                    .insert({
                      research_id: item.id,
                      title: f.get("title"),
                      description: f.get("description"),
                      assignee_id: f.get("assignee_id"),
                      due_at: f.get("due_at") || null,
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "عنوان المهمة" : "Task title"}
              />
              <Field
                name="description"
                label={lang === "ar" ? "الوصف" : "Description"}
                required={false}
              />
              <label>
                {lang === "ar" ? "المسؤول" : "Assignee"}
                <select name="assignee_id">
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {person(m.user_id)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="due_at"
                label={lang === "ar" ? "الاستحقاق" : "Due"}
                type="date"
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {tab === "datasets" && (
        <section className="project-list">
          <h2>{t.datasets}</h2>
          {datasets.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.name}</b>
                <small>
                  {x.source || "—"} · {x.license || "—"} ·{" "}
                  {x.record_count ?? "—"}{" "}
                  {lang === "ar" ? "سجل" : "records"}
                </small>
                <p>{x.description}</p>
              </div>
              <span className={`research-chip s-${x.sensitivity}`}>
                {x.sensitivity}
              </span>
            </article>
          ))}
          {supervisor && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("research_datasets")
                    .insert({
                      research_id: item.id,
                      name: f.get("name"),
                      description: f.get("description"),
                      source: f.get("source") || null,
                      license: f.get("license") || null,
                      record_count: f.get("record_count")
                        ? Number(f.get("record_count"))
                        : null,
                      sensitivity: f.get("sensitivity"),
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="name"
                label={lang === "ar" ? "اسم المجموعة" : "Dataset name"}
              />
              <Field
                name="description"
                label={lang === "ar" ? "الوصف" : "Description"}
                required={false}
              />
              <Field
                name="source"
                label={lang === "ar" ? "المصدر" : "Source"}
                required={false}
              />
              <Field
                name="license"
                label={lang === "ar" ? "الرخصة" : "License"}
                required={false}
              />
              <Field
                name="record_count"
                label={lang === "ar" ? "عدد السجلات" : "Records"}
                type="number"
                required={false}
              />
              <Choice
                name="sensitivity"
                label={lang === "ar" ? "الحساسية" : "Sensitivity"}
                options={sensitivities}
                value="internal"
              />
            </Form>
          )}
        </section>
      )}

      {tab === "experiments" && (
        <section className="project-list">
          <h2>{t.experiments}</h2>
          {experiments.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {datasets.find((d) => d.id === x.dataset_id)?.name || "—"} ·{" "}
                  {person(x.created_by)}
                </small>
                <p>{x.hypothesis}</p>
                {x.result_summary && <p>{x.result_summary}</p>}
              </div>
              {supervisor || x.created_by === user.id ? (
                <select
                  aria-label={
                    lang === "ar" ? "حالة التجربة" : "Experiment status"
                  }
                  value={x.status}
                  onChange={(e) =>
                    run(() =>
                      supabase!
                        .from("research_experiments")
                        .update({
                          status: e.target.value,
                          started_at:
                            e.target.value === "running"
                              ? new Date().toISOString()
                              : x.started_at,
                          ended_at: ["completed", "failed"].includes(
                            e.target.value,
                          )
                            ? new Date().toISOString()
                            : x.ended_at,
                        })
                        .eq("id", x.id),
                    )
                  }
                >
                  {experimentStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="research-chip">{x.status}</span>
              )}
            </article>
          ))}
          {member && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("research_experiments")
                    .insert({
                      research_id: item.id,
                      dataset_id: f.get("dataset_id") || null,
                      title: f.get("title"),
                      hypothesis: f.get("hypothesis"),
                      method: f.get("method"),
                      status: "planned",
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "عنوان التجربة" : "Experiment title"}
              />
              <label>
                {lang === "ar" ? "مجموعة البيانات" : "Dataset"}
                <select name="dataset_id" defaultValue="">
                  <option value="">—</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="hypothesis"
                label={lang === "ar" ? "الفرضية" : "Hypothesis"}
                required={false}
              />
              <Field
                name="method"
                label={lang === "ar" ? "المنهجية" : "Method"}
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {tab === "ethics" && (
        <section className="project-list">
          <h2>{t.ethics}</h2>
          {ethics.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.authority} · {x.reference || "—"} ·{" "}
                  {lang === "ar" ? "ينتهي" : "expires"} {x.expires_at || "—"}
                </small>
                <p>{x.notes}</p>
                {x.decided_by && (
                  <small>
                    {lang === "ar" ? "قرار" : "Decided by"}{" "}
                    {person(x.decided_by)} ·{" "}
                    {x.decided_at?.slice(0, 10) || "—"}
                  </small>
                )}
              </div>
              {supervisor ? (
                <select
                  aria-label={
                    lang === "ar" ? "حالة الموافقة" : "Ethics status"
                  }
                  value={x.status}
                  onChange={(e) => {
                    const decided = ["approved", "rejected"].includes(
                      e.target.value,
                    );
                    void run(() =>
                      supabase!
                        .from("research_ethics_approvals")
                        .update({
                          status: e.target.value,
                          // The table refuses an approval or rejection that
                          // does not name who decided it and when.
                          decided_at: decided
                            ? new Date().toISOString()
                            : x.decided_at,
                          decided_by: decided ? user.id : x.decided_by,
                          submitted_at:
                            e.target.value === "submitted"
                              ? new Date().toISOString()
                              : x.submitted_at,
                        })
                        .eq("id", x.id),
                    );
                  }}
                >
                  {ethicsStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`research-chip e-${x.status}`}>{x.status}</span>
              )}
            </article>
          ))}
          {supervisor && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("research_ethics_approvals")
                    .insert({
                      research_id: item.id,
                      title: f.get("title"),
                      authority: f.get("authority"),
                      reference: f.get("reference") || null,
                      status: "draft",
                      expires_at: f.get("expires_at") || null,
                      notes: f.get("notes") || null,
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "عنوان الطلب" : "Submission title"}
              />
              <Field
                name="authority"
                label={lang === "ar" ? "الجهة" : "Authority"}
              />
              <Field
                name="reference"
                label={lang === "ar" ? "الرقم المرجعي" : "Reference"}
                required={false}
              />
              <Field
                name="expires_at"
                label={lang === "ar" ? "تاريخ الانتهاء" : "Expires"}
                type="date"
                required={false}
              />
              <Field
                name="notes"
                label={lang === "ar" ? "ملاحظات" : "Notes"}
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {tab === "publications" && (
        <section className="project-list">
          <h2>{t.publications}</h2>
          {publications.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.venue_type} · {x.venue_name || "—"} · {x.authors || "—"}
                </small>
                <small>
                  {x.event_date
                    ? `${lang === "ar" ? "المؤتمر" : "Event"} ${x.event_date} · `
                    : ""}
                  {x.published_at || x.submitted_at || "—"}
                </small>
                {x.doi && (
                  <a
                    href={`https://doi.org/${x.doi}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    doi.org/{x.doi}
                  </a>
                )}
              </div>
              {supervisor ? (
                <select
                  aria-label={
                    lang === "ar" ? "حالة المنشور" : "Publication status"
                  }
                  value={x.status}
                  onChange={(e) =>
                    run(() =>
                      supabase!
                        .from("research_publications")
                        .update({
                          status: e.target.value,
                          published_at:
                            e.target.value === "published"
                              ? new Date().toISOString().slice(0, 10)
                              : x.published_at,
                        })
                        .eq("id", x.id),
                    )
                  }
                >
                  {publicationStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`research-chip p-${x.status}`}>{x.status}</span>
              )}
            </article>
          ))}
          {supervisor && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("research_publications")
                    .insert({
                      research_id: item.id,
                      title: f.get("title"),
                      authors: f.get("authors") || null,
                      venue_type: f.get("venue_type"),
                      venue_name: f.get("venue_name") || null,
                      doi: f.get("doi") || null,
                      url: f.get("url") || null,
                      status: "draft",
                      event_date: f.get("event_date") || null,
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "عنوان المنشور" : "Publication title"}
              />
              <Field
                name="authors"
                label={lang === "ar" ? "المؤلفون" : "Authors"}
                required={false}
              />
              <Choice
                name="venue_type"
                label={lang === "ar" ? "النوع" : "Venue type"}
                options={venueTypes}
              />
              <Field
                name="venue_name"
                label={lang === "ar" ? "اسم الجهة" : "Venue name"}
                required={false}
              />
              <Field
                name="doi"
                label="DOI"
                required={false}
                pattern={doiPattern}
              />
              <Field
                name="url"
                label={lang === "ar" ? "الرابط" : "URL"}
                type="url"
                required={false}
              />
              <Field
                name="event_date"
                label={lang === "ar" ? "تاريخ المؤتمر" : "Conference date"}
                type="date"
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {tab === "documents" && (
        <section className="project-list">
          <h2>{t.documents}</h2>
          {documents.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.category} · {person(x.uploaded_by)} ·{" "}
                  {x.created_at.slice(0, 10)}
                  {x.restricted
                    ? lang === "ar"
                      ? " · مقيدة"
                      : " · restricted"
                    : ""}
                </small>
                {x.restricted && (
                  <div className="file-permissions">
                    {permissions
                      .filter((p) => p.document_id === x.id)
                      .map((p) => (
                        <span key={p.id}>
                          {p.user_id ? person(p.user_id) : p.role} ·{" "}
                          {p.can_write ? "read/write" : "read"}
                          {supervisor && (
                            <button
                              aria-label={t.removeGrant}
                              onClick={() =>
                                run(() =>
                                  supabase!
                                    .from("research_document_permissions")
                                    .delete()
                                    .eq("id", p.id),
                                )
                              }
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                  </div>
                )}
                {supervisor && x.restricted && (
                  <select
                    aria-label={t.addPermission}
                    defaultValue=""
                    onChange={async (e) => {
                      const [kind, value, mode] = e.target.value.split(":");
                      if (!value) return;
                      await run(() =>
                        supabase!
                          .from("research_document_permissions")
                          .insert({
                            document_id: x.id,
                            user_id: kind === "user" ? value : null,
                            role: kind === "role" ? value : null,
                            can_read: true,
                            can_write: mode === "write",
                            granted_by: user.id,
                          }),
                      );
                      e.target.value = "";
                    }}
                  >
                    <option value="">{t.grant}</option>
                    {members.map((m) => (
                      <React.Fragment key={m.user_id}>
                        <option value={`user:${m.user_id}:read`}>
                          {person(m.user_id)} — read
                        </option>
                        <option value={`user:${m.user_id}:write`}>
                          {person(m.user_id)} — read/write
                        </option>
                      </React.Fragment>
                    ))}
                    {appRoles.map((r) => (
                      <option key={r} value={`role:${r}:read`}>
                        Role: {r}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={async () => {
                  const { data, error } = await supabase!.storage
                    .from("research-files")
                    .createSignedUrl(x.storage_path, 60);
                  setMessage(error?.message || "");
                  if (data?.signedUrl)
                    window.open(
                      data.signedUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                }}
              >
                {t.secureOpen}
              </button>
            </article>
          ))}
          {supervisor && (
            <Form
              onSubmit={async (f, form) => {
                const file = f.get("file") as File;
                if (!file?.size) return;
                setBusy(true);
                const path = `${item.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                const up = await supabase!.storage
                  .from("research-files")
                  .upload(path, file);
                if (up.error) {
                  setMessage(up.error.message);
                  setBusy(false);
                  return;
                }
                await run(() =>
                  supabase!
                    .from("research_documents")
                    .insert({
                      research_id: item.id,
                      title: f.get("title"),
                      category: f.get("category"),
                      restricted: f.get("restricted") === "on",
                      storage_path: path,
                      uploaded_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "اسم الوثيقة" : "Document title"}
              />
              <Field
                name="category"
                label={lang === "ar" ? "التصنيف" : "Category"}
              />
              <label>
                <input name="restricted" type="checkbox" />
                {t.restricted}
              </label>
              <label>
                {lang === "ar" ? "الملف" : "File"}
                <input name="file" type="file" required />
              </label>
            </Form>
          )}
        </section>
      )}

      {tab === "activity" && (
        <section className="project-list">
          <h2>{t.activity}</h2>
          {activity.map((x) => (
            <article key={x.id}>
              <div>
                <b>
                  {x.action} · {x.entity_type}
                </b>
                <small>
                  {person(x.actor_id)} ·{" "}
                  {new Date(x.created_at).toLocaleString()}
                </small>
              </div>
              <code>{x.entity_id}</code>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

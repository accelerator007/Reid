import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import "./projects.css";
import "./project-permissions.css";

type Lang = "ar" | "en";
type Tab =
  | "overview"
  | "kanban"
  | "milestones"
  | "meetings"
  | "files"
  | "kpis"
  | "activity";
type Project = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  manager_id: string | null;
  client_name: string | null;
  status: string;
  budget: number | null;
  currency: string;
  github_repo: string | null;
  start_date: string | null;
  target_date: string | null;
  archived_at: string | null;
};
type Person = { id: string; full_name: string; email: string };
type Member = { project_id: string; user_id: string; member_role: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assignee_id: string | null;
  due_at: string | null;
};
type Milestone = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
};
type Meeting = {
  id: string;
  title: string;
  agenda: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
};
type FileRow = {
  id: string;
  title: string;
  storage_path: string;
  category: string;
  restricted: boolean;
  uploaded_by: string;
  created_at: string;
};
type FilePermission = {
  id: string;
  file_id: string;
  user_id: string | null;
  role: string | null;
  can_read: boolean;
  can_write: boolean;
};
type Kpi = {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
};
type Activity = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, string>;
  created_at: string;
};
const types = ["internal", "client", "research", "product", "competition"],
  columns = ["todo", "in_progress", "review", "done"];
const copy = {
  ar: {
    title: "المشاريع",
    new: "مشروع جديد",
    overview: "نظرة عامة",
    kanban: "المهام",
    milestones: "المراحل",
    meetings: "الاجتماعات",
    files: "الملفات",
    kpis: "KPIs",
    activity: "النشاط",
    back: "كل المشاريع",
    save: "حفظ",
  },
  en: {
    title: "Projects",
    new: "New project",
    overview: "Overview",
    kanban: "Kanban",
    milestones: "Milestones",
    meetings: "Meetings",
    files: "Files",
    kpis: "KPIs",
    activity: "Activity",
    back: "All projects",
    save: "Save",
  },
};

export function ProjectWorkspace({ lang, user }: { lang: Lang; user: User }) {
  const t = copy[lang],
    [roles, setRoles] = React.useState<string[]>([]),
    [projects, setProjects] = React.useState<Project[]>([]),
    [people, setPeople] = React.useState<Person[]>([]),
    [selected, setSelected] = React.useState<string | null>(
      location.pathname.split("/")[2] || null,
    ),
    [tab, setTab] = React.useState<Tab>("overview"),
    [showArchived, setShowArchived] = React.useState(false),
    [members, setMembers] = React.useState<Member[]>([]),
    [tasks, setTasks] = React.useState<Task[]>([]),
    [milestones, setMilestones] = React.useState<Milestone[]>([]),
    [meetings, setMeetings] = React.useState<Meeting[]>([]),
    [files, setFiles] = React.useState<FileRow[]>([]),
    [filePermissions, setFilePermissions] = React.useState<FilePermission[]>(
      [],
    ),
    [kpis, setKpis] = React.useState<Kpi[]>([]),
    [activity, setActivity] = React.useState<Activity[]>([]),
    [message, setMessage] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const admin = roles.some((r) =>
      ["owner", "super_admin", "admin"].includes(r),
    ),
    project = projects.find((p) => p.id === selected),
    manager =
      admin ||
      project?.manager_id === user.id ||
      members.some(
        (m) =>
          m.user_id === user.id && ["manager", "lead"].includes(m.member_role),
      );
  const person = (id: string | null) =>
    people.find((p) => p.id === id)?.full_name || "—";
  const loadProjects = React.useCallback(async () => {
    if (!supabase) return;
    const [r, p] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("profiles").select("id,full_name,email").order("full_name"),
    ]);
    setRoles(r.data?.map((x) => x.role) || []);
    setPeople((p.data || []) as Person[]);
    const q = await supabase
      .from("projects")
      .select(
        "id,name,type,description,manager_id,client_name,status,budget,currency,github_repo,start_date,target_date,archived_at",
      )
      .order("updated_at", { ascending: false });
    setProjects((q.data || []) as Project[]);
    if (q.error) setMessage(q.error.message);
  }, [user.id]);
  const loadProject = React.useCallback(async () => {
    if (!supabase || !selected) return;
    const [m, ta, mi, me, f, fp, k, a] = await Promise.all([
      supabase
        .from("project_members")
        .select("project_id,user_id,member_role")
        .eq("project_id", selected),
      supabase
        .from("tasks")
        .select("id,title,description,status,priority,assignee_id,due_at")
        .eq("project_id", selected)
        .order("created_at"),
      supabase
        .from("project_milestones")
        .select("id,title,description,due_date,status")
        .eq("project_id", selected)
        .order("due_date"),
      supabase
        .from("project_meetings")
        .select("id,title,agenda,starts_at,ends_at,location,notes")
        .eq("project_id", selected)
        .order("starts_at"),
      supabase
        .from("project_files")
        .select(
          "id,title,storage_path,category,restricted,uploaded_by,created_at",
        )
        .eq("project_id", selected)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_file_permissions")
        .select("id,file_id,user_id,role,can_read,can_write"),
      supabase
        .from("project_kpis")
        .select("id,title,target_value,current_value,unit,status")
        .eq("project_id", selected),
      supabase
        .from("project_activity")
        .select("id,actor_id,action,entity_type,entity_id,details,created_at")
        .eq("project_id", selected)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setMembers((m.data || []) as Member[]);
    setTasks((ta.data || []) as Task[]);
    setMilestones((mi.data || []) as Milestone[]);
    setMeetings((me.data || []) as Meeting[]);
    setFiles((f.data || []) as FileRow[]);
    setFilePermissions((fp.data || []) as FilePermission[]);
    setKpis((k.data || []) as Kpi[]);
    setActivity((a.data || []) as Activity[]);
    const err = [m, ta, mi, me, f, fp, k, a].find((x) => x.error)?.error;
    if (err) setMessage(err.message);
  }, [selected]);
  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  React.useEffect(() => {
    void loadProject();
  }, [loadProject]);
  React.useEffect(() => {
    if (!supabase || !selected) return;
    const c = supabase
      .channel(`project:${selected}`)
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        void loadProjects();
        void loadProject();
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(c);
    };
  }, [selected, loadProject, loadProjects]);
  const run = async (
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    setBusy(true);
    setMessage("");
    const { error } = await fn();
    setMessage(error?.message || (lang === "ar" ? "تم الحفظ." : "Saved."));
    setBusy(false);
    if (!error) {
      await loadProjects();
      await loadProject();
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
  }: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    value?: string | null;
  }) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value || ""}
      />
    </label>
  );
  const open = (id: string) => {
      history.pushState({}, "", `/projects/${id}`);
      setSelected(id);
      setTab("overview");
      scrollTo(0, 0);
    },
    back = () => {
      history.pushState({}, "", "/projects");
      setSelected(null);
    };

  if (!project)
    return (
      <main className="projects-page">
        <header className="projects-heading">
          <div>
            <span>REID PROJECTS</span>
            <h1>{t.title}</h1>
          </div>
          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {lang === "ar" ? "عرض المؤرشفة" : "Show archived"}
          </label>
        </header>
        {message && (
          <p role="status" className="workspace-message">
            {message}
          </p>
        )}
        <section className="project-cards">
          {projects
            .filter((p) => (showArchived ? !!p.archived_at : !p.archived_at))
            .map((p) => (
              <button key={p.id} onClick={() => open(p.id)}>
                <i>{p.type.slice(0, 1).toUpperCase()}</i>
                <div>
                  <small>
                    {p.type} · {p.status}
                  </small>
                  <h2>{p.name}</h2>
                  <p>{p.description || "—"}</p>
                  <span>
                    {person(p.manager_id)} · {p.target_date || "—"}
                  </span>
                </div>
              </button>
            ))}
        </section>
        {admin && (
          <section className="project-create">
            <h2>{t.new}</h2>
            <Form
              onSubmit={async (f, form) => {
                setBusy(true);
                const { data, error } = await supabase!
                  .from("projects")
                  .insert({
                    name: f.get("name"),
                    type: f.get("type"),
                    description: f.get("description"),
                    manager_id: f.get("manager_id"),
                    client_name: f.get("client_name") || null,
                    status: "planning",
                    budget: Number(f.get("budget") || 0),
                    currency: f.get("currency"),
                    github_repo: f.get("github_repo") || null,
                    start_date: f.get("start_date") || null,
                    target_date: f.get("target_date") || null,
                  })
                  .select("id")
                  .single();
                if (!error && data)
                  await supabase!
                    .from("project_members")
                    .insert({
                      project_id: data.id,
                      user_id: f.get("manager_id"),
                      member_role: "manager",
                    });
                setMessage(
                  error?.message ||
                    (lang === "ar" ? "تم إنشاء المشروع." : "Project created."),
                );
                setBusy(false);
                form.reset();
                await loadProjects();
                if (data) open(data.id);
              }}
            >
              <Field
                name="name"
                label={lang === "ar" ? "اسم المشروع" : "Project name"}
              />
              <label>
                {lang === "ar" ? "النوع" : "Type"}
                <select name="type">
                  {types.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <Field
                name="description"
                label={lang === "ar" ? "الوصف" : "Description"}
              />
              <label>
                {lang === "ar" ? "المدير" : "Manager"}
                <select name="manager_id">
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="client_name"
                label={lang === "ar" ? "العميل" : "Client"}
                required={false}
              />
              <Field
                name="budget"
                label={lang === "ar" ? "الميزانية" : "Budget"}
                type="number"
                required={false}
              />
              <Field
                name="currency"
                label={lang === "ar" ? "العملة" : "Currency"}
                value="OMR"
              />
              <Field
                name="github_repo"
                label="GitHub URL"
                type="url"
                required={false}
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
            </Form>
          </section>
        )}
      </main>
    );

  const tabs: Tab[] = [
    "overview",
    "kanban",
    "milestones",
    "meetings",
    "files",
    "kpis",
    "activity",
  ];
  return (
    <main className="project-dashboard">
      <button className="project-back" onClick={back}>
        ← {t.back}
      </button>
      <section className="project-hero">
        <div>
          <small>
            {project.type} · {project.status}
          </small>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <div>
          <b>
            {project.budget || 0} {project.currency}
          </b>
          <span>{person(project.manager_id)}</span>
          {project.github_repo && (
            <a href={project.github_repo} target="_blank" rel="noreferrer">
              GitHub ↗
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
            <small>{lang === "ar" ? "الأعضاء" : "Members"}</small>
            <b>{members.length}</b>
          </article>
          <article>
            <small>{lang === "ar" ? "المهام المفتوحة" : "Open tasks"}</small>
            <b>{tasks.filter((x) => x.status !== "done").length}</b>
          </article>
          <article>
            <small>{lang === "ar" ? "المراحل المكتملة" : "Milestones"}</small>
            <b>
              {milestones.filter((x) => x.status === "completed").length}/
              {milestones.length}
            </b>
          </article>
          <article>
            <small>KPIs</small>
            <b>
              {kpis.filter((x) => x.status === "achieved").length}/{kpis.length}
            </b>
          </article>
          <div className="project-panel">
            <h2>{lang === "ar" ? "الفريق" : "Team"}</h2>
            {members.map((m) => (
              <p key={m.user_id}>
                <b>{person(m.user_id)}</b>
                <span>{m.member_role}</span>
                {manager && m.user_id !== project.manager_id && (
                  <button
                    onClick={() =>
                      run(() =>
                        supabase!
                          .from("project_members")
                          .delete()
                          .eq("project_id", project.id)
                          .eq("user_id", m.user_id),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </p>
            ))}
            {manager && (
              <Form
                onSubmit={async (f, form) => {
                  await run(() =>
                    supabase!
                      .from("project_members")
                      .insert({
                        project_id: project.id,
                        user_id: f.get("user_id"),
                        member_role: f.get("role"),
                      }),
                  );
                  form.reset();
                }}
              >
                <label>
                  {lang === "ar" ? "عضو" : "Member"}
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
                <label>
                  {lang === "ar" ? "الدور" : "Role"}
                  <select name="role">
                    <option value="member">member</option>
                    <option value="lead">lead</option>
                    <option value="manager">manager</option>
                    <option value="client">client</option>
                  </select>
                </label>
              </Form>
            )}
          </div>
          {manager && (
            <div className="project-panel">
              <h2>{lang === "ar" ? "إعدادات المشروع" : "Project settings"}</h2>
              <Form
                onSubmit={async (f) =>
                  run(() =>
                    supabase!
                      .from("projects")
                      .update({
                        name: f.get("name"),
                        description: f.get("description"),
                        status: f.get("status"),
                        budget: Number(f.get("budget") || 0),
                        client_name: f.get("client_name") || null,
                        github_repo: f.get("github_repo") || null,
                        target_date: f.get("target_date") || null,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", project.id),
                  )
                }
              >
                <Field
                  name="name"
                  label={lang === "ar" ? "الاسم" : "Name"}
                  value={project.name}
                />
                <Field
                  name="description"
                  label={lang === "ar" ? "الوصف" : "Description"}
                  value={project.description}
                />
                <label>
                  {lang === "ar" ? "الحالة" : "Status"}
                  <select name="status" defaultValue={project.status}>
                    <option value="planning">planning</option>
                    <option value="active">active</option>
                    <option value="on_hold">on hold</option>
                    <option value="completed">completed</option>
                  </select>
                </label>
                <Field
                  name="budget"
                  label={lang === "ar" ? "الميزانية" : "Budget"}
                  type="number"
                  value={String(project.budget || 0)}
                />
                <Field
                  name="client_name"
                  label={lang === "ar" ? "العميل" : "Client"}
                  value={project.client_name}
                />
                <Field
                  name="github_repo"
                  label="GitHub"
                  type="url"
                  required={false}
                  value={project.github_repo}
                />
                <Field
                  name="target_date"
                  label={lang === "ar" ? "الموعد" : "Target"}
                  type="date"
                  required={false}
                  value={project.target_date}
                />
              </Form>
              <button
                className="archive"
                onClick={() =>
                  run(() =>
                    supabase!
                      .from("projects")
                      .update({
                        archived_at: project.archived_at
                          ? null
                          : new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", project.id),
                  )
                }
              >
                {project.archived_at
                  ? lang === "ar"
                    ? "إلغاء الأرشفة"
                    : "Unarchive"
                  : lang === "ar"
                    ? "أرشفة المشروع"
                    : "Archive project"}
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "kanban" && (
        <section className="kanban">
          {columns.map((c) => (
            <div key={c}>
              <h2>{c.replace("_", " ")}</h2>
              {tasks
                .filter((x) => x.status === c)
                .map((x) => (
                  <article key={x.id}>
                    <b>{x.title}</b>
                    <p>{x.description}</p>
                    <small>
                      {person(x.assignee_id)} · P{x.priority}
                    </small>
                    {manager && (
                      <select
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
                        {columns.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
            </div>
          ))}
          {manager && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("tasks")
                    .insert({
                      project_id: project.id,
                      title: f.get("title"),
                      description: f.get("description"),
                      assignee_id: f.get("assignee_id") || null,
                      priority: Number(f.get("priority")),
                      created_by: user.id,
                      status: "todo",
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "مهمة جديدة" : "New task"}
              />
              <Field
                name="description"
                label={lang === "ar" ? "التفاصيل" : "Details"}
              />
              <label>
                {lang === "ar" ? "المكلّف" : "Assignee"}
                <select name="assignee_id">
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {person(m.user_id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {lang === "ar" ? "الأولوية" : "Priority"}
                <select name="priority" defaultValue="2">
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </label>
            </Form>
          )}
        </section>
      )}
      {tab === "milestones" && (
        <section className="project-list">
          <h2>{t.milestones}</h2>
          {milestones.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <p>{x.description}</p>
              </div>
              <span>
                {x.status} · {x.due_date || "—"}
              </span>
            </article>
          ))}
          {manager && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("project_milestones")
                    .insert({
                      project_id: project.id,
                      title: f.get("title"),
                      description: f.get("description"),
                      due_date: f.get("due_date") || null,
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "المرحلة" : "Milestone"}
              />
              <Field
                name="description"
                label={lang === "ar" ? "الوصف" : "Description"}
              />
              <Field
                name="due_date"
                label={lang === "ar" ? "الموعد" : "Due"}
                type="date"
              />
            </Form>
          )}
        </section>
      )}
      {tab === "meetings" && (
        <section className="project-list">
          <h2>{t.meetings}</h2>
          {meetings.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <p>{x.agenda}</p>
                <small>{x.location}</small>
              </div>
              <span>{new Date(x.starts_at).toLocaleString()}</span>
            </article>
          ))}
          {manager && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("project_meetings")
                    .insert({
                      project_id: project.id,
                      title: f.get("title"),
                      agenda: f.get("agenda"),
                      starts_at: f.get("starts_at"),
                      ends_at: f.get("ends_at"),
                      location: f.get("location"),
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="title"
                label={lang === "ar" ? "الاجتماع" : "Meeting"}
              />
              <Field
                name="agenda"
                label={lang === "ar" ? "جدول الأعمال" : "Agenda"}
              />
              <Field
                name="starts_at"
                label={lang === "ar" ? "البداية" : "Starts"}
                type="datetime-local"
              />
              <Field
                name="ends_at"
                label={lang === "ar" ? "النهاية" : "Ends"}
                type="datetime-local"
              />
              <Field
                name="location"
                label={lang === "ar" ? "المكان/الرابط" : "Location/link"}
              />
            </Form>
          )}
        </section>
      )}
      {tab === "files" && (
        <section className="project-list">
          <h2>{t.files}</h2>
          {files.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.category} · {x.restricted ? "restricted" : "members"}
                </small>
                {x.restricted && (
                  <div className="file-permissions">
                    {filePermissions
                      .filter((p) => p.file_id === x.id)
                      .map((p) => (
                        <span key={p.id}>
                          {p.user_id ? person(p.user_id) : p.role} ·{" "}
                          {p.can_write ? "read/write" : "read"}
                          {manager && (
                            <button
                              aria-label={
                                lang === "ar"
                                  ? "إزالة الصلاحية"
                                  : "Remove permission"
                              }
                              onClick={() =>
                                run(() =>
                                  supabase!
                                    .from("project_file_permissions")
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
                {manager && x.restricted && (
                  <select
                    aria-label={
                      lang === "ar" ? "إضافة صلاحية ملف" : "Add file permission"
                    }
                    defaultValue=""
                    onChange={async (e) => {
                      const [kind, value, mode] = e.target.value.split(":");
                      if (!value) return;
                      await run(() =>
                        supabase!
                          .from("project_file_permissions")
                          .insert({
                            file_id: x.id,
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
                    <option value="">
                      {lang === "ar" ? "منح صلاحية…" : "Grant permission…"}
                    </option>
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
                    {[
                      "owner",
                      "super_admin",
                      "admin",
                      "hr",
                      "sales",
                      "employee",
                      "project_member",
                      "research_member",
                      "guest",
                    ].map((r) => (
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
                    .from("project-files")
                    .createSignedUrl(x.storage_path, 60);
                  setMessage(error?.message || "");
                  if (data?.signedUrl) openWindow(data.signedUrl);
                }}
              >
                {lang === "ar" ? "فتح آمن" : "Secure open"}
              </button>
            </article>
          ))}
          {manager && (
            <Form
              onSubmit={async (f, form) => {
                const file = f.get("file") as File;
                if (!file?.size) return;
                setBusy(true);
                const path = `${project.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                const up = await supabase!.storage
                  .from("project-files")
                  .upload(path, file);
                if (up.error) {
                  setMessage(up.error.message);
                  setBusy(false);
                  return;
                }
                await run(() =>
                  supabase!
                    .from("project_files")
                    .insert({
                      project_id: project.id,
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
                label={lang === "ar" ? "اسم الملف" : "File title"}
              />
              <Field
                name="category"
                label={lang === "ar" ? "التصنيف" : "Category"}
              />
              <label>
                <input name="restricted" type="checkbox" />
                {lang === "ar"
                  ? "مقيد — يحتاج صلاحية ملف"
                  : "Restricted — explicit permission"}
              </label>
              <label>
                {lang === "ar" ? "الملف" : "File"}
                <input name="file" type="file" required />
              </label>
            </Form>
          )}
        </section>
      )}
      {tab === "kpis" && (
        <section className="project-list">
          <h2>KPIs</h2>
          {kpis.map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>{x.status}</small>
              </div>
              <strong>
                {x.current_value}/{x.target_value} {x.unit}
              </strong>
            </article>
          ))}
          {manager && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("project_kpis")
                    .insert({
                      project_id: project.id,
                      title: f.get("title"),
                      target_value: Number(f.get("target")),
                      current_value: Number(f.get("current")),
                      unit: f.get("unit"),
                      status:
                        Number(f.get("current")) >= Number(f.get("target"))
                          ? "achieved"
                          : "on_track",
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field name="title" label="KPI" />
              <Field
                name="target"
                label={lang === "ar" ? "الهدف" : "Target"}
                type="number"
              />
              <Field
                name="current"
                label={lang === "ar" ? "الحالي" : "Current"}
                type="number"
              />
              <Field name="unit" label={lang === "ar" ? "الوحدة" : "Unit"} />
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
function openWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

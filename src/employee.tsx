import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import "./employee.css";

type Lang = "ar" | "en";
type Section =
  | "overview"
  | "people"
  | "onboarding"
  | "tasks"
  | "calendar"
  | "announcements"
  | "notifications"
  | "documents"
  | "performance"
  | "timesheets";
type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: string | null;
  department_id: string | null;
  hire_date: string | null;
  employment_status: string;
};
type Department = {
  id: string;
  name_ar: string;
  name_en: string;
  description: string | null;
  manager_id: string | null;
};
type Onboarding = {
  id: string;
  user_id: string;
  title_ar: string;
  title_en: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assignee_id: string | null;
  due_at: string | null;
};
type Event = {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  visibility: string;
};
type Announcement = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  published_at: string;
};
type Notice = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  read_at: string | null;
  created_at: string;
};
type Document = {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  storage_path: string;
  created_at: string;
};
type Kpi = {
  id: string;
  user_id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  period_start: string;
  period_end: string;
  status: string;
};
type Review = {
  id: string;
  user_id: string;
  reviewer_id: string;
  period_start: string;
  period_end: string;
  rating: number;
  summary: string;
  strengths: string | null;
  improvements: string | null;
};
type Timesheet = {
  id: string;
  user_id: string;
  task_id: string | null;
  minutes: number;
  work_date: string;
  notes: string | null;
};

const labels = {
  ar: {
    title: "مساحة عمل الموظفين",
    overview: "نظرة عامة",
    people: "الموظفون",
    onboarding: "التهيئة",
    tasks: "المهام",
    calendar: "التقويم",
    announcements: "الإعلانات",
    notifications: "الإشعارات",
    documents: "المستندات",
    performance: "الأداء وKPIs",
    timesheets: "ساعات العمل",
  },
  en: {
    title: "Employee workspace",
    overview: "Overview",
    people: "People",
    onboarding: "Onboarding",
    tasks: "Tasks",
    calendar: "Calendar",
    announcements: "Announcements",
    notifications: "Notifications",
    documents: "Documents",
    performance: "Performance & KPIs",
    timesheets: "Working hours",
  },
};
const sections: Section[] = [
  "overview",
  "people",
  "onboarding",
  "tasks",
  "calendar",
  "announcements",
  "notifications",
  "documents",
  "performance",
  "timesheets",
];
const today = () => new Date().toISOString().slice(0, 10);
const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function EmployeeWorkspace({
  lang,
  user,
  profile,
}: {
  lang: Lang;
  user: User;
  profile: () => void;
}) {
  const t = labels[lang],
    [section, setSection] = React.useState<Section>("overview"),
    [roles, setRoles] = React.useState<string[]>([]),
    [people, setPeople] = React.useState<Profile[]>([]),
    [departments, setDepartments] = React.useState<Department[]>([]),
    [onboarding, setOnboarding] = React.useState<Onboarding[]>([]),
    [tasks, setTasks] = React.useState<Task[]>([]),
    [events, setEvents] = React.useState<Event[]>([]),
    [announcements, setAnnouncements] = React.useState<Announcement[]>([]),
    [notices, setNotices] = React.useState<Notice[]>([]),
    [documents, setDocuments] = React.useState<Document[]>([]),
    [kpis, setKpis] = React.useState<Kpi[]>([]),
    [reviews, setReviews] = React.useState<Review[]>([]),
    [timesheets, setTimesheets] = React.useState<Timesheet[]>([]),
    [selected, setSelected] = React.useState(user.id),
    [message, setMessage] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const staff = roles.some((r) =>
    ["owner", "super_admin", "admin", "hr"].includes(r),
  );
  const selectedProfile =
    people.find((p) => p.id === selected) ||
    people.find((p) => p.id === user.id);
  const managedDepartmentIds = departments
    .filter((department) => department.manager_id === user.id)
    .map((department) => department.id);
  const canManageSelected =
    staff ||
    (!!selectedProfile?.department_id &&
      managedDepartmentIds.includes(selectedProfile.department_id));

  const refresh = React.useCallback(async () => {
    if (!supabase) return;
    const roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const nextRoles = roleResult.data?.map((x) => x.role) || [];
    setRoles(nextRoles);
    const privileged = nextRoles.some((r) =>
      ["owner", "super_admin", "admin", "hr"].includes(r),
    );
    const [p, d, o, ta, e, a, n, doc, k, r, ts] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id,full_name,email,phone,position,department,department_id,hire_date,employment_status",
        )
        .order("full_name"),
      supabase
        .from("departments")
        .select("id,name_ar,name_en,description,manager_id")
        .eq("active", true)
        .order("name_en"),
      supabase
        .from("onboarding_items")
        .select("id,user_id,title_ar,title_en,due_date,completed,completed_at")
        .order("sort_order"),
      supabase
        .from("tasks")
        .select("id,title,description,status,priority,assignee_id,due_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("calendar_events")
        .select("id,user_id,title,description,starts_at,ends_at,visibility")
        .gte("ends_at", new Date(Date.now() - 86400000).toISOString())
        .order("starts_at"),
      supabase
        .from("announcements")
        .select("id,title_ar,title_en,body_ar,body_en,published_at")
        .order("published_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id,title_ar,title_en,body_ar,body_en,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("employee_documents")
        .select("id,owner_id,title,category,storage_path,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("employee_kpis")
        .select(
          "id,user_id,title,target_value,current_value,unit,period_start,period_end,status",
        )
        .order("period_end", { ascending: false }),
      supabase
        .from("performance_reviews")
        .select(
          "id,user_id,reviewer_id,period_start,period_end,rating,summary,strengths,improvements",
        )
        .order("period_end", { ascending: false }),
      supabase
        .from("timesheets")
        .select("id,user_id,task_id,minutes,work_date,notes")
        .order("work_date", { ascending: false })
        .limit(privileged ? 300 : 100),
    ]);
    const failures = [p, d, o, ta, e, a, n, doc, k, r, ts]
      .map((x) => x.error?.message)
      .filter(Boolean);
    if (failures.length) setMessage(failures[0] || "");
    setPeople((p.data || []) as Profile[]);
    setDepartments((d.data || []) as Department[]);
    setOnboarding((o.data || []) as Onboarding[]);
    setTasks((ta.data || []) as Task[]);
    setEvents((e.data || []) as Event[]);
    setAnnouncements((a.data || []) as Announcement[]);
    setNotices((n.data || []) as Notice[]);
    setDocuments((doc.data || []) as Document[]);
    setKpis((k.data || []) as Kpi[]);
    setReviews((r.data || []) as Review[]);
    setTimesheets((ts.data || []) as Timesheet[]);
  }, [user.id]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  React.useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`employee-workspace:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [refresh, user.id]);

  const run = async (
    action: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    setBusy(true);
    setMessage("");
    const { error } = await action();
    setMessage(error?.message || (lang === "ar" ? "تم الحفظ." : "Saved."));
    setBusy(false);
    if (!error) await refresh();
  };
  const Form = ({
    children,
    onSubmit,
    className = "",
  }: {
    children: React.ReactNode;
    onSubmit: (f: FormData, form: HTMLFormElement) => Promise<void> | void;
    className?: string;
  }) => (
    <form
      className={`employee-form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(new FormData(e.currentTarget), e.currentTarget);
      }}
    >
      {children}
      <button className="primary" disabled={busy}>
        {lang === "ar" ? "حفظ" : "Save"}
      </button>
    </form>
  );
  const Field = ({
    name,
    label,
    type = "text",
    required = true,
  }: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
  }) => (
    <label>
      {label}
      <input name={name} type={type} required={required} />
    </label>
  );
  const scoped = <T extends object>(rows: T[]) =>
    rows.filter((row) => {
      const x = row as {
        user_id?: string;
        owner_id?: string;
        assignee_id?: string;
      };
      const rowUser = x.user_id || x.owner_id || x.assignee_id;
      return rowUser === (canManageSelected ? selected : user.id);
    });
  const selectedMinutes = scoped(timesheets).reduce(
    (sum, x) => sum + x.minutes,
    0,
  );

  return (
    <main className="employee-workspace">
      <div className="workspace-heading">
        <div>
          <span>REID PEOPLE</span>
          <h1>{t.title}</h1>
          <p>
            {selectedProfile?.full_name} · {roles.join(" · ")}
          </p>
        </div>
        <button onClick={profile}>
          {lang === "ar" ? "ملفي الشخصي" : "My profile"}
        </button>
      </div>
      <nav className="workspace-tabs" aria-label={t.title}>
        {sections.map((s) => (
          <button
            key={s}
            className={section === s ? "active" : ""}
            onClick={() => setSection(s)}
          >
            {t[s]}
          </button>
        ))}
      </nav>
      {message && (
        <p className="workspace-message" role="status">
          {message}
        </p>
      )}

      {section === "overview" && (
        <section className="employee-overview">
          <article>
            <small>{lang === "ar" ? "الموظفون" : "Employees"}</small>
            <b>{people.length}</b>
          </article>
          <article>
            <small>{lang === "ar" ? "المهام المفتوحة" : "Open tasks"}</small>
            <b>{scoped(tasks).filter((x) => x.status !== "done").length}</b>
          </article>
          <article>
            <small>
              {lang === "ar" ? "التهيئة المكتملة" : "Onboarding complete"}
            </small>
            <b>
              {Math.round(
                (scoped(onboarding).filter((x) => x.completed).length /
                  Math.max(scoped(onboarding).length, 1)) *
                  100,
              )}
              %
            </b>
          </article>
          <article>
            <small>{lang === "ar" ? "ساعات مسجلة" : "Logged hours"}</small>
            <b>{hours(selectedMinutes)}</b>
          </article>
          <div className="overview-feed">
            <h2>{lang === "ar" ? "آخر الإعلانات" : "Latest announcements"}</h2>
            {announcements.slice(0, 3).map((x) => (
              <article key={x.id}>
                <b>{lang === "ar" ? x.title_ar : x.title_en}</b>
                <p>{lang === "ar" ? x.body_ar : x.body_en}</p>
              </article>
            ))}
          </div>
          <div className="overview-feed">
            <h2>{lang === "ar" ? "القادم" : "Upcoming"}</h2>
            {events.slice(0, 4).map((x) => (
              <article key={x.id}>
                <b>{x.title}</b>
                <p>
                  {new Date(x.starts_at).toLocaleString(
                    lang === "ar" ? "ar-OM" : "en-OM",
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {section === "people" && (
        <section className="workspace-grid">
          <aside className="people-list">
            <h2>{lang === "ar" ? "دليل الموظفين" : "Employee directory"}</h2>
            {people.map((p) => (
              <button
                key={p.id}
                className={selected === p.id ? "selected" : ""}
                onClick={() => setSelected(p.id)}
              >
                <b>{p.full_name}</b>
                <small>
                  {p.position || "—"} ·{" "}
                  {departments.find((d) => d.id === p.department_id)?.[
                    lang === "ar" ? "name_ar" : "name_en"
                  ] ||
                    p.department ||
                    "—"}
                </small>
              </button>
            ))}
          </aside>
          <article className="employee-detail">
            <div className="avatar">
              {selectedProfile?.full_name?.slice(0, 1) || "R"}
            </div>
            <h2>{selectedProfile?.full_name}</h2>
            <p>{selectedProfile?.email}</p>
            <dl>
              <div>
                <dt>{lang === "ar" ? "المسمى" : "Position"}</dt>
                <dd>{selectedProfile?.position || "—"}</dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "القسم" : "Department"}</dt>
                <dd>
                  {departments.find(
                    (d) => d.id === selectedProfile?.department_id,
                  )?.[lang === "ar" ? "name_ar" : "name_en"] ||
                    selectedProfile?.department ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "الحالة" : "Status"}</dt>
                <dd>{selectedProfile?.employment_status}</dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "تاريخ الانضمام" : "Hire date"}</dt>
                <dd>{selectedProfile?.hire_date || "—"}</dd>
              </div>
            </dl>
            {staff && selectedProfile && (
              <Form
                onSubmit={async (f) =>
                  run(() =>
                    supabase!
                      .from("profiles")
                      .update({
                        department_id: String(f.get("department_id")) || null,
                        position: String(f.get("position")),
                        hire_date: String(f.get("hire_date")) || null,
                        employment_status: String(f.get("employment_status")),
                      })
                      .eq("id", selectedProfile.id),
                  )
                }
              >
                <label>
                  {lang === "ar" ? "القسم" : "Department"}
                  <select
                    name="department_id"
                    defaultValue={selectedProfile.department_id || ""}
                  >
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {lang === "ar" ? d.name_ar : d.name_en}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  name="position"
                  label={lang === "ar" ? "المسمى" : "Position"}
                  required={false}
                />
                <Field
                  name="hire_date"
                  label={lang === "ar" ? "تاريخ الانضمام" : "Hire date"}
                  type="date"
                  required={false}
                />
                <label>
                  {lang === "ar" ? "الحالة" : "Status"}
                  <select
                    name="employment_status"
                    defaultValue={selectedProfile.employment_status}
                  >
                    <option value="active">active</option>
                    <option value="onboarding">onboarding</option>
                    <option value="leave">leave</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
              </Form>
            )}
          </article>
          {staff && (
            <article className="workspace-admin-form">
              <h2>{lang === "ar" ? "إضافة قسم" : "Add department"}</h2>
              <Form
                onSubmit={async (f, form) => {
                  await run(() =>
                    supabase!
                      .from("departments")
                      .insert({
                        name_ar: f.get("name_ar"),
                        name_en: f.get("name_en"),
                        description: f.get("description"),
                      }),
                  );
                  form.reset();
                }}
              >
                <Field name="name_ar" label="الاسم العربي" />
                <Field name="name_en" label="English name" />
                <Field
                  name="description"
                  label={lang === "ar" ? "الوصف" : "Description"}
                  required={false}
                />
              </Form>
            </article>
          )}
        </section>
      )}

      {section === "onboarding" && (
        <section className="module-list">
          <header>
            <h2>{t.onboarding}</h2>
            <b>
              {scoped(onboarding).filter((x) => x.completed).length}/
              {scoped(onboarding).length}
            </b>
          </header>
          {scoped(onboarding).map((x) => (
            <article key={x.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={x.completed}
                  onChange={() =>
                    run(() =>
                      supabase!
                        .from("onboarding_items")
                        .update({
                          completed: !x.completed,
                          completed_at: x.completed
                            ? null
                            : new Date().toISOString(),
                        })
                        .eq("id", x.id),
                    )
                  }
                />
                <span>
                  <b>{lang === "ar" ? x.title_ar : x.title_en}</b>
                  <small>{x.due_date || "—"}</small>
                </span>
              </label>
            </article>
          ))}
          {canManageSelected && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("onboarding_items")
                    .insert({
                      user_id: selected,
                      title_ar: f.get("title_ar"),
                      title_en: f.get("title_en"),
                      due_date: f.get("due_date") || null,
                      assigned_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field name="title_ar" label="المهمة بالعربية" />
              <Field name="title_en" label="Task in English" />
              <Field
                name="due_date"
                label={lang === "ar" ? "الاستحقاق" : "Due"}
                type="date"
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {section === "tasks" && (
        <section className="module-list">
          <h2>{t.tasks}</h2>
          {scoped(tasks).map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  P{x.priority} ·{" "}
                  {x.due_at ? new Date(x.due_at).toLocaleDateString() : "—"}
                </small>
                <p>{x.description}</p>
              </div>
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
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </article>
          ))}
          {canManageSelected && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("tasks")
                    .insert({
                      title: f.get("title"),
                      description: f.get("description"),
                      assignee_id: selected,
                      priority: Number(f.get("priority")),
                      due_at: f.get("due_at") || null,
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field name="title" label={lang === "ar" ? "المهمة" : "Task"} />
              <Field
                name="description"
                label={lang === "ar" ? "التفاصيل" : "Details"}
                required={false}
              />
              <label>
                {lang === "ar" ? "الأولوية" : "Priority"}
                <select name="priority" defaultValue="2">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <Field
                name="due_at"
                label={lang === "ar" ? "الاستحقاق" : "Due"}
                type="datetime-local"
                required={false}
              />
            </Form>
          )}
        </section>
      )}

      {section === "calendar" && (
        <section className="module-list">
          <h2>{t.calendar}</h2>
          {events
            .filter((x) => x.visibility === "company" || x.user_id === selected)
            .map((x) => (
              <article key={x.id}>
                <div>
                  <b>{x.title}</b>
                  <p>{x.description}</p>
                </div>
                <small>
                  {new Date(x.starts_at).toLocaleString(
                    lang === "ar" ? "ar-OM" : "en-OM",
                  )}{" "}
                  →{" "}
                  {new Date(x.ends_at).toLocaleString(
                    lang === "ar" ? "ar-OM" : "en-OM",
                  )}
                </small>
              </article>
            ))}
          {(staff || selected === user.id) && <Form
            onSubmit={async (f, form) => {
              await run(() =>
                supabase!
                  .from("calendar_events")
                  .insert({
                    user_id:
                      String(f.get("visibility")) === "company"
                        ? null
                        : selected,
                    title: f.get("title"),
                    description: f.get("description"),
                    starts_at: f.get("starts_at"),
                    ends_at: f.get("ends_at"),
                    visibility: f.get("visibility"),
                    created_by: user.id,
                  }),
              );
              form.reset();
            }}
          >
            <Field name="title" label={lang === "ar" ? "العنوان" : "Title"} />
            <Field
              name="description"
              label={lang === "ar" ? "التفاصيل" : "Details"}
              required={false}
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
            <label>
              {lang === "ar" ? "الظهور" : "Visibility"}
              <select name="visibility">
                <option value="private">Private</option>
                {staff && <option value="company">Company</option>}
              </select>
            </label>
          </Form>}
        </section>
      )}

      {section === "announcements" && (
        <section className="module-list">
          <h2>{t.announcements}</h2>
          {announcements.map((x) => (
            <article key={x.id}>
              <div>
                <b>{lang === "ar" ? x.title_ar : x.title_en}</b>
                <p>{lang === "ar" ? x.body_ar : x.body_en}</p>
              </div>
              <small>
                {new Date(x.published_at).toLocaleDateString(
                  lang === "ar" ? "ar-OM" : "en-OM",
                )}
              </small>
            </article>
          ))}
          {staff && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("announcements")
                    .insert({
                      title_ar: f.get("title_ar"),
                      title_en: f.get("title_en"),
                      body_ar: f.get("body_ar"),
                      body_en: f.get("body_en"),
                      created_by: user.id,
                    }),
                );
                form.reset();
              }}
            >
              <Field name="title_ar" label="العنوان العربي" />
              <Field name="title_en" label="English title" />
              <Field name="body_ar" label="النص العربي" />
              <Field name="body_en" label="English body" />
            </Form>
          )}
        </section>
      )}

      {section === "notifications" && (
        <section className="module-list">
          <header>
            <h2>{t.notifications}</h2>
            <b>{notices.filter((x) => !x.read_at).length}</b>
          </header>
          {notices.length ? (
            notices.map((x) => (
              <article key={x.id} className={x.read_at ? "" : "unread-notice"}>
                <div>
                  <b>{lang === "ar" ? x.title_ar : x.title_en}</b>
                  <p>{lang === "ar" ? x.body_ar : x.body_en}</p>
                  <small>
                    {new Date(x.created_at).toLocaleString(
                      lang === "ar" ? "ar-OM" : "en-OM",
                    )}
                  </small>
                </div>
                {!x.read_at && (
                  <button
                    onClick={() =>
                      run(() =>
                        supabase!
                          .from("notifications")
                          .update({ read_at: new Date().toISOString() })
                          .eq("id", x.id),
                      )
                    }
                  >
                    {lang === "ar" ? "تحديد كمقروء" : "Mark read"}
                  </button>
                )}
              </article>
            ))
          ) : (
            <p>{lang === "ar" ? "لا توجد إشعارات." : "No notifications."}</p>
          )}
        </section>
      )}

      {section === "documents" && (
        <section className="module-list">
          <h2>{t.documents}</h2>
          {scoped(documents).map((x) => (
            <article key={x.id}>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.category} · {new Date(x.created_at).toLocaleDateString()}
                </small>
              </div>
              <button
                onClick={async () => {
                  const { data, error } = await supabase!.storage
                    .from("employee-documents")
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
                {lang === "ar" ? "فتح آمن" : "Secure open"}
              </button>
            </article>
          ))}
          <Form
            onSubmit={async (f, form) => {
              const file = f.get("file") as File;
              if (!file?.size) return;
              setBusy(true);
              const path = `${selected}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
              const uploaded = await supabase!.storage
                .from("employee-documents")
                .upload(path, file);
              if (uploaded.error) {
                setMessage(uploaded.error.message);
                setBusy(false);
                return;
              }
              await run(() =>
                supabase!
                  .from("employee_documents")
                  .insert({
                    owner_id: selected,
                    title: f.get("title"),
                    category: f.get("category"),
                    storage_path: path,
                    uploaded_by: user.id,
                  }),
              );
              form.reset();
            }}
          >
            <Field
              name="title"
              label={lang === "ar" ? "اسم المستند" : "Document title"}
            />
            <label>
              {lang === "ar" ? "التصنيف" : "Category"}
              <select name="category">
                <option value="general">General</option>
                <option value="contract">Contract</option>
                <option value="certificate">Certificate</option>
                <option value="policy">Policy</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </label>
            <label>
              {lang === "ar" ? "الملف" : "File"}
              <input
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,text/plain"
                required
              />
            </label>
          </Form>
        </section>
      )}

      {section === "performance" && (
        <section className="performance-grid">
          <div className="module-list">
            <h2>KPIs</h2>
            {scoped(kpis).map((x) => (
              <article key={x.id}>
                <div>
                  <b>{x.title}</b>
                  <small>
                    {x.period_start} → {x.period_end}
                  </small>
                </div>
                <strong>
                  {x.current_value}/{x.target_value} {x.unit}
                </strong>
              </article>
            ))}
            {canManageSelected && (
              <Form
                onSubmit={async (f, form) => {
                  await run(() =>
                    supabase!
                      .from("employee_kpis")
                      .insert({
                        user_id: selected,
                        title: f.get("title"),
                        target_value: Number(f.get("target")),
                        current_value: Number(f.get("current")),
                        unit: f.get("unit"),
                        period_start: f.get("start"),
                        period_end: f.get("end"),
                        set_by: user.id,
                        status:
                          Number(f.get("current")) >= Number(f.get("target"))
                            ? "achieved"
                            : "on_track",
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
                <Field
                  name="start"
                  label={lang === "ar" ? "من" : "From"}
                  type="date"
                />
                <Field
                  name="end"
                  label={lang === "ar" ? "إلى" : "To"}
                  type="date"
                />
              </Form>
            )}
          </div>
          <div className="module-list">
            <h2>{lang === "ar" ? "مراجعات الأداء" : "Performance reviews"}</h2>
            {scoped(reviews).map((x) => (
              <article key={x.id}>
                <div>
                  <b>{x.rating}/5</b>
                  <p>{x.summary}</p>
                  <small>
                    {x.period_start} → {x.period_end}
                  </small>
                </div>
              </article>
            ))}
            {canManageSelected && (
              <Form
                onSubmit={async (f, form) => {
                  await run(() =>
                    supabase!
                      .from("performance_reviews")
                      .insert({
                        user_id: selected,
                        reviewer_id: user.id,
                        period_start: f.get("start"),
                        period_end: f.get("end"),
                        rating: Number(f.get("rating")),
                        summary: f.get("summary"),
                        strengths: f.get("strengths"),
                        improvements: f.get("improvements"),
                      }),
                  );
                  form.reset();
                }}
              >
                <Field
                  name="rating"
                  label={lang === "ar" ? "التقييم من 5" : "Rating / 5"}
                  type="number"
                />
                <Field
                  name="summary"
                  label={lang === "ar" ? "الملخص" : "Summary"}
                />
                <Field
                  name="strengths"
                  label={lang === "ar" ? "نقاط القوة" : "Strengths"}
                  required={false}
                />
                <Field
                  name="improvements"
                  label={lang === "ar" ? "التطوير" : "Improvements"}
                  required={false}
                />
                <Field
                  name="start"
                  label={lang === "ar" ? "من" : "From"}
                  type="date"
                />
                <Field
                  name="end"
                  label={lang === "ar" ? "إلى" : "To"}
                  type="date"
                />
              </Form>
            )}
          </div>
        </section>
      )}

      {section === "timesheets" && (
        <section className="module-list">
          <header>
            <h2>{t.timesheets}</h2>
            <b>{hours(selectedMinutes)}</b>
          </header>
          {scoped(timesheets).map((x) => (
            <article key={x.id}>
              <div>
                <b>{hours(x.minutes)}</b>
                <p>{x.notes}</p>
              </div>
              <small>{x.work_date}</small>
            </article>
          ))}
          {(!staff || selected === user.id) && (
            <Form
              onSubmit={async (f, form) => {
                await run(() =>
                  supabase!
                    .from("timesheets")
                    .insert({
                      user_id: user.id,
                      minutes: Number(f.get("minutes")),
                      work_date: f.get("work_date"),
                      notes: f.get("notes"),
                    }),
                );
                form.reset();
              }}
            >
              <Field
                name="minutes"
                label={lang === "ar" ? "الدقائق" : "Minutes"}
                type="number"
              />
              <Field
                name="work_date"
                label={lang === "ar" ? "التاريخ" : "Date"}
                type="date"
              />
              <Field
                name="notes"
                label={lang === "ar" ? "وصف العمل" : "Work notes"}
              />
            </Form>
          )}
        </section>
      )}
    </main>
  );
}

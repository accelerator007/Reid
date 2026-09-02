import React from "react";
import { createRoot } from "react-dom/client";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { installIdleTimeout } from "./session";
import "./style.css";
import "./auth.css";
import "./profile.css";
import "./workflow.css";

type Lang = "ar" | "en";
type Page =
  | "home"
  | "dashboard"
  | "apply"
  | "login"
  | "profile"
  | "privacy"
  | "not-found";
type ProfileData = {
  full_name: string;
  phone: string;
  department: string;
  position: string;
  linkedin_url: string;
  github_url: string;
  bio: string;
};
type Agent = {
  id: string;
  name: string;
  status: string;
  model: string;
  host: string;
  approval_level: number;
};
type Application = {
  id: string;
  full_name: string;
  email: string;
  account_type: string;
  organization: string;
  join_reason: string;
  created_at: string;
  status: string;
};
const tr = {
  ar: {
    brand: "ريّد",
    home: "الرئيسية",
    system: "نظام الشركة",
    join: "طلب انضمام",
    login: "تسجيل الدخول",
    hero: "نبني المستقبل بذكاء.",
    intro:
      "ريّد شريك تقني عُماني يبني منتجات برمجية ووكلاء ذكاء اصطناعي موثوقين للشركات.",
    start: "ابدأ معنا",
    discover: "اكتشف النظام",
    platform: "منصة عمل موحّدة",
    account: "حسابي",
  },
  en: {
    brand: "Reid",
    home: "Home",
    system: "Company system",
    join: "Join request",
    login: "Sign in",
    hero: "Building the future intelligently.",
    intro:
      "Reid is an Omani technology partner building software and dependable AI agents.",
    start: "Start with us",
    discover: "Explore the system",
    platform: "One unified workspace",
    account: "My profile",
  },
};
const routes: Record<string, Page> = {
  "/": "home",
  "/login": "login",
  "/apply": "apply",
  "/profile": "profile",
  "/dashboard": "dashboard",
  "/privacy": "privacy",
};
const paths: Record<Page, string> = {
  home: "/",
  login: "/login",
  apply: "/apply",
  profile: "/profile",
  dashboard: "/dashboard",
  privacy: "/privacy",
  "not-found": "/404",
};
function useRoute() {
  const [page, setPage] = React.useState<Page>(
    routes[location.pathname.replace(/\/+$/, "") || "/"] || "not-found",
  );
  React.useEffect(() => {
    const f = () =>
      setPage(
        routes[location.pathname.replace(/\/+$/, "") || "/"] || "not-found",
      );
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  return [
    page,
    (p: Page) => {
      history.pushState({}, "", paths[p]);
      setPage(p);
      scrollTo(0, 0);
    },
  ] as const;
}
async function getProfile(user: User | null) {
  if (!supabase || !user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name,phone,department,position,linkedin_url,github_url,bio")
    .eq("id", user.id)
    .maybeSingle();
  return data as ProfileData | null;
}

function Login({
  lang,
  done,
  apply,
}: {
  lang: Lang;
  done: () => void;
  apply: () => void;
}) {
  const [mode, setMode] = React.useState<"login" | "register">("login"),
    [message, setMessage] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    if (!supabase) {
      setMessage(
        lang === "ar"
          ? "تعذر الاتصال بخدمة الحسابات."
          : "Account service unavailable.",
      );
      setBusy(false);
      return;
    }
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      setMessage(error?.message || "");
      if (!error) done();
    } else {
      const { error } = await supabase.auth.signUp({
        email: String(f.get("email")),
        password: String(f.get("password")),
        options: {
          emailRedirectTo: `${location.origin}/profile`,
          data: {
            full_name: f.get("full_name"),
            linkedin_url: f.get("linkedin"),
            github_url: f.get("github") || null,
          },
        },
      });
      setMessage(
        error?.message ||
          (lang === "ar"
            ? "تحقق من بريدك لإكمال التسجيل."
            : "Check your email to finish registration."),
      );
    }
    setBusy(false);
  };
  const oauth = async (provider: "google" | "azure" | "github") => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/profile` },
    });
    if (error) setMessage(error.message);
  };
  return (
    <main className="auth">
      <section className="auth-card">
        <span>REID ACCOUNT</span>
        <h1>
          {mode === "login"
            ? tr[lang].login
            : lang === "ar"
              ? "إنشاء حساب"
              : "Create account"}
        </h1>
        <p>
          {lang === "ar"
            ? "دخول آمن إلى مساحة عمل ريّد."
            : "Secure access to your Reid workspace."}
        </p>
        <div className="oauth">
          <button onClick={() => oauth("google")}>G Google</button>
          <button onClick={() => oauth("azure")}>▦ Microsoft</button>
          <button onClick={() => oauth("github")}>◉ GitHub</button>
        </div>
        <div className="or">
          <i />
          {lang === "ar" ? "أو بالبريد" : "or with email"}
          <i />
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                {lang === "ar" ? "الاسم الكامل" : "Full name"}
                <input name="full_name" required />
              </label>
              <label>
                LinkedIn <em>required</em>
                <input
                  name="linkedin"
                  type="url"
                  required
                  pattern="https://(www\.)?linkedin\.com/.*"
                />
              </label>
              <label>
                GitHub <em>optional</em>
                <input
                  name="github"
                  type="url"
                  pattern="https://(www\.)?github\.com/.*"
                />
              </label>
            </>
          )}
          <label>
            {lang === "ar" ? "البريد الإلكتروني" : "Email"}
            <input name="email" type="email" required />
          </label>
          <label>
            {lang === "ar" ? "كلمة المرور" : "Password"}
            <input name="password" type="password" minLength={8} required />
          </label>
          <button className="primary" disabled={busy}>
            {busy
              ? "…"
              : mode === "login"
                ? tr[lang].login
                : lang === "ar"
                  ? "إنشاء الحساب"
                  : "Create account"}
          </button>
        </form>
        {message && (
          <p role="status" className="form-message">
            {message}
          </p>
        )}
        <button
          className="text-link"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? lang === "ar"
              ? "أنشئ حسابًا"
              : "Create account"
            : tr[lang].login}
        </button>
        {mode === "register" && (
          <button className="text-link" onClick={apply}>
            {lang === "ar" ? "أو أرسل طلب انضمام" : "Or submit a join request"}
          </button>
        )}
      </section>
    </main>
  );
}

function Join({ lang }: { lang: Lang }) {
  const [sent, setSent] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [message, setMessage] = React.useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget),
      id = crypto.randomUUID(),
      cv = f.get("cv") as File;
    let cv_path: string | null = null;
    if (cv?.size) {
      if (cv.type !== "application/pdf" || cv.size > 5 * 1024 * 1024) {
        setMessage(
          lang === "ar"
            ? "الملف يجب أن يكون PDF وأقل من 5MB."
            : "CV must be a PDF under 5MB.",
        );
        setBusy(false);
        return;
      }
      cv_path = `${id}/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage
        .from("application-cvs")
        .upload(cv_path, cv, { contentType: "application/pdf" });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase
      .from("applications")
      .insert({
        id,
        full_name: f.get("full_name"),
        email: f.get("email"),
        phone: f.get("phone"),
        organization: f.get("organization"),
        title: f.get("title"),
        linkedin_url: f.get("linkedin"),
        github_url: f.get("github") || null,
        account_type: f.get("account_type"),
        project_or_research: f.get("project_or_research") || null,
        join_reason: f.get("join_reason"),
        cover_letter: f.get("cover_letter"),
        cv_path,
      });
    if (error) {
      if (cv_path)
        await supabase.storage.from("application-cvs").remove([cv_path]);
      setMessage(error.message);
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  };
  if (sent)
    return (
      <main className="apply">
        <section className="sent">
          <b>✓</b>
          <h1>{lang === "ar" ? "تم استلام طلبك" : "Application received"}</h1>
          <p>
            {lang === "ar"
              ? "سيتم التواصل معك بالبريد بعد المراجعة."
              : "We will email you after review."}
          </p>
        </section>
      </main>
    );
  const F = ({
    n,
    l,
    t = "text",
    r = true,
  }: {
    n: string;
    l: string;
    t?: string;
    r?: boolean;
  }) => (
    <label>
      {l}
      <input name={n} type={t} required={r} />
    </label>
  );
  return (
    <main className="apply">
      <span>JOIN REID</span>
      <h1>{lang === "ar" ? "طلب انضمام" : "Join request"}</h1>
      <form onSubmit={submit}>
        <F n="full_name" l={lang === "ar" ? "الاسم الكامل" : "Full name"} />
        <F
          n="email"
          l={lang === "ar" ? "البريد الإلكتروني" : "Email"}
          t="email"
        />
        <F n="phone" l={lang === "ar" ? "الهاتف" : "Phone"} t="tel" />
        <F
          n="organization"
          l={lang === "ar" ? "الجهة / الجامعة" : "Organization"}
        />
        <F n="title" l={lang === "ar" ? "المسمى" : "Title"} />
        <F n="linkedin" l="LinkedIn" t="url" />
        <F n="github" l="GitHub" t="url" r={false} />
        <F
          n="project_or_research"
          l={lang === "ar" ? "المشروع / البحث" : "Project / research"}
          r={false}
        />
        <label>
          {lang === "ar" ? "نوع الحساب" : "Account type"}
          <select name="account_type" required defaultValue="">
            <option value="" disabled />
            <option value="employee">Employee</option>
            <option value="project_member">Project member</option>
            <option value="research_member">Research member</option>
            <option value="guest">External collaborator</option>
          </select>
        </label>
        <label className="wide">
          {lang === "ar" ? "سبب الانضمام" : "Reason"}
          <textarea name="join_reason" required />
        </label>
        <label className="wide">
          {lang === "ar" ? "رسالة تعريفية" : "Cover letter"}
          <textarea name="cover_letter" required />
        </label>
        <label className="wide">
          CV — PDF ≤ 5MB
          <input name="cv" type="file" accept="application/pdf" />
        </label>
        {message && (
          <p className="form-message wide" role="alert">
            {message}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "…" : lang === "ar" ? "إرسال الطلب" : "Submit"}
        </button>
      </form>
    </main>
  );
}

function Profile({
  lang,
  user,
  complete,
  signout,
}: {
  lang: Lang;
  user: User;
  complete: () => Promise<void>;
  signout: () => void;
}) {
  const empty: ProfileData = {
    full_name: "",
    phone: "",
    department: "",
    position: "",
    linkedin_url: "",
    github_url: "",
    bio: "",
  };
  const [p, setP] = React.useState(empty),
    [roles, setRoles] = React.useState<string[]>([]),
    [message, setMessage] = React.useState("");
  React.useEffect(() => {
    getProfile(user).then((x) => x && setP({ ...empty, ...x }));
    supabase!
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => setRoles(data?.map((item) => item.role) || []));
  }, [user.id]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase!
      .from("profiles")
      .update(p)
      .eq("id", user.id);
    setMessage(error?.message || (lang === "ar" ? "تم الحفظ." : "Saved."));
    if (!error) await complete();
  };
  const field = (n: keyof ProfileData, l: string, r = false, t = "text") => (
    <label>
      {l}
      <input
        type={t}
        required={r}
        value={p[n] || ""}
        onChange={(e) => setP({ ...p, [n]: e.target.value })}
      />
    </label>
  );
  return (
    <main className="profile">
      <span>REID PROFILE</span>
      <h1>{tr[lang].account}</h1>
      {!p.linkedin_url && (
        <p className="guard-message">
          {lang === "ar"
            ? "أكمل LinkedIn قبل دخول النظام."
            : "Complete LinkedIn before workspace access."}
        </p>
      )}
      <section>
        <div className="avatar">R</div>
        <div>
          <h2>{p.full_name || user.email}</h2>
          <div className="role-badges">
            {roles.map((role) => (
              <b key={role}>{role.replace("_", " ")}</b>
            ))}
          </div>
        </div>
      </section>
      <form className="profile-form" onSubmit={save}>
        {field("full_name", lang === "ar" ? "الاسم الكامل" : "Full name", true)}
        {field("phone", lang === "ar" ? "الهاتف" : "Phone")}
        {field("department", lang === "ar" ? "القسم" : "Department")}
        {field("position", lang === "ar" ? "المسمى" : "Position")}
        {field("linkedin_url", "LinkedIn", true, "url")}
        {field("github_url", "GitHub", false, "url")}
        <label className="wide">
          Bio
          <textarea
            value={p.bio || ""}
            onChange={(e) => setP({ ...p, bio: e.target.value })}
          />
        </label>
        <button className="primary">
          {lang === "ar" ? "حفظ الملف" : "Save profile"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <button className="text-link" onClick={signout}>
        {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
      </button>
    </main>
  );
}

function Dashboard({
  lang,
  user,
  ready,
  login,
  profile,
}: {
  lang: Lang;
  user: User | null;
  ready: boolean;
  login: () => void;
  profile: () => void;
}) {
  const [roles, setRoles] = React.useState<string[]>([]),
    [agents, setAgents] = React.useState<Agent[]>([]),
    [apps, setApps] = React.useState<Application[]>([]),
    [counts, setCounts] = React.useState([0, 0, 0, 0, 0]),
    [message, setMessage] = React.useState("");
  const allowed = roles.some((x) =>
    ["owner", "super_admin", "admin", "hr"].includes(x),
  );
  const refresh = React.useCallback(async () => {
    if (!supabase || !user) return;
    const r = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id),
      next = r.data?.map((x) => x.role) || [];
    setRoles(next);
    if (!next.some((x) => ["owner", "super_admin", "admin", "hr"].includes(x)))
      return;
    const [a, p, projects, tasks, people, leads] = await Promise.all([
      supabase
        .from("agents")
        .select("id,name,status,model,host,approval_level"),
      supabase
        .from("applications")
        .select(
          "id,full_name,email,account_type,organization,join_reason,created_at,status",
        )
        .eq("status", "pending"),
      supabase.from("projects").select("*", { count: "exact", head: true }),
      supabase.from("tasks").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("crm_contacts").select("*", { count: "exact", head: true }),
    ]);
    setAgents((a.data || []) as Agent[]);
    setApps((p.data || []) as Application[]);
    setCounts([
      projects.count || 0,
      tasks.count || 0,
      people.count || 0,
      leads.count || 0,
      p.data?.length || 0,
    ]);
  }, [user]);
  React.useEffect(() => {
    refresh();
  }, [refresh]);
  const decide = async (a: Application, d: "approved" | "rejected") => {
    const reason =
      d === "rejected"
        ? prompt(
            lang === "ar"
              ? "سبب الرفض الداخلي (إجباري)"
              : "Internal rejection reason",
          )
        : null;
    if (d === "rejected" && !reason?.trim()) return;
    const { error } = await supabase!.functions.invoke("decide-application", {
      body: { applicationId: a.id, decision: d, rejectionReason: reason },
    });
    setMessage(
      error?.message ||
        (lang === "ar"
          ? "تم القرار. إرسال البريد ينتظر إعداد SMTP."
          : "Decision saved. Email awaits SMTP setup."),
    );
    if (!error) refresh();
  };
  if (!user)
    return (
      <Gate
        title={lang === "ar" ? "تسجيل الدخول مطلوب" : "Sign in required"}
        action={login}
        label={tr[lang].login}
      />
    );
  if (!ready)
    return (
      <Gate
        title={
          lang === "ar" ? "أكمل LinkedIn أولًا" : "Complete LinkedIn first"
        }
        action={profile}
        label={tr[lang].account}
      />
    );
  if (!allowed)
    return <Gate title={lang === "ar" ? "لا توجد صلاحية" : "Access denied"} />;
  return (
    <main className="dashboard">
      <span>REID COMMAND CENTER</span>
      <h1>{lang === "ar" ? "لوحة الشركة الحية" : "Live company dashboard"}</h1>
      <section className="kpis">
        {[
          "Active Projects",
          "Open Tasks",
          "Employees",
          "New Leads",
          "Pending Approvals",
        ].map((l, i) => (
          <article key={l}>
            <b>{counts[i]}</b>
            <small>{l}</small>
          </article>
        ))}
      </section>
      {message && <p className="guard-message">{message}</p>}
      <h2>{lang === "ar" ? "طلبات معلقة" : "Pending applications"}</h2>
      <section className="applications-list">
        {apps.length ? (
          apps.map((a) => (
            <article key={a.id}>
              <div>
                <b>{a.full_name}</b>
                <small>
                  {a.email} · {a.organization} · {a.account_type}
                </small>
                <p>{a.join_reason}</p>
              </div>
              <div>
                <button onClick={() => decide(a, "approved")}>
                  {lang === "ar" ? "قبول" : "Approve"}
                </button>
                <button onClick={() => decide(a, "rejected")}>
                  {lang === "ar" ? "رفض" : "Reject"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p>{lang === "ar" ? "لا توجد طلبات." : "No pending applications."}</p>
        )}
      </section>
      <h2>{lang === "ar" ? "الوكلاء" : "Agents"}</h2>
      <section className="grid">
        {agents.map((a) => (
          <article key={a.id} className={"agent " + a.status}>
            <i>R</i>
            <b>{a.name}</b>
            <small>
              {a.status} · {a.model}
            </small>
            <small>
              L{a.approval_level} · {a.host}
            </small>
          </article>
        ))}
      </section>
    </main>
  );
}
function Gate({
  title,
  action,
  label,
}: {
  title: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <main className="auth">
      <section className="auth-card">
        <h1>{title}</h1>
        {action && (
          <button className="primary" onClick={action}>
            {label}
          </button>
        )}
      </section>
    </main>
  );
}

function Chat({ lang }: { lang: Lang }) {
  const [open, setOpen] = React.useState(false),
    [msgs, setMsgs] = React.useState<string[]>([]),
    [v, setV] = React.useState("");
  const send = () => {
    const q = v.trim();
    if (!q) return;
    setMsgs([
      ...msgs,
      q,
      /واتس|whatsapp/i.test(q)
        ? lang === "ar"
          ? "اضغط زر واتساب للتواصل مع فريق ريّد."
          : "Use WhatsApp to reach Reid."
        : lang === "ar"
          ? "أساعدك بالخدمات والمشاريع وطلبات الانضمام."
          : "I help with services, projects, and applications.",
    ]);
    setV("");
  };
  const n = import.meta.env.VITE_WHATSAPP_NUMBER || "96897308003",
    url = `https://wa.me/${n}?text=${encodeURIComponent("Hello Reid")}`;
  return (
    <div className="chat">
      <button
        className="chat-launch"
        aria-label="Chat"
        onClick={() => setOpen(!open)}
      >
        ✦
      </button>
      {open && (
        <section className="chat-panel">
          <header>
            <b>{lang === "ar" ? "مساعد ريّد" : "Reid Assistant"}</b>
            <button onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="chat-body">
            {msgs.map((m, i) => (
              <p key={i} className={i % 2 ? "bot" : "user"}>
                {m}
              </p>
            ))}
          </div>
          <a className="whatsapp" href={url} target="_blank" rel="noreferrer">
            WhatsApp ↗
          </a>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input value={v} onChange={(e) => setV(e.target.value)} />
            <button>↑</button>
          </form>
        </section>
      )}
    </div>
  );
}

function App() {
  const [page, go] = useRoute(),
    [lang, setLang] = React.useState<Lang>("ar"),
    [dark, setDark] = React.useState(false),
    [session, setSession] = React.useState<Session | null>(null),
    [ready, setReady] = React.useState(false),
    t = tr[lang];
  const check = React.useCallback(
    async (u: User | null) =>
      setReady(Boolean((await getProfile(u))?.linkedin_url)),
    [],
  );
  React.useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session);
      check(data.session?.user || null);
    });
    const { data } = supabase?.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      check(s?.user || null);
    }) || { data: null };
    return () => data?.subscription.unsubscribe();
  }, [check]);
  React.useEffect(() => {
    const client = supabase;
    if (!session || !client) return;
    return installIdleTimeout(async () => {
      await client.auth.signOut();
      go("home");
    });
  }, [session]);
  return (
    <div
      className={dark ? "app dark" : "app"}
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <header>
        <button className="brand" onClick={() => go("home")}>
          <i>R</i>
          <strong>{t.brand}</strong>
        </button>
        <nav>
          <button onClick={() => go("home")}>{t.home}</button>
          <button onClick={() => go("dashboard")}>{t.system}</button>
          <button onClick={() => go("apply")}>{t.join}</button>
          <button
            className="pill"
            onClick={() => go(session ? "profile" : "login")}
          >
            {session ? t.account : t.login}
          </button>
        </nav>
        <aside>
          <button onClick={() => setDark(!dark)}>{dark ? "☀" : "☾"}</button>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {lang === "ar" ? "EN" : "ع"}
          </button>
        </aside>
      </header>
      {page === "home" && (
        <main>
          <section className="hero">
            <span>REID · TECHNOLOGY & AI</span>
            <h1>{t.hero}</h1>
            <p>{t.intro}</p>
            <div>
              <button className="primary" onClick={() => go("apply")}>
                {t.start} ←
              </button>
              <button onClick={() => go("dashboard")}>{t.discover}</button>
            </div>
            <section className="stats">
              <article>
                <b>11</b>
                <small>AI Agents</small>
              </article>
              <article>
                <b>5</b>
                <small>Project Types</small>
              </article>
              <article>
                <b>RLS</b>
                <small>Secure by default</small>
              </article>
            </section>
          </section>
          <section className="features">
            <span>REID OS</span>
            <h2>{t.platform}</h2>
            <div>
              <article>
                <h3>Operations</h3>
                <p>المشاريع والمهام والتقويم وساعات العمل.</p>
              </article>
              <article>
                <h3>People & Research</h3>
                <p>الموظفون والأبحاث والموافقات.</p>
              </article>
              <article>
                <h3>Agent Command</h3>
                <p>الحالة والصلاحيات وسجل التنفيذ.</p>
              </article>
            </div>
          </section>
          <Chat lang={lang} />
        </main>
      )}
      {page === "login" && (
        <Login
          lang={lang}
          done={() => go("profile")}
          apply={() => go("apply")}
        />
      )}{" "}
      {page === "apply" && <Join lang={lang} />}{" "}
      {page === "profile" &&
        (session?.user ? (
          <Profile
            lang={lang}
            user={session.user}
            complete={async () => {
              await check(session.user);
              go("dashboard");
            }}
            signout={async () => {
              await supabase?.auth.signOut();
              go("home");
            }}
          />
        ) : (
          <Login
            lang={lang}
            done={() => go("profile")}
            apply={() => go("apply")}
          />
        ))}{" "}
      {page === "dashboard" && (
        <Dashboard
          lang={lang}
          user={session?.user || null}
          ready={ready}
          login={() => go("login")}
          profile={() => go("profile")}
        />
      )}{" "}
      {page === "privacy" && (
        <main className="legal">
          <h1>{lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
          <p>
            {lang === "ar"
              ? "تستخدم ريّد البيانات لإدارة الطلبات والحسابات والمشاريع فقط. السير الذاتية وملفات الموارد البشرية خاصة ولا تُنشر."
              : "Reid uses data only to manage applications, accounts, and projects. CVs and HR files remain private."}
          </p>
        </main>
      )}{" "}
      {page === "not-found" && (
        <main className="legal">
          <h1>404</h1>
          <p>{lang === "ar" ? "الصفحة غير موجودة." : "Page not found."}</p>
          <button className="primary" onClick={() => go("home")}>
            {t.home}
          </button>
        </main>
      )}
      <footer>
        <button className="text-link" onClick={() => go("privacy")}>
          {lang === "ar" ? "الخصوصية" : "Privacy"}
        </button>
        <b>{t.brand}</b>
        <small>© 2026 · reidpro.com</small>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

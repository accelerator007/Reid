import React from "react";
import { createRoot } from "react-dom/client";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { installIdleTimeout } from "./session";
import { EmployeeWorkspace } from "./employee";
import { ProjectWorkspace } from "./projects";
import "./style.css";
import "./brand.css";
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
  | "workspace"
  | "projects"
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
  phone: string;
  title: string;
  linkedin_url: string;
  github_url: string | null;
  project_or_research: string | null;
  join_reason: string;
  cover_letter: string;
  cv_path: string | null;
  created_at: string;
  status: string;
  invitation_status?: string;
};
type Notification = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  read_at: string | null;
  created_at: string;
  entity_id: string | null;
};
type CompanyAccount = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  position: string | null;
  user_roles: { role: string }[];
  account_controls:
    | { status: string; reason: string | null }[]
    | { status: string; reason: string | null }
    | null;
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
    workspace: "مساحة العمل",
    projects: "المشاريع",
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
    workspace: "Workspace",
    projects: "Projects",
  },
};
const routes: Record<string, Page> = {
  "/": "home",
  "/login": "login",
  "/apply": "apply",
  "/profile": "profile",
  "/workspace": "workspace",
  "/projects": "projects",
  "/dashboard": "dashboard",
  "/privacy": "privacy",
};
const paths: Record<Page, string> = {
  home: "/",
  login: "/login",
  apply: "/apply",
  profile: "/profile",
  workspace: "/workspace",
  projects: "/projects",
  dashboard: "/dashboard",
  privacy: "/privacy",
  "not-found": "/404",
};
function resolvePage(pathname: string): Page {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized.startsWith("/projects/")) return "projects";
  return routes[normalized] || "not-found";
}
function useRoute() {
  const [page, setPage] = React.useState<Page>(
    resolvePage(location.pathname),
  );
  React.useEffect(() => {
    const f = () => setPage(resolvePage(location.pathname));
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
  const [message, setMessage] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [email, setEmail] = React.useState("");
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
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setMessage(error?.message || "");
    if (!error) done();
    setBusy(false);
  };
  const oauth = async (provider: "google" | "azure" | "github") => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/dashboard` },
    });
    if (error) setMessage(error.message);
  };
  const emailLink = async (kind: "magic" | "recovery") => {
    if (!supabase || !email.trim()) {
      setMessage(
        lang === "ar" ? "اكتب بريدك أولًا." : "Enter your email first.",
      );
      return;
    }
    setBusy(true);
    const result =
      kind === "magic"
        ? await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
              shouldCreateUser: false,
              emailRedirectTo: `${location.origin}/profile`,
            },
          })
        : await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${location.origin}/profile`,
          });
    setMessage(
      result.error?.message ||
        (lang === "ar"
          ? "إذا كان الحساب معتمدًا فسيصل الرابط إلى بريدك."
          : "If the account is approved, the link will arrive by email."),
    );
    setBusy(false);
  };
  return (
    <main className="auth">
      <section className="auth-card">
        <span>REID ACCOUNT</span>
        <h1>{tr[lang].login}</h1>
        <p>
          {lang === "ar"
            ? "الدخول للحسابات المعتمدة فقط. إذا لم يكن لديك حساب، أرسل طلب انضمام أولًا."
            : "Approved accounts only. If you do not have an account, submit a join request first."}
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
          <label>
            {lang === "ar" ? "البريد الإلكتروني" : "Email"}
            <input
              name="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            {lang === "ar" ? "كلمة المرور" : "Password"}
            <input name="password" type="password" minLength={8} required />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "…" : tr[lang].login}
          </button>
        </form>
        {message && (
          <p role="status" className="form-message">
            {message}
          </p>
        )}
        <button className="text-link" onClick={apply}>
          {lang === "ar"
            ? "ليس لديك حساب؟ أرسل طلب انضمام"
            : "No account? Submit a join request"}
        </button>
        <div className="auth-links">
          <button
            className="text-link"
            disabled={busy}
            onClick={() => emailLink("magic")}
          >
            {lang === "ar"
              ? "أرسل رابط دخول آمن"
              : "Send a secure sign-in link"}
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => emailLink("recovery")}
          >
            {lang === "ar" ? "نسيت كلمة المرور" : "Forgot password"}
          </button>
        </div>
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
    const { error } = await supabase.from("applications").insert({
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
    [message, setMessage] = React.useState(""),
    [newPassword, setNewPassword] = React.useState("");
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
    if (newPassword && newPassword.length < 8) {
      setMessage(
        lang === "ar"
          ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل."
          : "Password must be at least 8 characters.",
      );
      return;
    }
    const { error } = await supabase!
      .from("profiles")
      .update(p)
      .eq("id", user.id);
    const passwordResult =
      !error && newPassword
        ? await supabase!.auth.updateUser({ password: newPassword })
        : { error: null };
    const finalError = error || passwordResult.error;
    setMessage(finalError?.message || (lang === "ar" ? "تم الحفظ." : "Saved."));
    if (!finalError) {
      setNewPassword("");
      await complete();
    }
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
        <label className="wide">
          {lang === "ar"
            ? "كلمة مرور جديدة (اختياري)"
            : "New password (optional)"}
          <input
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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
    [failedInvites, setFailedInvites] = React.useState<Application[]>([]),
    [accounts, setAccounts] = React.useState<CompanyAccount[]>([]),
    [accountStatus, setAccountStatus] = React.useState("active"),
    [notifications, setNotifications] = React.useState<Notification[]>([]),
    [counts, setCounts] = React.useState([0, 0, 0, 0, 0]),
    [message, setMessage] = React.useState(""),
    [reviewing, setReviewing] = React.useState<Application | null>(null),
    [suggestedDecision, setSuggestedDecision] = React.useState<
      "approved" | "rejected" | null
    >(null),
    [rejectReason, setRejectReason] = React.useState(""),
    [busyDecision, setBusyDecision] = React.useState(false);
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
    const control = await supabase
      .from("account_controls")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    setAccountStatus(control.data?.status || "active");
    if (control.data?.status && control.data.status !== "active") return;
    if (!next.some((x) => ["owner", "super_admin", "admin", "hr"].includes(x)))
      return;
    const [
      a,
      p,
      failed,
      projects,
      tasks,
      people,
      leads,
      notices,
      companyProfiles,
      companyRoles,
      companyControls,
    ] = await Promise.all([
      supabase
        .from("agents")
        .select("id,name,status,model,host,approval_level"),
      supabase
        .from("applications")
        .select(
          "id,full_name,email,phone,organization,title,linkedin_url,github_url,account_type,project_or_research,join_reason,cover_letter,cv_path,created_at,status",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("applications")
        .select(
          "id,full_name,email,phone,organization,title,linkedin_url,github_url,account_type,project_or_research,join_reason,cover_letter,cv_path,created_at,status,invitation_status",
        )
        .eq("status", "approved")
        .eq("invitation_status", "failed")
        .order("created_at", { ascending: true }),
      supabase.from("projects").select("*", { count: "exact", head: true }),
      supabase.from("tasks").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("crm_contacts").select("*", { count: "exact", head: true }),
      supabase
        .from("notifications")
        .select(
          "id,title_ar,title_en,body_ar,body_en,read_at,created_at,entity_id",
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("profiles")
        .select("id,full_name,email,department,position")
        .order("full_name"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("account_controls").select("user_id,status,reason"),
    ]);
    setAgents((a.data || []) as Agent[]);
    setApps((p.data || []) as Application[]);
    setFailedInvites((failed.data || []) as Application[]);
    setNotifications((notices.data || []) as Notification[]);
    const roleRows = (companyRoles.data || []) as {
      user_id: string;
      role: string;
    }[];
    const controlRows = (companyControls.data || []) as {
      user_id: string;
      status: string;
      reason: string | null;
    }[];
    setAccounts(
      (companyProfiles.data || []).map((account) => ({
        ...account,
        user_roles: roleRows
          .filter(({ user_id }) => user_id === account.id)
          .map(({ role }) => ({ role })),
        account_controls:
          controlRows.find(({ user_id }) => user_id === account.id) || null,
      })) as CompanyAccount[],
    );
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
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("review");
    if (!requested || reviewing) return;
    const application = apps.find(({ id }) => id === requested);
    if (application) {
      const requestedDecision = params.get("decision");
      setSuggestedDecision(
        requestedDecision === "approved" || requestedDecision === "rejected"
          ? requestedDecision
          : null,
      );
      setReviewing(application);
    }
  }, [apps, reviewing]);
  React.useEffect(() => {
    if (!supabase || !user || !allowed) return;
    const channel = supabase
      .channel(`review-workspace:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [allowed, refresh, user]);
  const decide = async (a: Application, d: "approved" | "rejected") => {
    const reason = d === "rejected" ? rejectReason : null;
    if (d === "rejected" && !reason?.trim()) return;
    setBusyDecision(true);
    setMessage("");
    const { data, error } = await supabase!.functions.invoke(
      "decide-application",
      {
        body: { applicationId: a.id, decision: d, rejectionReason: reason },
      },
    );
    setMessage(
      error?.message ||
        (data?.invitationStatus === "failed"
          ? lang === "ar"
            ? "تم القبول لكن فشل إرسال الدعوة. ظهرت في قائمة إعادة المحاولة."
            : "Approved, but invitation delivery failed. It is now in the retry list."
          : lang === "ar"
            ? "تم حفظ القرار."
            : "Decision saved."),
    );
    if (!error) {
      setReviewing(null);
      setRejectReason("");
      await refresh();
    }
    setBusyDecision(false);
  };
  const retryInvitation = async (application: Application) => {
    setBusyDecision(true);
    const { data, error } = await supabase!.functions.invoke(
      "decide-application",
      {
        body: { applicationId: application.id, decision: "retry_invitation" },
      },
    );
    setMessage(
      error?.message ||
        (data?.invitationStatus === "sent"
          ? lang === "ar"
            ? "تم إرسال الدعوة."
            : "Invitation sent."
          : lang === "ar"
            ? "فشل إرسال الدعوة مرة أخرى."
            : "Invitation delivery failed again."),
    );
    await refresh();
    setBusyDecision(false);
  };
  const manageAccount = async (body: Record<string, unknown>) => {
    setMessage("");
    const { error } = await supabase!.functions.invoke("manage-account", {
      body,
    });
    setMessage(
      error?.message ||
        (lang === "ar" ? "تم تحديث الحساب." : "Account updated."),
    );
    if (!error) await refresh();
  };
  const openCv = async (application: Application) => {
    if (!application.cv_path || !supabase) return;
    const { data, error } = await supabase.storage
      .from("application-cvs")
      .createSignedUrl(application.cv_path, 60);
    if (error || !data?.signedUrl) {
      setMessage(lang === "ar" ? "تعذر فتح ملف CV." : "Could not open CV.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
  if (accountStatus !== "active")
    return (
      <Gate
        title={
          lang === "ar"
            ? "الحساب موقوف. تواصل مع الإدارة."
            : "Account suspended. Contact an administrator."
        }
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
      <section className="review-overview">
        <article>
          <h2>{lang === "ar" ? "الإشعارات" : "Notifications"}</h2>
          {notifications.length ? (
            notifications.map((notice) => (
              <div
                className={notice.read_at ? "notice" : "notice unread"}
                key={notice.id}
              >
                <b>{lang === "ar" ? notice.title_ar : notice.title_en}</b>
                <p>{lang === "ar" ? notice.body_ar : notice.body_en}</p>
                <small>
                  {new Date(notice.created_at).toLocaleString(
                    lang === "ar" ? "ar-OM" : "en-OM",
                  )}
                </small>
                {notice.entity_id &&
                  apps.some(({ id }) => id === notice.entity_id) && (
                    <button
                      onClick={() =>
                        setReviewing(
                          apps.find(({ id }) => id === notice.entity_id) ||
                            null,
                        )
                      }
                    >
                      {lang === "ar" ? "مراجعة الطلب" : "Review application"}
                    </button>
                  )}
              </div>
            ))
          ) : (
            <p>{lang === "ar" ? "لا توجد إشعارات." : "No notifications."}</p>
          )}
        </article>
      </section>
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
                <button
                  onClick={() => {
                    setReviewing(a);
                    setRejectReason("");
                  }}
                >
                  {lang === "ar" ? "مراجعة" : "Review"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p>{lang === "ar" ? "لا توجد طلبات." : "No pending applications."}</p>
        )}
      </section>
      {failedInvites.length > 0 && (
        <>
          <h2>
            {lang === "ar"
              ? "دعوات تحتاج إعادة إرسال"
              : "Invitations needing retry"}
          </h2>
          <section className="applications-list failed-invitations">
            {failedInvites.map((application) => (
              <article key={application.id}>
                <div>
                  <b>{application.full_name}</b>
                  <small>{application.email}</small>
                </div>
                <div>
                  <button
                    disabled={busyDecision}
                    onClick={() => retryInvitation(application)}
                  >
                    {lang === "ar" ? "إعادة إرسال الدعوة" : "Retry invitation"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {(roles.includes("owner") || roles.includes("super_admin")) && (
        <>
          <h2>
            {lang === "ar" ? "الحسابات والصلاحيات" : "Accounts and roles"}
          </h2>
          <section className="accounts-list">
            {accounts.map((account) => {
              const control = Array.isArray(account.account_controls)
                ? account.account_controls[0]
                : account.account_controls;
              const status = control?.status || "active";
              const roleNames =
                account.user_roles?.map(({ role }) => role) || [];
              const protectedAccount =
                account.id === user.id || roleNames.includes("owner");
              return (
                <article key={account.id}>
                  <div>
                    <b>{account.full_name}</b>
                    <small>{account.email}</small>
                    <small>
                      {account.department || "—"} · {account.position || "—"}
                    </small>
                  </div>
                  <div className="account-roles">
                    {roleNames.map((role) => (
                      <button
                        type="button"
                        key={role}
                        disabled={protectedAccount || role === "owner"}
                        title={lang === "ar" ? "إزالة الصلاحية" : "Remove role"}
                        onClick={() => void manageAccount({ action: "set_role", targetUserId: account.id, role, enabled: false })}
                      >
                        {role.replaceAll("_", " ")} {protectedAccount || role === "owner" ? "" : "×"}
                      </button>
                    ))}
                  </div>
                  <div className={`account-status ${status}`}>
                    <b>{status}</b>
                    {control?.reason && <small>{control.reason}</small>}
                  </div>
                  <div className="account-actions">
                    <select
                      aria-label={
                        lang === "ar"
                          ? `إضافة صلاحية ${account.full_name}`
                          : `Add role for ${account.full_name}`
                      }
                      defaultValue=""
                      disabled={protectedAccount}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        void manageAccount({
                          action: "set_role",
                          targetUserId: account.id,
                          role: event.target.value,
                          enabled: true,
                        });
                        event.target.value = "";
                      }}
                    >
                      <option value="">
                        {lang === "ar" ? "إضافة صلاحية" : "Add role"}
                      </option>
                      {[
                        "super_admin",
                        "admin",
                        "hr",
                        "sales",
                        "employee",
                        "project_member",
                        "research_member",
                        "guest",
                      ]
                        .filter((role) => !roleNames.includes(role))
                        .map((role) => (
                          <option value={role} key={role}>
                            {role.replaceAll("_", " ")}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={protectedAccount}
                      onClick={() => {
                        if (status === "active") {
                          const reason = window.prompt(
                            lang === "ar"
                              ? "سبب إيقاف الحساب"
                              : "Suspension reason",
                          );
                          if (reason?.trim())
                            void manageAccount({
                              action: "set_status",
                              targetUserId: account.id,
                              status: "suspended",
                              reason,
                            });
                        } else {
                          void manageAccount({
                            action: "set_status",
                            targetUserId: account.id,
                            status: "active",
                          });
                        }
                      }}
                    >
                      {status === "active"
                        ? lang === "ar"
                          ? "إيقاف"
                          : "Suspend"
                        : lang === "ar"
                          ? "إعادة تفعيل"
                          : "Reactivate"}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
      {reviewing && (
        <div
          className="review-backdrop"
          role="presentation"
          onMouseDown={() => setReviewing(null)}
        >
          <section
            className="review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>{reviewing.account_type.replaceAll("_", " ")}</small>
                <h2 id="review-title">{reviewing.full_name}</h2>
              </div>
              <button
                aria-label={lang === "ar" ? "إغلاق" : "Close"}
                onClick={() => setReviewing(null)}
              >
                ×
              </button>
            </header>
            {suggestedDecision && (
              <p className="notice">
                {lang === "ar"
                  ? `فُتح هذا الطلب من رابط ${suggestedDecision === "approved" ? "القبول" : "الرفض"} في البريد. راجع البيانات ثم أكّد القرار يدويًا.`
                  : `This request was opened from the email ${suggestedDecision === "approved" ? "approval" : "rejection"} link. Review it and confirm manually.`}
              </p>
            )}
            <dl>
              <div>
                <dt>{lang === "ar" ? "البريد" : "Email"}</dt>
                <dd>{reviewing.email}</dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "الهاتف" : "Phone"}</dt>
                <dd>{reviewing.phone}</dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "الجهة" : "Organization"}</dt>
                <dd>{reviewing.organization}</dd>
              </div>
              <div>
                <dt>{lang === "ar" ? "المسمى" : "Title"}</dt>
                <dd>{reviewing.title}</dd>
              </div>
              <div>
                <dt>LinkedIn</dt>
                <dd>
                  <a
                    href={reviewing.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {reviewing.linkedin_url}
                  </a>
                </dd>
              </div>
              <div>
                <dt>GitHub</dt>
                <dd>
                  {reviewing.github_url ? (
                    <a
                      href={reviewing.github_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {reviewing.github_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  {lang === "ar" ? "المشروع / البحث" : "Project / research"}
                </dt>
                <dd>{reviewing.project_or_research || "—"}</dd>
              </div>
            </dl>
            <article>
              <b>{lang === "ar" ? "سبب الانضمام" : "Join reason"}</b>
              <p>{reviewing.join_reason}</p>
            </article>
            <article>
              <b>{lang === "ar" ? "الرسالة التعريفية" : "Cover letter"}</b>
              <p>{reviewing.cover_letter}</p>
            </article>
            {reviewing.cv_path && (
              <button onClick={() => openCv(reviewing)}>
                {lang === "ar" ? "فتح CV بشكل آمن" : "Open CV securely"}
              </button>
            )}
            <label>
              {lang === "ar"
                ? "سبب الرفض الداخلي"
                : "Internal rejection reason"}
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={
                  lang === "ar"
                    ? "إجباري عند الرفض، ولا يُرسل للمتقدم"
                    : "Required for rejection; never sent to applicant"
                }
              />
            </label>
            <footer>
              <button
                className="primary"
                disabled={busyDecision}
                onClick={() => decide(reviewing, "approved")}
                data-email-suggestion={suggestedDecision === "approved"}
              >
                {lang === "ar" ? "قبول وإرسال الدعوة" : "Approve and invite"}
              </button>
              <button
                disabled={busyDecision || !rejectReason.trim()}
                onClick={() => decide(reviewing, "rejected")}
                data-email-suggestion={suggestedDecision === "rejected"}
              >
                {lang === "ar" ? "رفض الطلب" : "Reject application"}
              </button>
            </footer>
          </section>
        </div>
      )}
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
    [sessionRoles, setSessionRoles] = React.useState<string[]>([]),
    [ready, setReady] = React.useState(false),
    t = tr[lang];
  const canManageCompany = sessionRoles.some((role) =>
    ["owner", "super_admin", "admin", "hr"].includes(role),
  );
  const check = React.useCallback(async (u: User | null) => {
    setReady(Boolean((await getProfile(u))?.linkedin_url));
    if (!supabase || !u) return setSessionRoles([]);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.id);
    setSessionRoles(data?.map(({ role }) => role) || []);
  }, []);
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
          <img src="/assets/img/reid-logo.svg" alt="" aria-hidden="true" />
          <strong>{t.brand}</strong>
        </button>
        <nav>
          <button onClick={() => go("home")}>{t.home}</button>
          <button
            onClick={() =>
              go(session && !canManageCompany ? "workspace" : "dashboard")
            }
          >
            {t.system}
          </button>
          <button onClick={() => go("apply")}>{t.join}</button>
          {session && (
            <button onClick={() => go("workspace")}>{t.workspace}</button>
          )}
          {session && (
            <button onClick={() => go("projects")}>{t.projects}</button>
          )}
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
          done={() => go("workspace")}
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
      {page === "workspace" &&
        (session?.user ? (
          <EmployeeWorkspace
            lang={lang}
            user={session.user}
            profile={() => go("profile")}
          />
        ) : (
          <Login
            lang={lang}
            done={() => go("workspace")}
            apply={() => go("apply")}
          />
        ))}{" "}
      {page === "projects" &&
        (session?.user ? (
          <ProjectWorkspace lang={lang} user={session.user} />
        ) : (
          <Login
            lang={lang}
            done={() => go("projects")}
            apply={() => go("apply")}
          />
        ))}{" "}
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

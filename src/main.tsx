import React from "react";
import { createRoot } from "react-dom/client";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { installIdleTimeout } from "./session";
import { landingPage, pathFor, resolvePage } from "./routes";
import {
  accessForPage,
  Guarded,
  SessionProvider,
  useNavigation,
  useSession,
} from "./shell";
import type { Page } from "./routes";
import { PublicHome } from "./public-home";
import { workspaceLabel, workspacePages } from "./workspace-navigation";
import { AppShell } from "./app-shell/app-shell";
import { Building2, Crown, FolderKanban, FlaskConical, GraduationCap, Handshake, Headphones, LayoutDashboard, LoaderCircle, LogOut, Menu, MessageCircle, Send, Sparkles, UserRound, UsersRound, X, CalendarDays, Settings2, BriefcaseBusiness, Search, ShieldCheck, PanelLeftClose, PanelLeftOpen } from "lucide-react";
// Imported rather than written as a literal URL. The assets directory sits
// outside Vite's public directory, so a hard-coded path is never emitted to
// dist and the header mark 404s in production while still resolving in dev.
import reidLogo from "../assets/img/reid-logo.svg";
import "./fonts.css";
import "./tokens.css";
import "./style.css";
import "./brand.css";
import "./auth.css";
import "./profile.css";
import "./workflow.css";
import "./reid-os.css";

const EmployeeWorkspace=React.lazy(()=>import('./people/people-page').then(module=>({default:module.EmployeeWorkspace})));
const ProjectWorkspace=React.lazy(()=>import('./projects/projects-page').then(module=>({default:module.ProjectWorkspace})));
const AgentManagement=React.lazy(()=>import('./agent-admin/agent-admin-page').then(module=>({default:module.AgentManagement})));
const AdminWorkspace=React.lazy(()=>import('./admin-workspace').then(module=>({default:module.AdminWorkspace})));
const OwnerOverview=React.lazy(()=>import('./owner-overview').then(module=>({default:module.OwnerOverview})));
const Today=React.lazy(()=>import('./work/today-page').then(module=>({default:module.Today})));
const Operations=React.lazy(()=>import('./work/operations-page').then(module=>({default:module.Operations})));
const AssistantWorkspace=React.lazy(()=>import('./agent-team/agent-team-page').then(module=>({default:module.AgentTeamRoom})));
const Connections=React.lazy(()=>import('./qr-workspace').then(module=>({default:module.Connections})));
const Inbox=React.lazy(()=>import('./inbox/inbox-page').then(module=>({default:module.Inbox})));
const ResearchWorkspace=React.lazy(()=>import('./research').then(module=>({default:module.ResearchWorkspace})));
const CrmWorkspace=React.lazy(()=>import('./clients/clients-page').then(module=>({default:module.CrmWorkspace})));
const Workshops=React.lazy(()=>import('./workshops').then(module=>({default:module.Workshops})));

type Lang = "ar" | "en";
type ProfileData = {
  full_name: string;
  phone: string;
  department: string;
  position: string;
  linkedin_url: string;
  github_url: string;
  bio: string;
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
    research: "الأبحاث",
    crm: "العملاء والمبيعات",
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
    research: "Research",
    crm: "CRM & Sales",
  },
};
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
      history.pushState({}, "", pathFor(p));
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
  const oauth = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("auth_settings_unavailable");
      const settings = await response.json();
      if (settings.external?.google !== true) {
        setMessage(lang === "ar"
          ? "الدخول بجوجل غير مفعّل حاليًا. استخدم البريد وكلمة المرور."
          : "Google sign-in is not available yet. Use your email and password.");
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/dashboard` },
      });
      if (error) setMessage(error.message);
    } catch {
      setMessage(lang === "ar" ? "تعذر الاتصال بخدمة الدخول. حاول مرة أخرى." : "Unable to connect to sign-in. Try again.");
    } finally {
      setBusy(false);
    }
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
          <button onClick={oauth} disabled={busy}>G Google</button>
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
    [message, setMessage] = React.useState(""),
    [newPassword, setNewPassword] = React.useState("");
  const { roles } = useSession();
  React.useEffect(() => {
    getProfile(user).then((x) => x && setP({ ...empty, ...x }));
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

function Chat({ lang }: { lang: Lang }) {
  type PublicMessage = { role: "user" | "model"; text: string };
  const [open, setOpen] = React.useState(false);
  const [msgs, setMsgs] = React.useState<PublicMessage[]>([]);
  const [v, setV] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [handoff, setHandoff] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);
  const welcome = lang === "ar"
    ? "مرحبًا، أنا مساعد ريّد الذكي. كيف أقدر أساعدك اليوم؟"
    : "Hi, I’m Reid’s AI assistant. How can I help today?";
  React.useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy, handoff]);
  const send = async (suggestion?: string) => {
    const q = (suggestion ?? v).trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, text: q }];
    setMsgs(next);
    setV("");
    setHandoff(false);
    if (/(?:\b(?:human|person|agent|staff|team|contact|whats(?:app)?)\b|موظف|شخص|إنسان|احد|أحد|الفريق|اتواصل|تواصل|اتحدث|أتحدث|اكلم|أكلم|واتس|واتساب)/i.test(q)) {
      setMsgs([...next, {
        role: "model",
        text: lang === "ar" ? "أكيد، تقدر تتحدث الآن مع فريق ريّد." : "Of course. You can speak with the Reid team now.",
      }]);
      setHandoff(true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/public/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,lang,history:msgs.slice(-6)}),signal:AbortSignal.timeout(100000)});
      const data=await response.json();
      if (!response.ok || !data?.reply) throw new Error("assistant_unavailable");
      setMsgs([...next, { role: "model", text: data.reply }]);
      setHandoff(Boolean(data.handoff));
    } catch {
      setMsgs([...next, {
        role: "model",
        text: lang === "ar" ? "تعذر الرد مؤقتًا. حاول مرة أخرى بعد قليل." : "I couldn’t respond just now. Please try again shortly.",
      }]);
    } finally {
      setBusy(false);
    }
  };
  const n = import.meta.env.VITE_WHATSAPP_NUMBER || "96897308003",
    url = `https://wa.me/${n}?text=${encodeURIComponent(lang === "ar" ? "مرحبًا فريق ريّد، أريد التحدث مع أحد من الفريق." : "Hello Reid team, I would like to speak with someone.")}`;
  const suggestions = lang === "ar"
    ? ["ما خدماتكم؟", "كيف أنضم؟", "أريد التحدث مع شخص"]
    : ["What are your services?", "How can I join?", "Talk to a person"];
  return (
    <div className="chat">
      <button
        className="chat-launch"
        aria-label={lang === "ar" ? "افتح مساعد ريّد" : "Open Reid Assistant"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={23} /> : <MessageCircle size={25} />}
        {!open && <span className="chat-online" />}
      </button>
      {open && (
        <section className="chat-panel" aria-label={lang === "ar" ? "مساعد ريّد" : "Reid Assistant"}>
          <header>
            <div className="chat-identity">
              <span className="chat-avatar"><Sparkles size={20} /></span>
              <div>
                <b>{lang === "ar" ? "مساعد ريّد" : "Reid Assistant"}</b>
                <small><span />{lang === "ar" ? "مدعوم بالذكاء الاصطناعي" : "AI powered"}</small>
              </div>
            </div>
            <button aria-label={lang === "ar" ? "إغلاق" : "Close"} onClick={() => setOpen(false)}><X size={20} /></button>
          </header>
          <div className="chat-body">
            <p className="bot">{welcome}</p>
            {!msgs.length && <div className="chat-suggestions">
              {suggestions.map(item => <button key={item} onClick={() => void send(item)}>{item}</button>)}
            </div>}
            {msgs.map((m, i) => (
              <p key={`${m.role}-${i}`} className={m.role === "model" ? "bot" : "user"}>
                {m.text}
              </p>
            ))}
            {busy && <p className="bot chat-typing"><i /><i /><i /></p>}
            {handoff && <a className="chat-handoff" href={url} target="_blank" rel="noreferrer">
              <Headphones size={18} />
              <span>{lang === "ar" ? "تحدث مع فريق ريّد عبر واتساب" : "Chat with the Reid team on WhatsApp"}</span>
            </a>}
            <div ref={bottom} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={v}
              onChange={(e) => setV(e.target.value)}
              maxLength={800}
              aria-label={lang === "ar" ? "اكتب رسالتك" : "Type your message"}
              placeholder={lang === "ar" ? "اكتب رسالتك هنا…" : "Type your message…"}
            />
            <button aria-label={lang === "ar" ? "إرسال" : "Send"} disabled={busy || !v.trim()}>
              {busy ? <LoaderCircle className="chat-spinner" size={18} /> : <Send size={18} />}
            </button>
          </form>
          <small className="chat-privacy">{lang === "ar" ? "لا ترسل بيانات شخصية أو سرية" : "Don’t share personal or confidential data"}</small>
        </section>
      )}
    </div>
  );
}

function navLabel(page: Page, lang: Lang, t: (typeof tr)["ar"]): string {
  switch (page) {
    case "today": case "inbox": case "connections": case "operations": case "workshops":
    case "assistant": case "admin": case "owner": case "workspace": case "projects":
    case "research": case "crm": case "dashboard": case "profile": return workspaceLabel(page,lang);
    case "home":
      return t.home;
    case "apply":
      return t.join;
    default:
      return page;
  }
}

function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  React.useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase?.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    ) || { data: null };
    return () => data?.subscription.unsubscribe();
  }, []);
  return (
    <SessionProvider user={session?.user || null}>
      <Chrome session={session} />
    </SessionProvider>
  );
}

// Language and theme are per-viewer conveniences: remembered in this browser
// when storage is available, and harmless when it is not.
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* optional */ } };

function Chrome({ session }: { session: Session | null }) {
  const [page, go] = useRoute(),
    [lang, setLang] = React.useState<Lang>(() => (remembered("reid-lang") === "en" ? "en" : "ar")),
    [dark, setDark] = React.useState(() => {
      const saved = remembered("reid-theme");
      if (saved) return saved === "dark";
      return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
    }),
    t = tr[lang];
  // Roles, suspension and profile completion are resolved once by the shell.
  const access = useSession();
  const { reload: check } = access;
  const navigation = useNavigation();
  // /dashboard is where sign-in returns. A join-application link goes on to
  // People, and anyone agent management would refuse starts on their own page.
  React.useEffect(() => {
    if (page !== "dashboard") return;
    const params = new URLSearchParams(location.search);
    const redirect = (path: string) => { history.replaceState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); };
    if (params.has("review")) redirect(`/workspace?tab=applications&${params}`);
    else if (accessForPage("dashboard", access) === "forbidden") redirect(pathFor(landingPage(access.roles)));
  }, [page, access]);
  const internalPage = !!session && workspacePages.includes(page);
  React.useEffect(() => remember("reid-lang", lang), [lang]);
  React.useEffect(() => remember("reid-theme", dark ? "dark" : "light"), [dark]);
  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  React.useEffect(() => {
    const client = supabase;
    if (!session || !client) return;
    return installIdleTimeout(async () => {
      await client.auth.signOut();
      go("home");
    });
  }, [session]);
  const signOut = async () => { await supabase?.auth.signOut(); go("home"); };
  const userName = String(session?.user?.user_metadata?.full_name || session?.user?.email || (lang === "ar" ? "حسابي" : "My account"));
  const content = (
      <React.Suspense fallback={<main className="workspace-page-loading"><LoaderCircle/><span>{lang==='ar'?'جارٍ فتح المساحة…':'Opening workspace…'}</span></main>}>
      {page === "home" && <><PublicHome lang={lang} go={go} /><Chat lang={lang} /></>}
      {page === "workshops" && <Workshops lang={lang} go={go} />}
      {(["owner", "today", "inbox", "connections", "operations", "assistant", "admin"] as Page[]).includes(page) && (
        <Guarded page={page} lang={lang} renderSignIn={() => <Login lang={lang} done={() => go(page)} apply={() => go("apply")} />} onProfile={() => go("profile")}>
          {page === "today" && <Today lang={lang} go={go} />}
          {page === "owner" && <OwnerOverview lang={lang} go={go} />}
          {page === "inbox" && <Inbox lang={lang} go={go} />}
          {page === "connections" && <Connections lang={lang} go={go} />}
          {page === "operations" && <Operations lang={lang} />}
          {page === "assistant" && <AssistantWorkspace lang={lang} />}
          {page === "admin" && <AdminWorkspace lang={lang} go={go} />}
        </Guarded>
      )}
      {page === "login" && (
        <Login
          lang={lang}
          done={() => go("today")}
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
              await check();
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
        <Guarded
          page="dashboard"
          lang={lang}
          renderSignIn={() => (
            <Login lang={lang} done={() => go("dashboard")} apply={() => go("apply")} />
          )}
          onProfile={() => go("profile")}
        >
          <AgentManagement lang={lang} go={go} />
        </Guarded>
      )}{" "}
      {page === "workspace" && (
        <Guarded
          page="workspace"
          lang={lang}
          renderSignIn={() => (
            <Login lang={lang} done={() => go("workspace")} apply={() => go("apply")} />
          )}
          onProfile={() => go("profile")}
        >
          {session?.user && (
            <EmployeeWorkspace
              lang={lang}
              user={session.user}
              profile={() => go("profile")}
            />
          )}
        </Guarded>
      )}{" "}
      {page === "projects" && (
        <Guarded
          page="projects"
          lang={lang}
          renderSignIn={() => (
            <Login lang={lang} done={() => go("projects")} apply={() => go("apply")} />
          )}
          onProfile={() => go("profile")}
        >
          {session?.user && <ProjectWorkspace lang={lang} user={session.user} />}
        </Guarded>
      )}{" "}
      {page === "research" && (
        <Guarded
          page="research"
          lang={lang}
          renderSignIn={() => (
            <Login lang={lang} done={() => go("research")} apply={() => go("apply")} />
          )}
          onProfile={() => go("profile")}
        >
          {session?.user && <ResearchWorkspace lang={lang} user={session.user} />}
        </Guarded>
      )}{" "}
      {page === "crm" && (
        <Guarded
          page="crm"
          lang={lang}
          renderSignIn={() => (
            <Login lang={lang} done={() => go("crm")} apply={() => go("apply")} />
          )}
          onProfile={() => go("profile")}
        >
          {session?.user && <CrmWorkspace lang={lang} user={session.user} />}
        </Guarded>
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
      {page === "terms" && (
        <main className="legal">
          <h1>{lang === "ar" ? "شروط الاستخدام" : "Terms of Service"}</h1>
          <p>
            {lang === "ar"
              ? "باستخدام خدمات ريّد، توافق على استخدامها بصورة قانونية وعدم إساءة استخدام الحسابات أو الوكلاء أو بيانات الشركة. تخضع الإجراءات الحساسة لصلاحيات المستخدم والموافقة البشرية، ويجوز لريّد تعليق الوصول عند مخالفة هذه الشروط."
              : "By using Reid services, you agree to use them lawfully and not misuse accounts, agents, or company data. Sensitive actions remain subject to role permissions and human approval, and Reid may suspend access for violations."}
          </p>
        </main>
      )}{" "}
      {page === "data-deletion" && (
        <main className="legal">
          <h1>{lang === "ar" ? "طلب حذف البيانات" : "Data Deletion Request"}</h1>
          <p>
            {lang === "ar"
              ? "لطلب حذف بياناتك المرتبطة بريّد أو WhatsApp، أرسل رسالة من رقمك المسجّل إلى حساب ريّد على WhatsApp واكتب «حذف بياناتي»، أو راسل reid.contact.us@gmail.com. سنؤكد هويتك ونحذف البيانات غير الملزمين بالاحتفاظ بها قانونيًا."
              : "To request deletion of data connected to Reid or WhatsApp, message Reid from your registered WhatsApp number with “Delete my data”, or email reid.contact.us@gmail.com. We will verify your identity and delete data we are not legally required to retain."}
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
      </React.Suspense>
  );
  const appClass = `${dark ? "app dark" : "app"}${internalPage ? " workspace-mode" : ""}`;
  if (internalPage) {
    return (
      <div className={appClass} dir={lang === "ar" ? "rtl" : "ltr"}>
        <AppShell
          lang={lang} page={page} navigation={navigation} userName={userName} dark={dark} logo={reidLogo} go={go}
          toggleDark={() => setDark(value => !value)} toggleLang={() => setLang(value => (value === "ar" ? "en" : "ar"))}
          signOut={signOut}
        >
          {content}
        </AppShell>
      </div>
    );
  }
  return (
    <div className={appClass} dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="public-topbar">
        <button className="brand" onClick={() => go("home")}>
          <img src={reidLogo} alt="" aria-hidden="true" />
          <strong>{t.brand}</strong>
        </button>
        <nav>
          {/* Derived from src/routes.ts, so the navigation can never offer a
              destination the gate would then refuse. */}
          {navigation
            .filter(({ page: target }) => ["home", "workshops", "apply", "today"].includes(target))
            .map(({ page: target }) => (
              <button
                key={target}
                onClick={() => go(target)}
                aria-current={page === target ? "page" : undefined}
              >
                {navLabel(target, lang, t)}
              </button>
            ))}
          <button
            className="pill"
            onClick={() => go(session ? "profile" : "login")}
          >
            {session ? t.account : t.login}
          </button>
        </nav>
        <aside>
          <button onClick={() => setDark(!dark)} aria-label={dark ? "Light mode" : "Dark mode"}>{dark ? "☀" : "☾"}</button>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {lang === "ar" ? "EN" : "ع"}
          </button>
        </aside>
      </header>
      {content}
      <footer>
        <button className="text-link" onClick={() => go("privacy")}>
          {lang === "ar" ? "الخصوصية" : "Privacy"}
        </button>
        <button className="text-link" onClick={() => go("terms")}>
          {lang === "ar" ? "الشروط" : "Terms"}
        </button>
        <button className="text-link" onClick={() => go("data-deletion")}>
          {lang === "ar" ? "حذف البيانات" : "Data deletion"}
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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './style.css';
import './auth.css';
import './profile.css';

type Lang = 'ar' | 'en';
type Page = 'home' | 'dashboard' | 'apply' | 'login' | 'profile';
type Agent = { name: string; en: string; status: 'يعمل' | 'خامل' | 'متوقف'; task: string; level: string };

const agents: Agent[] = [
  ['CEO', 'Orchestrator', 'يعمل', 'التقرير التنفيذي', 'L3'], ['العمليات', 'Operations', 'يعمل', 'مراجعة المهام', 'L1'],
  ['التسويق', 'Marketing', 'خامل', '—', 'L2'], ['المحتوى', 'Content / Social', 'متوقف', 'مسودة LinkedIn', 'L2'],
  ['المبيعات', 'Sales / CRM', 'يعمل', 'ترتيب العملاء', 'L2'], ['التحليلات', 'Analytics', 'يعمل', 'مؤشرات الأسبوع', 'L1'],
  ['المعرفة', 'Knowledge', 'خامل', '—', 'L1'], ['الموارد البشرية', 'HR', 'يعمل', 'تقييم الطلبات', 'L3'],
  ['المالية', 'Finance', 'خامل', '—', 'L3'], ['دعم العملاء', 'Support', 'يعمل', 'تصنيف الرسائل', 'L2'],
  ['رصد المنافسين', 'Intelligence', 'يعمل', 'موجز السوق', 'L1'],
].map(([name, en, status, task, level]) => ({ name, en, status: status as Agent['status'], task, level }));

const copy = {
  ar: { brand: 'ريّد', home: 'الرئيسية', system: 'نظام الشركة', join: 'طلب انضمام', login: 'تسجيل الدخول', hero: 'نبني المستقبل بذكاء.', intro: 'ريّد شريك تقني عُماني يبني منتجات برمجية ووكلاء ذكاء اصطناعي موثوقين للشركات.', start: 'ابدأ معنا', discover: 'اكتشف النظام', platform: 'منصة عمل موحّدة', account: 'حسابي' },
  en: { brand: 'Reid', home: 'Home', system: 'Company system', join: 'Join request', login: 'Sign in', hero: 'Building the future intelligently.', intro: 'Reid is an Omani technology partner building software and dependable AI agents.', start: 'Start with us', discover: 'Explore the system', platform: 'One unified workspace', account: 'My profile' },
};

function Login({ lang, onDone, onApply }: { lang: Lang; onDone: () => void; onApply: () => void }) {
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMessage('');
    const data = new FormData(e.currentTarget);
    if (!supabase) { setMessage(lang === 'ar' ? 'ربط Supabase قيد الإعداد.' : 'Supabase connection is being configured.'); setBusy(false); return; }
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) });
      setMessage(error?.message ?? ''); if (!error) onDone();
    } else {
      const { error } = await supabase.auth.signUp({ email: String(data.get('email')), password: String(data.get('password')), options: { data: { full_name: data.get('full_name'), linkedin_url: data.get('linkedin'), github_url: data.get('github') || null } } });
      setMessage(error?.message ?? (lang === 'ar' ? 'تحقق من بريدك لإكمال التسجيل.' : 'Check your email to finish registration.'));
    }
    setBusy(false);
  };
  const oauth = async (provider: 'google' | 'azure') => {
    if (!supabase) return setMessage(lang === 'ar' ? 'ربط Supabase قيد الإعداد.' : 'Supabase connection is being configured.');
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/` } });
  };
  return <main className="auth"><section className="auth-card"><span>REID ACCOUNT</span><h1>{mode === 'login' ? copy[lang].login : (lang === 'ar' ? 'إنشاء حساب' : 'Create account')}</h1><p>{lang === 'ar' ? 'دخول آمن إلى مساحة عمل ريّد.' : 'Secure access to your Reid workspace.'}</p><div className="oauth"><button onClick={() => oauth('google')}>G&nbsp; Google</button><button onClick={() => oauth('azure')}>▦&nbsp; Microsoft</button></div><div className="or"><i />{lang === 'ar' ? 'أو بالبريد' : 'or with email'}<i /></div><form onSubmit={submit}>{mode === 'register' && <><label>{lang === 'ar' ? 'الاسم الكامل' : 'Full name'}<input name="full_name" required autoComplete="name" /></label><label>LinkedIn <em>{lang === 'ar' ? 'إجباري' : 'required'}</em><input name="linkedin" type="url" required placeholder="https://linkedin.com/in/..." pattern="https://(www\.)?linkedin\.com/.*" /></label><label>GitHub <em>{lang === 'ar' ? 'اختياري' : 'optional'}</em><input name="github" type="url" placeholder="https://github.com/..." pattern="https://(www\.)?github\.com/.*" /></label></>}<label>{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}<input name="email" type="email" required autoComplete="email" /></label><label>{lang === 'ar' ? 'كلمة المرور' : 'Password'}<input name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label><button className="primary" disabled={busy}>{busy ? '…' : mode === 'login' ? copy[lang].login : (lang === 'ar' ? 'إنشاء الحساب' : 'Create account')}</button></form>{message && <p className="form-message" role="status">{message}</p>}<button className="text-link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? (lang === 'ar' ? 'ليس لديك حساب؟ أنشئ حسابًا' : 'No account? Create one') : copy[lang].login}</button>{mode === 'register' && <button className="text-link" onClick={onApply}>{lang === 'ar' ? 'أو أرسل طلب انضمام' : 'Or submit a join request'}</button>}</section></main>;
}

function Chatbot({ lang }: { lang: Lang }) {
  const [open, setOpen] = React.useState(false); const [messages, setMessages] = React.useState<string[]>([]); const [value, setValue] = React.useState('');
  const send = () => { const q = value.trim(); if (!q) return; const wantsWhatsApp = /واتس|whatsapp/i.test(q); const answer = wantsWhatsApp ? (lang === 'ar' ? 'أكيد، اضغط زر واتساب وسأحوّلك لفريق ريّد.' : 'Sure — use the WhatsApp button to reach the Reid team.') : (lang === 'ar' ? 'أقدر أساعدك بالخدمات، المشاريع، طلبات الانضمام أو توصيلك بالفريق.' : 'I can help with services, projects, applications, or connecting you with the team.'); setMessages(x => [...x, q, answer]); setValue(''); };
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '96897308003';
  const whatsapp = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lang === 'ar' ? 'مرحبًا، وصلت من مساعد موقع ريّد وأحتاج مساعدة.' : 'Hello, I came from the Reid website assistant and need help.')}`;
  return <div className="chat"><button className="chat-launch" aria-label="Chat" onClick={() => setOpen(!open)}>✦</button>{open && <section className="chat-panel"><header><div><b>{lang === 'ar' ? 'مساعد ريّد' : 'Reid Assistant'}</b><small>{lang === 'ar' ? 'متصل الآن' : 'Online now'}</small></div><button onClick={() => setOpen(false)}>×</button></header><div className="chat-body"><p className="bot">{lang === 'ar' ? 'هلا! كيف أقدر أساعدك اليوم؟' : 'Hi! How can I help today?'}</p>{messages.map((m, i) => <p key={i} className={i % 2 ? 'bot' : 'user'}>{m}</p>)}</div><a className="whatsapp" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp ↗</a><form onSubmit={e => { e.preventDefault(); send(); }}><input value={value} onChange={e => setValue(e.target.value)} placeholder={lang === 'ar' ? 'اكتب رسالتك…' : 'Type your message…'} /><button>↑</button></form></section>}</div>;
}

function Profile({ lang, onSignOut }: { lang: Lang; onSignOut: () => void }) {
  const empty = { full_name: '', phone: '', department: '', position: '', linkedin_url: '', github_url: '', bio: '' };
  const [profile, setProfile] = React.useState(empty); const [message, setMessage] = React.useState('');
  React.useEffect(() => { (async () => { const { data: auth } = await supabase?.auth.getUser() ?? { data: { user: null } }; if (!auth.user) return; const result = await supabase?.from('profiles').select('full_name,phone,department,position,linkedin_url,github_url,bio').eq('id', auth.user.id).single(); if (result?.data) setProfile({ ...empty, ...result.data }); })(); }, []);
  const save = async (e: React.FormEvent) => { e.preventDefault(); const { data } = await supabase?.auth.getUser() ?? { data: { user: null } }; if (!data.user) return; const result = await supabase?.from('profiles').update(profile).eq('id', data.user.id); setMessage(result?.error?.message ?? (lang === 'ar' ? 'تم حفظ ملفك الشخصي.' : 'Profile saved.')); };
  const field = (name: keyof typeof profile, label: string, required = false, type = 'text') => <label>{label}<input type={type} required={required} value={profile[name]} onChange={e => setProfile(p => ({ ...p, [name]: e.target.value }))} /></label>;
  return <main className="profile"><span>REID PROFILE</span><h1>{copy[lang].account}</h1><section><div className="avatar">R</div><div><h2>{profile.full_name || (lang === 'ar' ? 'ملفك الشخصي' : 'Your profile')}</h2><p>{lang === 'ar' ? 'بيانات الحساب، الأدوار، المشاريع، الأبحاث والروابط المهنية في مكان واحد.' : 'Account details, roles, projects, research, and professional links in one place.'}</p></div></section><form className="profile-form" onSubmit={save}>{field('full_name', lang === 'ar' ? 'الاسم الكامل' : 'Full name', true)}{field('phone', lang === 'ar' ? 'الهاتف' : 'Phone')}{field('department', lang === 'ar' ? 'القسم' : 'Department')}{field('position', lang === 'ar' ? 'المسمى' : 'Position')}{field('linkedin_url', 'LinkedIn', true, 'url')}{field('github_url', 'GitHub', false, 'url')}<label className="wide">{lang === 'ar' ? 'نبذة' : 'Bio'}<textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} /></label><button className="primary">{lang === 'ar' ? 'حفظ الملف' : 'Save profile'}</button></form>{message && <p role="status">{message}</p>}<button className="text-link" onClick={onSignOut}>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</button></main>;
}

function App() {
  const [page, setPage] = React.useState<Page>('home'); const [lang, setLang] = React.useState<Lang>('ar'); const [dark, setDark] = React.useState(false); const [selected, setSelected] = React.useState<Agent | null>(null); const [sent, setSent] = React.useState(false); const [user, setUser] = React.useState(false); const t = copy[lang];
  React.useEffect(() => { supabase?.auth.getSession().then(({ data }) => setUser(Boolean(data.session))); const { data } = supabase?.auth.onAuthStateChange((_e, s) => setUser(Boolean(s))) ?? { data: null }; return () => data?.subscription.unsubscribe(); }, []);
  return <div className={dark ? 'app dark' : 'app'} dir={lang === 'ar' ? 'rtl' : 'ltr'}><header><button className="brand" onClick={() => setPage('home')}><i>R</i><strong>{t.brand}</strong></button><nav><button onClick={() => setPage('home')}>{t.home}</button><button onClick={() => setPage('dashboard')}>{t.system}</button><button onClick={() => setPage('apply')}>{t.join}</button><button className="pill" onClick={() => setPage(user ? 'profile' : 'login')}>{user ? t.account : t.login}</button></nav><aside><button onClick={() => setDark(!dark)}>{dark ? '☀' : '☾'}</button><button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'ع'}</button></aside></header>
    {page === 'home' && <main><section className="hero"><span>REID · TECHNOLOGY & AI</span><h1>{t.hero}</h1><p>{t.intro}</p><div><button className="primary" onClick={() => setPage('apply')}>{t.start} ←</button><button onClick={() => setPage('dashboard')}>{t.discover}</button></div><section className="stats"><article><b>11</b><small>AI Agents</small></article><article><b>5</b><small>Project Types</small></article><article><b>RLS</b><small>Secure by default</small></article></section></section><section className="features"><span>REID OS</span><h2>{t.platform}</h2><div><article><h3>Operations</h3><p>المشاريع والمهام والتقويم وساعات العمل ومؤشرات الأداء.</p></article><article><h3>People & Research</h3><p>الموظفون والفرق والأبحاث والمنشورات والموافقات.</p></article><article><h3>Agent Command</h3><p>الحالة والطابور والصلاحيات والذاكرة وسجل التنفيذ.</p></article></div></section><Chatbot lang={lang} /></main>}
    {page === 'login' && <Login lang={lang} onDone={() => setPage('profile')} onApply={() => setPage('apply')} />}
    {page === 'profile' && <Profile lang={lang} onSignOut={async () => { await supabase?.auth.signOut(); setPage('home'); }} />}
    {page === 'dashboard' && <main className="dashboard"><span>REID COMMAND CENTER</span><h1>خريطة الوكلاء الحية</h1><section className="kpis">{[['5', 'مشاريع نشطة'], ['42', 'مهام مفتوحة'], ['12', 'موظف'], ['8', 'عملاء محتملون'], ['3', 'موافقات']].map(x => <article key={x[1]}><b>{x[0]}</b><small>{x[1]}</small></article>)}</section><section className="grid">{agents.map(a => <button key={a.en} className={'agent ' + a.status} onClick={() => setSelected(a)}><i>R</i><b>{a.name}</b><small>{a.en} · {a.status}</small></button>)}</section>{selected && <aside className="drawer"><button onClick={() => setSelected(null)}>×</button><i>R</i><h2>{selected.name}</h2><p>{selected.en}</p><dl><dt>Current task</dt><dd>{selected.task}</dd><dt>LLM</dt><dd>gemma4:12b</dd><dt>Approval</dt><dd>{selected.level}</dd><dt>Host</dt><dd>ai-lap · Ollama</dd></dl></aside>}</main>}
    {page === 'apply' && <main className="apply">{sent ? <section className="sent"><b>✓</b><h1>تم استلام طلبك</h1><p>ستصلك رسالة عند القبول.</p></section> : <><span>JOIN REID</span><h1>طلب انضمام</h1><form onSubmit={e => { e.preventDefault(); setSent(true); }}>{[['الاسم الكامل', 'text', true], ['البريد الإلكتروني', 'email', true], ['رقم الهاتف', 'tel', true], ['الجهة / الجامعة', 'text', true], ['المسمى', 'text', true], ['LinkedIn', 'url', true], ['GitHub', 'url', false], ['المشروع / البحث', 'text', false]].map(x => <label key={String(x[0])}>{x[0]}<input required={Boolean(x[2])} type={String(x[1])} /></label>)}<label>نوع الحساب<select required><option /><option>موظف</option><option>عضو مشروع</option><option>باحث</option><option>متعاون خارجي</option></select></label><label className="wide">سبب الانضمام<textarea required /></label><label className="wide">رسالة تعريفية<textarea required /></label><label className="wide">CV اختياري<input type="file" accept="application/pdf" /></label><button className="primary">إرسال الطلب</button></form></>}</main>}
    <footer><b>{lang === 'ar' ? 'ريّد' : 'Reid'}</b><small>© 2026 · reidpro.com</small></footer></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

// Pure logic behind the owner overview: what needs a decision, how to greet,
// and whether the agent team can work. Kept apart from React so every rule is
// unit-tested.
import type { Page } from './routes';

export type Lang = 'ar' | 'en';

// The snapshot function still returns historical commercial fields. Reid runs
// as an organising workspace without money, so only these are read.
export type Snapshot = {
  as_of: string;
  metrics: { active_people: number; active_projects: number };
  alerts: { overdue_tasks: number; pending_approvals: number; pending_applications: number; failed_agent_runs_7d: number };
  projects: { id: string; name: string; status: string; target_date: string | null; overdue_tasks: number; risk_count: number }[];
};

export type Decision = {
  key: 'approvals' | 'applications' | 'tasks' | 'agents';
  count: number;
  page: Page;
  tone: 'danger' | 'warning' | 'brand';
  title: { ar: string; en: string };
  detail: { ar: string; en: string };
};

/** What needs the Owner, most consequential first. Zero counts are omitted. */
export function decisions(snapshot: Snapshot): Decision[] {
  const all: Decision[] = [
    { key: 'approvals', count: snapshot.alerts.pending_approvals, page: 'admin', tone: 'brand',
      title: { ar: 'موافقات بانتظارك', en: 'Approvals waiting for you' },
      detail: { ar: 'أوامر الوكلاء لا تُنفّذ قبل قرارك', en: 'Agent actions stay on hold until you decide' } },
    { key: 'agents', count: snapshot.alerts.failed_agent_runs_7d, page: 'dashboard', tone: 'danger',
      title: { ar: 'مهام وكلاء تعثّرت', en: 'Agent runs that failed' },
      detail: { ar: 'خلال آخر 7 أيام — راجع السبب قبل الإعادة', en: 'In the last 7 days — review before retrying' } },
    { key: 'tasks', count: snapshot.alerts.overdue_tasks, page: 'projects', tone: 'warning',
      title: { ar: 'مهام تجاوزت موعدها', en: 'Overdue tasks' },
      detail: { ar: 'تحتاج مسؤولًا أو موعدًا جديدًا', en: 'Need an owner or a new date' } },
    { key: 'applications', count: snapshot.alerts.pending_applications, page: 'dashboard', tone: 'brand',
      title: { ar: 'طلبات انضمام جديدة', en: 'New join applications' },
      detail: { ar: 'بانتظار قرار الإدارة', en: 'Waiting for a management decision' } },
  ];
  return all.filter(item => item.count > 0);
}

export function projectsNeedingAttention(snapshot: Snapshot) {
  return [...snapshot.projects]
    .sort((a, b) => b.risk_count - a.risk_count || b.overdue_tasks - a.overdue_tasks)
    .slice(0, 5);
}

/** Greeting in Muscat time, with the person's first name when known. */
export function greeting(now: Date, lang: Lang, fullName?: string | null): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Muscat' }).format(now));
  const first = (fullName || '').trim().split(/\s+/)[0];
  const phrase = hour < 12
    ? (lang === 'ar' ? 'صباح الخير' : 'Good morning')
    : hour < 18 ? (lang === 'ar' ? 'مساء الخير' : 'Good afternoon') : (lang === 'ar' ? 'مساء النور' : 'Good evening');
  return first && !first.includes('@') ? `${phrase}${lang === 'ar' ? '، ' : ', '}${first}` : phrase;
}

export function todayLine(now: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Muscat',
  }).format(now);
}

export function summaryLine(items: Decision[], lang: Lang): string {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return lang === 'ar' ? 'لا شيء ينتظر قرارك الآن. يومك تحت السيطرة.' : 'Nothing is waiting on you right now.';
  if (lang === 'en') return `${total} ${total === 1 ? 'item needs' : 'items need'} your decision today.`;
  // Arabic counting: أمر واحد يحتاج، أمران يحتاجان، 3–10 أمور تحتاج، 11+ أمرًا تحتاج.
  if (total === 1) return 'أمر واحد يحتاج قرارك اليوم.';
  if (total === 2) return 'أمران يحتاجان قرارك اليوم.';
  return `${total} ${total <= 10 ? 'أمور' : 'أمرًا'} تحتاج قرارك اليوم.`;
}

/** Arabic counted nouns: 1 and 2 have their own forms, 3–10 take the plural,
 *  11 and above the singular accusative. */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  return `${n} ${n >= 3 && n <= 10 ? forms.few : forms.many}`;
}

export const arabicForms = {
  overdueTasks: { one: 'مهمة متأخرة', two: 'مهمتان متأخرتان', few: 'مهام متأخرة', many: 'مهمة متأخرة' },
  riskSignals: { one: 'مؤشر خطر', two: 'مؤشرا خطر', few: 'مؤشرات خطر', many: 'مؤشر خطر' },
  failedRuns: { one: 'مهمة تعثّرت هذا الأسبوع', two: 'مهمتان تعثّرتا هذا الأسبوع', few: 'مهام تعثّرت هذا الأسبوع', many: 'مهمة تعثّرت هذا الأسبوع' },
} as const;

export type AgentHealth = 'online' | 'degraded' | 'offline' | 'unknown';

export function agentHealth(runner: { status: string; last_seen_at: string } | null, now: Date): AgentHealth {
  if (!runner) return 'unknown';
  const age = now.getTime() - Date.parse(runner.last_seen_at);
  if (!Number.isFinite(age) || age > 5 * 60_000) return 'offline';
  return runner.status === 'online' ? 'online' : 'degraded';
}

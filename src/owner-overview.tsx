// The Owner's starting point: what needs a decision, how the company is doing,
// and whether the agent team is ready. Every number opens the list behind it.
import React from 'react';
import {
  AlertTriangle, Bot, CalendarClock, CheckCircle2, ClipboardCheck, FolderKanban, Handshake, ListChecks, Plug, RefreshCw,
  ShieldCheck, Sparkles, UserPlus, UsersRound,
} from 'lucide-react';
import { list, messageFor, run, type AppError } from './db';
import type { Page } from './routes';
import { useSession } from './shell';
import { supabase } from './supabase';
import { Badge, Button, Card, EmptyState, IconButton, InlineAlert, ListRow, SectionHeader, Skeleton, StatCard, type Tone } from './ui';
import {
  agentHealth, arabicCount, arabicForms, decisions, greeting, projectsNeedingAttention, summaryLine, todayLine,
  type AgentHealth, type Decision, type Lang, type Snapshot,
} from './owner-overview.model';
import './owner-overview.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

type Team = { ready: number; total: number; health: AgentHealth };

const decisionIcons: Record<Decision['key'], React.ReactNode> = {
  approvals: <ShieldCheck />, agents: <Bot />, tasks: <CalendarClock />, applications: <UserPlus />,
};

const healthCopy: Record<AgentHealth, { tone: Tone; ar: string; en: string }> = {
  online: { tone: 'success', ar: 'متصل ويعمل', en: 'Online' },
  degraded: { tone: 'warning', ar: 'متصل بخلل', en: 'Degraded' },
  offline: { tone: 'danger', ar: 'غير متصل', en: 'Offline' },
  unknown: { tone: 'neutral', ar: 'غير معروف', en: 'Unknown' },
};

export function OwnerOverview({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const { user } = useSession();
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [team, setTeam] = React.useState<Team | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [busy, setBusy] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    const [company, agents, runner] = await Promise.all([
      run<Snapshot>(supabase.rpc('owner_company_snapshot')),
      list<{ id: string; enabled: boolean; status: string }>(supabase.from('agents').select('id,enabled,status')),
      run<{ status: string; last_seen_at: string }>(
        supabase.from('agent_runner_status').select('status,last_seen_at').eq('id', 'ai-lap').maybeSingle(),
      ),
    ]);
    if (company.ok) { setSnapshot(company.data); setError(null); } else setError(company.error);
    // The team card is secondary: if it cannot be read, it says "unknown"
    // rather than blocking the page.
    setTeam({
      ready: agents.ok ? agents.data.filter(agent => agent.enabled && agent.status !== 'paused').length : 0,
      total: agents.ok ? agents.data.filter(agent => agent.enabled).length : 0,
      health: runner.ok ? agentHealth(runner.data, new Date()) : 'unknown',
    });
    setBusy(false);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const pending = snapshot ? decisions(snapshot) : [];
  const fullName = (user?.user_metadata?.full_name as string | undefined) || null;
  const openProject = (id: string) => {
    go('projects');
    history.replaceState({}, '', `/projects/${id}`);
    dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="overview" aria-busy={busy}>
      <section className="overview-hero">
        <div className="overview-hero__text">
          <p className="overview-hero__date">{todayLine(now, lang)}</p>
          <h1>{greeting(now, lang, fullName)}</h1>
          <p className="overview-hero__summary">
            {busy && !snapshot ? tr(lang, 'نجهّز لك صورة الشركة…', 'Preparing your company picture…') : summaryLine(pending, lang)}
          </p>
        </div>
        <div className="overview-hero__actions">
          <Button variant="primary" size="lg" icon={<Sparkles />} onClick={() => go('assistant')}>
            {tr(lang, 'كلّف فريق الوكلاء', 'Brief the agent team')}
          </Button>
          <IconButton label={tr(lang, 'تحديث', 'Refresh')} icon={<RefreshCw />} onClick={() => void load()} disabled={busy} />
        </div>
      </section>

      {error && (
        <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'إعادة المحاولة', 'Try again')}</Button>}>
          {messageFor(error, lang)}
        </InlineAlert>
      )}

      <section className="overview-stats" aria-label={tr(lang, 'مؤشرات الشركة', 'Company indicators')}>
        <StatCard
          icon={<FolderKanban />} tone="brand" loading={busy && !snapshot} onOpen={() => go('projects')}
          label={tr(lang, 'مشاريع نشطة', 'Active projects')} value={snapshot?.metrics.active_projects ?? 0}
          hint={tr(lang, 'افتح لوحة المشاريع', 'Open projects')}
        />
        <StatCard
          icon={<CalendarClock />} tone={snapshot?.alerts.overdue_tasks ? 'warning' : 'neutral'} loading={busy && !snapshot}
          onOpen={() => go('projects')} label={tr(lang, 'مهام متأخرة', 'Overdue tasks')} value={snapshot?.alerts.overdue_tasks ?? 0}
          hint={snapshot?.alerts.overdue_tasks ? tr(lang, 'تحتاج متابعة', 'Need follow-up') : tr(lang, 'لا تأخير', 'Nothing late')}
        />
        <StatCard
          icon={<ClipboardCheck />} tone={snapshot?.alerts.pending_approvals ? 'danger' : 'neutral'} loading={busy && !snapshot}
          onOpen={() => go('admin')} label={tr(lang, 'موافقات بانتظارك', 'Awaiting approval')} value={snapshot?.alerts.pending_approvals ?? 0}
          hint={snapshot?.alerts.pending_approvals ? tr(lang, 'قرارك مطلوب', 'Your decision needed') : tr(lang, 'لا شيء معلّق', 'Nothing pending')}
        />
        <StatCard
          icon={<UsersRound />} tone="accent" loading={busy && !snapshot} onOpen={() => go('workspace')}
          label={tr(lang, 'فريق الشركة', 'Company team')} value={snapshot?.metrics.active_people ?? 0}
          hint={tr(lang, 'حسابات نشطة', 'Active accounts')}
        />
      </section>

      <div className="overview-grid">
        <div className="overview-grid__main">
          <Card>
            <SectionHeader
              title={tr(lang, 'يحتاج قرارك', 'Needs your decision')}
              action={pending.length ? <Badge tone="danger" dot>{pending.reduce((sum, item) => sum + item.count, 0)}</Badge> : undefined}
            />
            {busy && !snapshot ? <Skeleton lines={3} /> : pending.length ? (
              <div className="overview-list">
                {pending.map(item => (
                  <ListRow
                    key={item.key} dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={decisionIcons[item.key]} tone={item.tone}
                    title={item.title[lang]} description={item.detail[lang]} meta={<strong className="overview-count">{item.count}</strong>}
                    onOpen={() => go(item.page)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle2 />} title={tr(lang, 'لا شيء ينتظرك', 'All clear')}
                description={tr(lang, 'كل الموافقات والطلبات محسومة.', 'Every approval and request is settled.')}
              />
            )}
          </Card>

          <Card>
            <SectionHeader
              title={tr(lang, 'المشاريع التي تحتاج متابعة', 'Projects to watch')}
              action={<Button variant="ghost" size="sm" onClick={() => go('projects')}>{tr(lang, 'كل المشاريع', 'All projects')}</Button>}
            />
            {busy && !snapshot ? <Skeleton lines={3} /> : snapshot?.projects.length ? (
              <div className="overview-list">
                {projectsNeedingAttention(snapshot).map(project => {
                  const tone: Tone = project.risk_count ? 'danger' : project.overdue_tasks ? 'warning' : 'success';
                  const status = project.risk_count
                    ? tr(lang, arabicCount(project.risk_count, arabicForms.riskSignals), `${project.risk_count} at risk`)
                    : project.overdue_tasks
                      ? tr(lang, arabicCount(project.overdue_tasks, arabicForms.overdueTasks), `${project.overdue_tasks} overdue`)
                      : tr(lang, 'على المسار', 'On track');
                  return (
                    <ListRow
                      key={project.id} dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<FolderKanban />} tone={tone === 'success' ? 'brand' : tone}
                      title={project.name}
                      description={project.target_date
                        ? tr(lang, `الموعد المستهدف ${project.target_date}`, `Target ${project.target_date}`)
                        : tr(lang, 'بدون موعد مستهدف', 'No target date')}
                      meta={<Badge tone={tone}>{status}</Badge>}
                      onOpen={() => openProject(project.id)}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<FolderKanban />} title={tr(lang, 'لا توجد مشاريع نشطة', 'No active projects')} />
            )}
          </Card>
        </div>

        <aside className="overview-grid__side">
          <Card className="overview-team">
            <div className="overview-team__head">
              <span className="overview-team__mark" aria-hidden="true"><Sparkles /></span>
              <div>
                <h2>{tr(lang, 'فريق الوكلاء', 'Agent team')}</h2>
                {team
                  ? <Badge tone={healthCopy[team.health].tone} dot>{tr(lang, `الذكاء المحلي: ${healthCopy[team.health].ar}`, `Local AI: ${healthCopy[team.health].en}`)}</Badge>
                  : <Skeleton lines={1} />}
              </div>
            </div>
            <p className="overview-team__copy">
              {team && team.total
                ? tr(lang, `جاهز للعمل: ${team.ready} من ${team.total}. اطلب ملخصًا أو خطة أو تقريرًا.`, `${team.ready} of ${team.total} agents ready. Ask for a summary, a plan or a report.`)
                : tr(lang, 'اطلب من الوكلاء ملخصًا أو خطة أو تقريرًا بالعربي.', 'Ask the agents for a summary, a plan or a report.')}
            </p>
            {!!snapshot?.alerts.failed_agent_runs_7d && (
              <p className="overview-team__warning"><AlertTriangle aria-hidden="true" />
                {tr(lang, arabicCount(snapshot.alerts.failed_agent_runs_7d, arabicForms.failedRuns), `${snapshot.alerts.failed_agent_runs_7d} runs failed this week`)}
              </p>
            )}
            <div className="overview-team__actions">
              <Button variant="primary" icon={<Sparkles />} onClick={() => go('assistant')}>{tr(lang, 'افتح غرفة الفريق', 'Open the team room')}</Button>
              <Button variant="ghost" icon={<Bot />} onClick={() => go('dashboard')}>{tr(lang, 'إدارة الوكلاء', 'Manage agents')}</Button>
            </div>
          </Card>

          <Card>
            <SectionHeader title={tr(lang, 'اختصارات', 'Shortcuts')} />
            <div className="overview-list">
              <ListRow dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<ListChecks />} tone="brand" title={tr(lang, 'المهام والطلبات', 'Tasks & requests')} onOpen={() => go('operations')} />
              <ListRow dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<Handshake />} tone="accent" title={tr(lang, 'العملاء والمتابعات', 'Clients & follow-ups')} onOpen={() => go('crm')} />
              <ListRow dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<UsersRound />} tone="info" title={tr(lang, 'الفريق', 'People')} onOpen={() => go('workspace')} />
              <ListRow dir={lang === 'ar' ? 'rtl' : 'ltr'} icon={<Plug />} tone="neutral" title={tr(lang, 'الاتصالات وواتساب', 'Connections & WhatsApp')} onOpen={() => go('connections')} />
            </div>
          </Card>
        </aside>
      </div>

      {snapshot && (
        <p className="overview-asof">
          {tr(lang, 'آخر تحديث', 'Last updated')}{' '}
          {new Date(snapshot.as_of).toLocaleTimeString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })}
        </p>
      )}
    </main>
  );
}

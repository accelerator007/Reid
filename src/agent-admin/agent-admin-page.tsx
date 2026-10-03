// /dashboard — agent management: ai-lap's health, the roster by operating
// domain, the runs waiting on a human, the run log and the model providers.
// Opening an agent (?agent=id) shows its detail. HR, which may approve L3 runs
// but not read the agents, sees the approvals alone.
import React from 'react';
import { Activity, BrainCircuit, Bot, CheckCircle2, Clock3, Cpu, Gauge, HardDrive, ListChecks, LockKeyhole, MessagesSquare, RefreshCw, Server, ShieldAlert, ShieldCheck, Wifi } from 'lucide-react';
import { operationalState, topologyFor, type AgentRow, type ProviderRow } from '../agents';
import { messageFor, type AppError } from '../db';
import type { Page } from '../routes';
import { useSession } from '../shell';
import { Badge, Button, Card, EmptyState, InlineAlert, PageHeader, Skeleton, StatCard, TabPanel, Tabs, type TabItem } from '../ui';
import * as api from './api';
import { AgentDetail } from './agent-detail';
import { DecideDialog, RunRowView, when } from './agent-parts';
import {
  ageLabel, agentName, agentStates, canManageAgents, failedRunsLine, classificationLabels, domainLabels, levelLabel, openRun, providerRisk,
  providerRisks, rosterOrder, runStates, runnerHealth, stateCounts, type Lang,
} from './model';
import './agent-admin.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'roster' | 'approvals' | 'runs' | 'providers';
const agentFromUrl = () => new URLSearchParams(location.search).get('agent');

export function AgentManagement({ lang, go }: { lang: Lang; go?: (page: Page) => void }) {
  const { roles } = useSession();
  const manage = canManageAgents(roles);
  const [data, setData] = React.useState<api.AgentAdminData | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<Tab>(manage ? 'roster' : 'approvals');
  const [selected, setSelected] = React.useState<string | null>(agentFromUrl);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async () => {
    const result = await api.loadAgentAdmin(manage);
    if (result.data) setData(result.data);
    setError(result.error);
    setNow(Date.now());
  }, [manage]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    let timer: number | undefined;
    const stop = api.subscribeToAgents(manage, () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 400); });
    // The heartbeat age keeps moving between database changes.
    const tick = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { stop(); window.clearTimeout(timer); window.clearInterval(tick); };
  }, [load, manage]);
  React.useEffect(() => {
    const follow = () => setSelected(agentFromUrl());
    addEventListener('popstate', follow);
    return () => removeEventListener('popstate', follow);
  }, []);

  const open = (id: string) => { history.pushState({}, '', `/dashboard?agent=${id}`); setSelected(id); scrollTo(0, 0); };
  const back = () => { history.pushState({}, '', '/dashboard'); setSelected(null); };
  const providerOf = React.useCallback((agent: AgentRow) => data?.providers.find(provider => provider.id === agent.provider_id), [data]);

  const agent = manage && selected ? data?.agents.find(candidate => candidate.id === selected) : undefined;
  if (agent && data) {
    return <AgentDetail lang={lang} agent={agent} provider={providerOf(agent)} data={data} back={back} reload={load} />;
  }

  const agents = data ? rosterOrder(data.agents) : [];
  const counts = data ? stateCounts(agents, data.providers, data.runs) : null;
  const failed24h = data?.runs.filter(item => item.run_state === 'failed' && now - new Date(item.created_at).getTime() < 86_400_000).length ?? 0;
  const tabs: TabItem<Tab>[] = manage
    ? [
      { id: 'roster', label: tr(lang, 'الوكلاء', 'Agents'), icon: <Bot />, count: agents.length },
      { id: 'approvals', label: tr(lang, 'الموافقات', 'Approvals'), icon: <ShieldCheck />, count: data?.pending.length },
      { id: 'runs', label: tr(lang, 'سجل التشغيل', 'Run log'), icon: <ListChecks />, count: data?.runs.length },
      { id: 'providers', label: tr(lang, 'المزوّدون', 'Providers'), icon: <Server />, count: data?.providers.length },
    ]
    : [{ id: 'approvals', label: tr(lang, 'الموافقات', 'Approvals'), icon: <ShieldCheck />, count: data?.pending.length }];

  return (
    <main className="agents-admin">
      <PageHeader
        title={tr(lang, 'إدارة الوكلاء', 'Agent management')}
        description={manage
          ? <>{tr(lang, 'حالة كل وكيل وصلاحياته، وما ينتظر قرارك، وصحة جهاز ', 'Every agent’s state and access, what waits on you, and the health of ')}<bdi className="agents-nowrap">ai-lap</bdi>{tr(lang, ' الذي يشغّلهم.', ' that runs them.')}</>
          : tr(lang, 'تشغيلات الوكلاء التي تنتظر موافقتك.', 'Agent runs waiting for your approval.')}
        actions={<>
          {go && manage && <Button icon={<MessagesSquare />} onClick={() => go('assistant')}>{tr(lang, 'غرفة الوكلاء', 'Agent room')}</Button>}
          <Button icon={<RefreshCw />} onClick={() => void load()}>{tr(lang, 'تحديث', 'Refresh')}</Button>
        </>}
      />

      {error && <InlineAlert action={<Button size="sm" onClick={() => void load()}>{tr(lang, 'أعد المحاولة', 'Try again')}</Button>}>{messageFor(error, lang)}</InlineAlert>}
      {manage && selected && data && !agent && <InlineAlert tone="warning">{tr(lang, 'هذا الوكيل غير موجود.', 'This agent does not exist.')}</InlineAlert>}

      {manage && (
        <div className="agents-overview">
          <RunnerCard lang={lang} data={data} now={now} />
          <div className="agents-stats">
            <StatCard icon={<CheckCircle2 />} tone="success" label={tr(lang, 'جاهز', 'Ready')} value={counts?.ready ?? 0} loading={!data} />
            <StatCard icon={<Activity />} tone="brand" label={tr(lang, 'يعمل الآن', 'Working')} value={counts?.working ?? 0} loading={!data} />
            <StatCard icon={<Clock3 />} tone={data?.pending.length ? 'warning' : 'neutral'} label={tr(lang, 'ينتظر موافقة', 'Awaiting approval')}
              value={data?.pending.length ?? 0} loading={!data} onOpen={() => setTab('approvals')} />
            <StatCard icon={<ShieldAlert />} tone={(counts?.blocked ?? 0) + failed24h ? 'danger' : 'neutral'} label={tr(lang, 'يحتاج انتباه', 'Needs attention')}
              value={(counts?.blocked ?? 0) + (counts?.error ?? 0)} loading={!data}
              hint={failedRunsLine(failed24h, lang)} onOpen={() => setTab('runs')} />
          </div>
        </div>
      )}

      <Tabs items={tabs} value={tab} onChange={setTab} label={tr(lang, 'أقسام إدارة الوكلاء', 'Agent management sections')} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <TabPanel id={tab}>
        {!data && !error && <Skeleton lines={6} />}
        {data && tab === 'roster' && <Roster lang={lang} agents={agents} providerOf={providerOf} data={data} open={open} />}
        {data && tab === 'approvals' && <Approvals lang={lang} data={data} reload={load} manage={manage} />}
        {data && tab === 'runs' && <RunLog lang={lang} data={data} open={manage ? open : undefined} />}
        {data && tab === 'providers' && <Providers lang={lang} providers={data.providers} agents={agents} />}
      </TabPanel>
    </main>
  );
}

function RunnerCard({ lang, data, now }: { lang: Lang; data: api.AgentAdminData | null; now: number }) {
  const runner = data?.runner ?? null;
  const health = runnerHealth(runner, now);
  const meters: Array<[React.ReactNode, string, string, number | null]> = [
    [<Wifi key="p" />, tr(lang, 'زمن النموذج', 'Model latency'), runner?.adapter_latency_ms != null ? `${runner.adapter_latency_ms} ms` : '—', runner?.adapter_latency_ms != null ? Math.min(100, runner.adapter_latency_ms / 4) : null],
    [<Wifi key="n" />, tr(lang, 'اتصال السحابة', 'Cloud ping'), runner?.ping_ms != null ? `${runner.ping_ms} ms` : '—', runner?.ping_ms != null ? Math.min(100, runner.ping_ms / 4) : null],
    [<Cpu key="c" />, tr(lang, 'المعالج', 'CPU'), runner?.cpu_percent != null ? `${runner.cpu_percent}%` : '—', runner?.cpu_percent ?? null],
    [<HardDrive key="m" />, tr(lang, 'الذاكرة', 'Memory'), runner?.memory_used_gb != null ? `${runner.memory_used_gb} / ${runner.memory_total_gb} GB` : '—', health.memory],
    [<Gauge key="g" />, tr(lang, 'كرت الشاشة', 'GPU'), runner?.gpu_utilization != null ? `${runner.gpu_utilization}%` : '—', runner?.gpu_utilization ?? null],
    [<HardDrive key="v" />, tr(lang, 'ذاكرة الكرت', 'VRAM'), runner?.vram_used_mb != null ? `${Math.round(runner.vram_used_mb / 1024 * 10) / 10} / ${Math.round((runner.vram_total_mb ?? 0) / 1024 * 10) / 10} GB` : '—', health.vram],
  ];
  return (
    <Card className="runner" data-online={health.online}>
      <div className="runner__head">
        <span className="runner__icon" aria-hidden="true"><Server /></span>
        <div className="runner__name">
          <strong>ai-lap</strong>
          <span><bdi dir="ltr">{runner?.model || 'gemma4:12b'}{runner?.version ? ` · v${runner.version}` : ''}</bdi></span>
        </div>
        {!data ? <Badge>{tr(lang, 'جارٍ الفحص', 'Checking')}</Badge>
          : <Badge tone={health.online ? 'success' : 'danger'} dot>{health.online ? tr(lang, 'متصل', 'Online') : tr(lang, 'غير متصل', 'Offline')}</Badge>}
      </div>
      <div className="runner__meters">
        {meters.map(([icon, label, value, percent]) => (
          <div className="runner__meter" key={label}>
            <span className="runner__label"><span aria-hidden="true">{icon}</span>{label}</span>
            <b><bdi dir="ltr">{value}</bdi></b>
            <span className="runner__bar" aria-hidden="true"><i style={{ inlineSize: `${Math.max(0, Math.min(100, percent ?? 0))}%` }} data-high={(percent ?? 0) >= 85} /></span>
          </div>
        ))}
      </div>
      <small className="runner__foot">
        {runner?.gpu ? `${runner.gpu} · ` : ''}{tr(lang, 'آخر نبضة', 'Last heartbeat')}: {ageLabel(health.ageSeconds, lang)}
      </small>
    </Card>
  );
}

function Roster({ lang, agents, providerOf, data, open }: {
  lang: Lang; agents: AgentRow[]; providerOf: (agent: AgentRow) => ProviderRow | undefined; data: api.AgentAdminData; open: (id: string) => void;
}) {
  if (!agents.length) return <EmptyState icon={<Bot />} title={tr(lang, 'لا يوجد وكلاء', 'No agents')} />;
  const card = (agent: AgentRow) => {
    const node = topologyFor(agent.id);
    const state = operationalState(agent, providerOf(agent), data.runs);
    const queue = data.runs.filter(item => item.agent_id === agent.id && openRun(item)).length;
    return (
      <button type="button" className="agent-tile" key={agent.id} data-state={state} onClick={() => open(agent.id)}>
        <span className="agent-tile__top">
          <span className="agent-tile__icon" aria-hidden="true">{agent.id === 'ceo' ? <BrainCircuit /> : <Bot />}</span>
          <Badge tone={agentStates[state].tone} dot>{agentStates[state].label[lang]}</Badge>
        </span>
        <span className="agent-tile__domain">{node ? domainLabels[node.domain][lang] : tr(lang, 'وكيل', 'Agent')}</span>
        <strong>{agentName(agent, lang)}</strong>
        {node && <span className="agent-tile__purpose">{node.purpose[lang]}</span>}
        <span className="agent-tile__meta">
          <span>{classificationLabels[agent.classification].label[lang]}</span>
          <span>L{agent.approval_level}</span>
          {queue > 0 && <span className="agent-tile__queue">{tr(lang, `${queue} في الطابور`, `${queue} queued`)}</span>}
        </span>
      </button>
    );
  };
  return <div className="agents-grid">{agents.map(card)}</div>;
}

function Approvals({ lang, data, reload, manage }: { lang: Lang; data: api.AgentAdminData; reload: () => Promise<void>; manage: boolean }) {
  const [deciding, setDeciding] = React.useState<api.RunWithRequester | null>(null);
  const label = (id: string) => { const agent = data.agents.find(item => item.id === id); return agent ? agentName(agent, lang) : agentName({ id, name: id }, lang); };
  if (!data.pending.length) {
    return <EmptyState icon={<ShieldCheck />} title={tr(lang, 'لا شيء ينتظر قرارك', 'Nothing is waiting on you')}
      description={tr(lang, 'الإجراءات الحساسة (المستوى الثاني فأعلى) تتوقف هنا قبل تنفيذها.', 'Sensitive actions (level 2 and up) stop here before they run.')} />;
  }
  return (
    <>
      {!manage && <InlineAlert tone="info">{tr(lang, 'تظهر لك التشغيلات التي تملك صلاحية اعتمادها فقط.', 'Only runs you may approve are shown.')}</InlineAlert>}
      <div className="agents-list">
        {data.pending.map(item => (
          <Card as="article" key={item.id} className="approval">
            <span className="approval__icon" aria-hidden="true"><Clock3 /></span>
            <div className="approval__body">
              <strong>{label(item.agent_id)}</strong>
              <b className="approval__action" dir="ltr">{item.requested_tool || tr(lang, 'تشغيل محادثة', 'Conversation run')}</b>
              <span>{levelLabel(item.approval_level, lang)} · {tr(lang, 'بيانات', 'Data')}: {classificationLabels[item.classification].label[lang]}</span>
              <small>{data.names.get(item.requested_by ?? '') ?? tr(lang, 'مستخدم', 'A user')} · {when(item.created_at, lang)}</small>
            </div>
            <Badge tone="warning">L{item.approval_level}</Badge>
            <Button variant="primary" onClick={() => setDeciding(item)}>{tr(lang, 'مراجعة وقرار', 'Review')}</Button>
          </Card>
        ))}
      </div>
      <DecideDialog lang={lang} run={deciding} agentLabel={deciding ? label(deciding.agent_id) : ''} onClose={() => setDeciding(null)} onDone={reload} />
    </>
  );
}

function RunLog({ lang, data, open }: { lang: Lang; data: api.AgentAdminData; open?: (id: string) => void }) {
  const [filter, setFilter] = React.useState<'all' | 'failed' | 'open'>('all');
  const runs = data.runs.filter(item => filter === 'all' || (filter === 'failed' ? item.run_state === 'failed' : openRun(item)));
  const label = (id: string) => { const agent = data.agents.find(item => item.id === id); return agent ? agentName(agent, lang) : agentName({ id, name: id }, lang); };
  return (
    <>
      <div className="agents-chips" role="group" aria-label={tr(lang, 'تصفية السجل', 'Filter the log')}>
        {([['all', 'الكل', 'All'], ['open', 'الجارية', 'In progress'], ['failed', 'الفاشلة', 'Failed']] as const).map(([id, ar, en]) => (
          <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{tr(lang, ar, en)}</button>
        ))}
      </div>
      {runs.length ? (
        <div className="agents-list">
          {runs.map(item => <RunRowView key={item.id} lang={lang} run={item} agentLabel={label(item.agent_id)} requester={data.names.get(item.requested_by ?? '')} onAgent={open ? () => open(item.agent_id) : undefined} />)}
        </div>
      ) : <EmptyState icon={<ListChecks />} title={tr(lang, 'لا تشغيلات هنا', 'No runs here')} />}
    </>
  );
}

function Providers({ lang, providers, agents }: { lang: Lang; providers: ProviderRow[]; agents: AgentRow[] }) {
  if (!providers.length) return <EmptyState icon={<Server />} title={tr(lang, 'لا مزوّدين', 'No providers')} />;
  return (
    <>
      <InlineAlert tone="info">
        {tr(lang,
          'كل مزوّد له سقف لتصنيف البيانات التي يُسمح بإرسالها له. قاعدة البيانات ترفض أي تشغيل يتجاوز السقف حتى لو حاولت الواجهة.',
          'Each provider has a ceiling on the data it may receive. The database refuses any run above it, whatever the interface does.')}
      </InlineAlert>
      <div className="providers">
        {providers.map(provider => {
          const risk = providerRisk(provider);
          const users = agents.filter(agent => agent.provider_id === provider.id);
          return (
            <Card key={provider.id} className="provider" data-risk={!!risk}>
              <div className="provider__head">
                <span className="provider__icon" aria-hidden="true">{provider.kind === 'local' ? <Server /> : <Wifi />}</span>
                <div>
                  <strong>{provider.name}</strong>
                  <span><bdi dir="ltr">{provider.chat_model}</bdi></span>
                </div>
                <Badge tone={provider.enabled ? 'success' : 'neutral'} dot>{provider.enabled ? tr(lang, 'يعمل', 'On') : tr(lang, 'متوقف', 'Off')}</Badge>
              </div>
              <dl className="provider__facts">
                <div><dt>{tr(lang, 'النوع', 'Kind')}</dt><dd>{provider.kind === 'local' ? tr(lang, 'محلي على أجهزتنا', 'Local, on our hardware') : tr(lang, 'خدمة خارجية', 'External service')}</dd></div>
                <div><dt>{tr(lang, 'أعلى تصنيف مسموح', 'Highest data allowed')}</dt><dd>{classificationLabels[provider.max_classification].label[lang]}</dd></div>
                <div><dt>{tr(lang, 'يحتفظ بالبيانات', 'Keeps data')}</dt><dd>{provider.retains_data ? tr(lang, 'نعم', 'Yes') : tr(lang, 'لا', 'No')}</dd></div>
                <div><dt>{tr(lang, 'الوكلاء عليه', 'Agents on it')}</dt><dd>{users.length}</dd></div>
              </dl>
              {risk && <InlineAlert tone={risk === 'retains_sensitive' ? 'danger' : 'warning'}>{providerRisks[risk][lang]}</InlineAlert>}
            </Card>
          );
        })}
      </div>
      <p className="agents-note"><LockKeyhole aria-hidden="true" />{tr(lang, 'تغيير المزوّدين وسقوفهم للمالك فقط، ويتم من قاعدة البيانات مع سجل تدقيق.', 'Changing providers and their ceilings is owner-only and done in the database with an audit trail.')}</p>
    </>
  );
}

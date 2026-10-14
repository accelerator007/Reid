// /dashboard — agent management: ai-lap's health, the roster by operating
// domain, the runs waiting on a human, the run log and the model providers.
// Opening an agent (?agent=id) shows its detail. HR, which may approve L3 runs
// but not read the agents, sees the approvals alone.
import React from 'react';
import { Activity, BrainCircuit, Bot, CheckCircle2, CirclePlus, Clock3, Copy, Cpu, Gauge, HardDrive, KeyRound, ListChecks, LockKeyhole, MessagesSquare, Pencil, Power, RefreshCw, Server, ShieldAlert, ShieldCheck, TestTube2, Trash2, Wifi } from 'lucide-react';
import { operationalState, topologyFor, type AgentRow, type ProviderRow } from '../agents';
import { messageFor, type AppError } from '../db';
import { localError } from '../local-api';
import type { Page } from '../routes';
import { useSession } from '../shell';
import { Badge, Button, Card, Dialog, EmptyState, Field, FormGrid, InlineAlert, PageHeader, Select, Skeleton, StatCard, TabPanel, Tabs, TextArea, TextInput, type TabItem } from '../ui';
import * as api from './api';
import { RuntimeHealth } from './runtime-health';
import { AgentDetail } from './agent-detail';
import { DecideDialog, RunRowView, when } from './agent-parts';
import {
  ageLabel, agentName, agentStates, canManageAgents, canToggleAgents, failedRunsLine, classificationLabels, domainLabels, levelLabel, openRun, providerRisk,
  providerRisks, rosterOrder, runStates, runnerHealth, stateCounts, type Lang,
} from './model';
import './agent-admin.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'roster' | 'approvals' | 'runs' | 'providers';
const agentFromUrl = () => new URLSearchParams(location.search).get('agent');

export function AgentManagement({ lang, go }: { lang: Lang; go?: (page: Page) => void }) {
  const { roles } = useSession();
  const manage = canManageAgents(roles);
  const owner = canToggleAgents(roles);
  const [data, setData] = React.useState<api.AgentAdminData | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [tab, setTab] = React.useState<Tab>(manage ? 'roster' : 'approvals');
  const [selected, setSelected] = React.useState<string | null>(agentFromUrl);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async () => {
    const result = await api.loadAgentAdmin(manage,owner);
    if (result.data) setData(result.data);
    setError(result.error);
    setNow(Date.now());
  }, [manage,owner]);
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

      {owner && <RuntimeHealth lang={lang}/>}
      <Tabs items={tabs} value={tab} onChange={setTab} label={tr(lang, 'أقسام إدارة الوكلاء', 'Agent management sections')} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <TabPanel id={tab}>
        {!data && !error && <Skeleton lines={6} />}
        {data && tab === 'roster' && <Roster lang={lang} agents={agents} providerOf={providerOf} data={data} open={open} />}
        {data && tab === 'approvals' && <Approvals lang={lang} data={data} reload={load} manage={manage} />}
        {data && tab === 'runs' && <RunLog lang={lang} data={data} open={manage ? open : undefined} />}
        {data && tab === 'providers' && <Providers lang={lang} providers={data.providers} agents={agents} owner={owner} reload={load} />}
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
      <DecideDialog lang={lang} run={deciding} agentLabel={deciding ? label(deciding.agent_id) : ''} tools={data.tools} onClose={() => setDeciding(null)} onDone={reload} />
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

const providerFailure=(error:unknown,lang:Lang)=>{
  const code=error instanceof Error?error.message:'';
  const messages:Record<string,[string,string]>={
    provider_exists:['هذا المعرّف مستخدم؛ اختر معرّفًا مختلفًا.','That ID is already used; choose another.'],
    provider_key_required:['أدخل مفتاح API أولًا.','Add the API key first.'],
    provider_test_required:['اختبر الاتصال بنجاح قبل التفعيل.','Test the connection successfully before enabling it.'],
    provider_in_use:['انقل الوكلاء إلى مزوّد آخر قبل الحذف.','Move its agents to another provider before deleting it.'],
    builtin_provider_protected:['المزوّد الأساسي لا يُحذف؛ يمكنك تعطيله أو تعديله.','A built-in provider cannot be deleted; disable or edit it.'],
    provider_not_cleared:['المزوّد متوقف أو لا يسمح بتصنيف بيانات هذا الوكيل.','The provider is off or is not cleared for this agent’s data.'],
    local_provider_offline:['جهاز ai-lap غير متصل الآن.','ai-lap is offline.'],
    provider_http_401:['رفض المزوّد المفتاح. تحقق من API Key وصلاحياته.','The provider rejected the key. Check its API key and permissions.'],
    provider_http_403:['المفتاح لا يملك صلاحية استخدام هذا النموذج.','The key is not allowed to use this model.'],
    provider_http_404:['الرابط أو اسم النموذج غير صحيح.','The endpoint or model name is incorrect.'],
    provider_http_429:['حصة المزوّد أو حد السرعة منتهٍ حاليًا.','The provider quota or rate limit is currently exhausted.'],
    provider_models_unavailable:['لم يرجع الـAPI قائمة مودلات محادثة صالحة؛ اختر المودل يدويًا.','The API returned no usable chat models; choose a model manually.'],
    provider_test_failed:['تعذر التحقق من المزوّد. راجع الرابط والمفتاح ثم أعد الاختبار.','The provider could not be verified. Check the endpoint and key, then test again.'],
  };
  return (messages[code]||[localError(error,'ar'),localError(error,'en')])[lang==='ar'?0:1];
};

function Providers({ lang, providers, agents, owner, reload }: { lang: Lang; providers: ProviderRow[]; agents: AgentRow[]; owner:boolean; reload:()=>Promise<void> }) {
  const [editing,setEditing]=React.useState<ProviderRow|'new'|null>(null);
  const [busy,setBusy]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [error,setError]=React.useState('');
  const number=(value:number)=>new Intl.NumberFormat(lang==='ar'?'ar-OM':'en',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value||0);
  const totals=providers.reduce((sum,provider)=>({requests:sum.requests+(provider.usage?.requests_24h||0),tokens:sum.tokens+(provider.usage?.total_tokens_30d||0),failed:sum.failed+(provider.usage?.failed_30d||0)}),{requests:0,tokens:0,failed:0});
  const act=async(id:string,run:()=>Promise<unknown>,success:string)=>{setBusy(id);setError('');setNotice('');try{await run();await reload();setNotice(success);}catch(thrown){setError(providerFailure(thrown,lang));}finally{setBusy('');}};
  const clone=(provider:ProviderRow)=>setEditing({...provider,id:`${provider.id}_copy`,name:`${provider.name} ${tr(lang,'نسخة','copy')}`,enabled:false,has_api_key:false,last_test_status:'untested',last_tested_at:null,last_test_latency_ms:null,last_test_error:null,created_at:undefined,updated_at:undefined});
  return <>
    <div className="providers-title"><div><h2>{tr(lang,'مركز نماذج ريد','Reid Model Center')}</h2><p>{tr(lang,'كل مودلات ريد واستهلاكها وحالتها في مكان واحد.','Every Reid model, its usage, and its live state in one place.')}</p></div>{owner&&<Button variant="primary" icon={<CirclePlus/>} onClick={()=>setEditing('new')}>{tr(lang,'إضافة API','Add API')}</Button>}</div>
    {error&&<InlineAlert>{error}</InlineAlert>}{notice&&<InlineAlert tone="success">{notice}</InlineAlert>}
    <div className="provider-summary" aria-label={tr(lang,'ملخص استخدام النماذج','Model usage summary')}>
      <div><span>{tr(lang,'اتصالات نشطة','Active connections')}</span><strong><bdi dir="ltr">{providers.filter(item=>item.enabled).length}<small> / {providers.length}</small></bdi></strong></div>
      <div><span>{tr(lang,'طلبات 24 ساعة','Requests · 24h')}</span><strong>{number(totals.requests)}</strong></div>
      <div><span>{tr(lang,'توكنات 30 يوم','Tokens · 30d')}</span><strong>{number(totals.tokens)}</strong></div>
      <div data-alert={totals.failed>0}><span>{tr(lang,'أخطاء 30 يوم','Failures · 30d')}</span><strong>{number(totals.failed)}</strong></div>
    </div>
    <InlineAlert tone="info">{tr(lang,'المفتاح يُشفّر في Supabase Vault ولا يظهر مرة أخرى. أي تغيير في الرابط أو النموذج أو المفتاح يوقف المزوّد حتى ينجح الاختبار الجديد.','The key is encrypted in Supabase Vault and is never shown again. Changing the endpoint, model, or key pauses the provider until a new test succeeds.')}</InlineAlert>
    {!providers.length?<EmptyState icon={<Server />} title={tr(lang,'لا يوجد مزوّدون','No providers')} description={tr(lang,'أضف أول اتصال API ليبدأ ريد باستخدامه.','Add the first API connection for Reid to use.')}/>:<div className="providers">{providers.map(provider=>{
      const risk=providerRisk(provider),users=agents.filter(agent=>agent.provider_id===provider.id),tested=provider.last_test_status||'untested';
      const usage=provider.usage||{requests_24h:0,tokens_24h:0,requests_30d:0,succeeded_30d:0,failed_30d:0,prompt_tokens_30d:0,completion_tokens_30d:0,total_tokens_30d:0,average_latency_ms_30d:null,requests_total:0,total_tokens_total:0,last_used_at:null};
      const model=provider.model_mode==='auto'?provider.chat_model==='auto'?tr(lang,'تلقائي · ينتظر الاختبار','Auto · waiting for test'):`${tr(lang,'تلقائي','Auto')} → ${provider.chat_model}`:provider.chat_model;
      return <Card key={provider.id} className="provider" data-risk={!!risk}>
        <div className="provider__head"><span className="provider__icon" aria-hidden="true">{provider.kind==='local'?<Server/>:<Wifi/>}</span><div><strong>{provider.name}</strong><span><bdi dir="ltr">{model}</bdi></span></div><Badge tone={provider.enabled?'success':'neutral'} dot>{provider.enabled?tr(lang,'نشط','Active'):tr(lang,'متوقف','Off')}</Badge></div>
        <div className="provider__connection"><span><KeyRound/>{provider.kind==='local'?tr(lang,'اتصال داخلي','Internal connection'):provider.has_api_key?tr(lang,'المفتاح محفوظ','Key saved'):tr(lang,'لا يوجد مفتاح','No key')}</span><Badge tone={tested==='success'?'success':tested==='failed'?'danger':'neutral'}>{tested==='success'?tr(lang,`مختبر · ${provider.last_test_latency_ms??0}ms`,`Tested · ${provider.last_test_latency_ms??0}ms`):tested==='failed'?tr(lang,'فشل الاختبار','Test failed'):tr(lang,'غير مختبر','Not tested')}</Badge></div>
        <dl className="provider__facts"><div><dt>{tr(lang,'البروتوكول','Protocol')}</dt><dd>{provider.api_style==='openai_compatible'?'OpenAI compatible':provider.api_style==='ollama'?'Ollama':'Google Gemini'}</dd></div><div><dt>{tr(lang,'أعلى تصنيف','Highest data')}</dt><dd>{classificationLabels[provider.max_classification].label[lang]}</dd></div><div><dt>{tr(lang,'الاحتفاظ بالبيانات','Data retention')}</dt><dd>{provider.retains_data?tr(lang,'نعم','Yes'):tr(lang,'لا','No')}</dd></div><div><dt>{tr(lang,'الوكلاء','Agents')}</dt><dd>{users.length}</dd></div></dl>
        <div className="provider__usage">
          <div><span>{tr(lang,'طلبات اليوم','Requests today')}</span><strong>{number(usage.requests_24h)}</strong></div>
          <div><span>{tr(lang,'توكن 30 يوم','Tokens · 30d')}</span><strong>{number(usage.total_tokens_30d)}</strong></div>
          <div><span>{tr(lang,'إدخال / إخراج','Input / output')}</span><strong>{number(usage.prompt_tokens_30d)} / {number(usage.completion_tokens_30d)}</strong></div>
          <div><span>{tr(lang,'متوسط الاستجابة','Average latency')}</span><strong>{usage.average_latency_ms_30d==null?'—':`${number(usage.average_latency_ms_30d)}ms`}</strong></div>
          <div><span>{tr(lang,'كل الطلبات','All requests')}</span><strong>{number(usage.requests_total)}</strong></div>
          <div><span>{tr(lang,'آخر استخدام','Last used')}</span><strong>{usage.last_used_at?when(usage.last_used_at,lang):tr(lang,'لم يُستخدم','Never')}</strong></div>
        </div>
        {users.length>0&&<div className="provider__agents">{users.map(agent=><span key={agent.id}>{agentName(agent,lang)}</span>)}</div>}
        {risk&&<InlineAlert tone={risk==='retains_sensitive'?'danger':'warning'}>{providerRisks[risk][lang]}</InlineAlert>}
        {owner&&<div className="provider__actions"><Button size="sm" icon={<TestTube2/>} busy={busy===`test:${provider.id}`} onClick={()=>void act(`test:${provider.id}`,()=>api.testProvider(provider.id),tr(lang,'نجح اتصال النموذج.','Model connection succeeded.'))}>{tr(lang,'اختبار','Test')}</Button><Button size="sm" icon={<Power/>} busy={busy===`toggle:${provider.id}`} onClick={()=>void act(`toggle:${provider.id}`,()=>api.setProviderEnabled(provider.id,!provider.enabled),provider.enabled?tr(lang,'تم إيقاف المزوّد.','Provider disabled.'):tr(lang,'تم تفعيل المزوّد.','Provider enabled.'))}>{provider.enabled?tr(lang,'إيقاف','Disable'):tr(lang,'تفعيل','Enable')}</Button><Button size="sm" variant="ghost" icon={<Pencil/>} onClick={()=>setEditing(provider)}>{tr(lang,'تعديل','Edit')}</Button><Button size="sm" variant="ghost" icon={<Copy/>} onClick={()=>clone(provider)}>{tr(lang,'نسخ','Copy')}</Button>{!['gemini','ollama'].includes(provider.id)&&<Button size="sm" variant="danger" icon={<Trash2/>} busy={busy===`delete:${provider.id}`} onClick={()=>{if(confirm(tr(lang,`حذف ${provider.name}؟ يجب ألا يكون مرتبطًا بأي وكيل.`,`Delete ${provider.name}? It must not be assigned to any agent.`)))void act(`delete:${provider.id}`,()=>api.deleteProvider(provider.id),tr(lang,'حُذف إعداد المزوّد ومفتاحه.','Provider configuration and key deleted.'));}}>{tr(lang,'حذف','Delete')}</Button>}</div>}
      </Card>;
    })}</div>}
    <p className="agents-note"><LockKeyhole aria-hidden="true" />{owner?tr(lang,'الإنشاء والتغيير والاختبار والحذف مسجّلة في سجل التدقيق.','Creation, changes, tests, and deletion are written to the audit log.'):tr(lang,'عرض فقط؛ إدارة الاتصالات متاحة للمالك.','Read only; connection management is available to the Owner.')}</p>
    {editing&&<ProviderEditor key={editing==='new'?'new':editing.id} lang={lang} provider={editing} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await reload();setNotice(tr(lang,'حُفظ الاتصال وهو متوقف. اختبره ثم فعّله.','Connection saved off. Test it, then enable it.'));}}/>}
  </>;
}

function ProviderEditor({lang,provider,onClose,onSaved}:{lang:Lang;provider:ProviderRow|'new';onClose:()=>void;onSaved:()=>Promise<void>}){
  const creating=provider==='new'||!providersHasOriginal(provider);
  const value=provider==='new'?{id:'',name:'',kind:'external' as const,api_style:'openai_compatible' as const,model_mode:'auto' as const,endpoint:'https://api.openai.com/v1',chat_model:'',embedding_model:'',max_classification:'public' as const,retains_data:true,requests_per_hour:60,requests_per_day:500,notes:''}:provider;
  const [kind,setKind]=React.useState(value.kind);
  const [modelMode,setModelMode]=React.useState(value.model_mode||'fixed');
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const submit=async(data:FormData)=>{setBusy(true);setError('');const input:api.ProviderInput={id:String(data.get('id')||''),name:String(data.get('name')||''),kind:String(data.get('kind')) as api.ProviderInput['kind'],api_style:String(data.get('api_style')) as api.ProviderInput['api_style'],model_mode:String(data.get('model_mode')) as api.ProviderInput['model_mode'],endpoint:String(data.get('endpoint')||''),chat_model:String(data.get('chat_model')||''),embedding_model:String(data.get('embedding_model')||'')||null,max_classification:String(data.get('max_classification')) as api.ProviderInput['max_classification'],retains_data:data.get('retains_data')==='on',requests_per_hour:Number(data.get('requests_per_hour')),requests_per_day:Number(data.get('requests_per_day')),notes:String(data.get('notes')||'')||null,api_key:String(data.get('api_key')||'')||undefined};try{if(creating)await api.createProvider(input);else{const {id:_,...patch}=input;await api.updateProvider(value.id,patch);}await onSaved();}catch(thrown){setError(providerFailure(thrown,lang));}finally{setBusy(false);}};
  return <Dialog open size="lg" onClose={onClose} closeLabel={tr(lang,'إغلاق','Close')} title={creating?tr(lang,'إضافة اتصال LLM','Add LLM connection'):tr(lang,'تعديل اتصال LLM','Edit LLM connection')} description={tr(lang,'احفظه أولًا، ثم اختبر الاتصال من البطاقة قبل التفعيل.','Save first, then test from the card before enabling.')}>
    {error&&<InlineAlert>{error}</InlineAlert>}<FormGrid busy={busy} submit={tr(lang,'حفظ الاتصال','Save connection')} cancel={{label:tr(lang,'إلغاء','Cancel'),onClick:onClose}} onSubmit={submit}>
      <Field label={tr(lang,'المعرّف','ID')} required hint={tr(lang,'حروف إنجليزية صغيرة وأرقام فقط؛ لا يتغير لاحقًا.','Lowercase letters and numbers; cannot be changed later.')}><TextInput name="id" dir="ltr" required minLength={2} maxLength={48} pattern="[a-z0-9][a-z0-9_-]{1,47}" defaultValue={value.id} readOnly={!creating}/></Field>
      <Field label={tr(lang,'الاسم الظاهر','Display name')} required><TextInput name="name" required minLength={2} maxLength={100} defaultValue={value.name}/></Field>
      <Field label={tr(lang,'المكان','Location')} required><Select name="kind" value={kind} onChange={event=>setKind(event.target.value as 'external'|'local')}><option value="external">{tr(lang,'API خارجي','External API')}</option><option value="local">{tr(lang,'محلي — ai-lap','Local — ai-lap')}</option></Select></Field>
      <Field label={tr(lang,'نوع API','API protocol')} required><Select name="api_style" defaultValue={value.api_style||'openai_compatible'}><option value="openai_compatible">OpenAI compatible</option><option value="google_gemini">Google Gemini</option><option value="ollama">Ollama / ai-lap</option></Select></Field>
      <Field label={tr(lang,'رابط API الأساسي','Base API endpoint')} required wide hint={tr(lang,'للخدمة الخارجية استخدم HTTPS. الاتصال المحلي الثابت: outbound://ai-lap','Use HTTPS for external services. Fixed local connection: outbound://ai-lap')}><TextInput name="endpoint" type="text" dir="ltr" required maxLength={500} defaultValue={value.endpoint||''}/></Field>
      <Field label={tr(lang,'اختيار النموذج','Model selection')} required><Select name="model_mode" value={modelMode} onChange={event=>setModelMode(event.target.value as 'fixed'|'auto')}><option value="auto">{tr(lang,'تلقائي — ريد يختار عند الاختبار','Auto — Reid selects during test')}</option><option value="fixed">{tr(lang,'يدوي — أحدد Model ID','Manual — set Model ID')}</option></Select></Field>
      <Field label={tr(lang,'اسم نموذج المحادثة','Chat model ID')} required={modelMode==='fixed'} hint={modelMode==='auto'?tr(lang,'اتركه فارغًا؛ سيظهر النموذج المختار بعد نجاح الاختبار.','Leave blank; the resolved model appears after a successful test.'):tr(lang,'انسخ المعرّف الدقيق من مزوّد الـAPI.','Copy the exact ID from the API provider.')}><TextInput name="chat_model" dir="ltr" required={modelMode==='fixed'} maxLength={160} placeholder={modelMode==='auto'?'auto':''} defaultValue={value.chat_model==='auto'?'':value.chat_model}/></Field>
      <Field label={tr(lang,'نموذج Embedding','Embedding model')} hint={tr(lang,'اختياري؛ اتركه فارغًا إذا لم تستخدم الذاكرة الدلالية.','Optional; leave empty if semantic memory is not used.')}><TextInput name="embedding_model" dir="ltr" maxLength={160} defaultValue={value.embedding_model||''}/></Field>
      <Field label="API Key" required={creating&&kind==='external'} hint={creating?tr(lang,'يُشفّر ولا يمكن عرضه بعد الحفظ.','Encrypted and cannot be shown after saving.'):tr(lang,'اتركه فارغًا للإبقاء على المفتاح الحالي.','Leave blank to keep the current key.')}><TextInput name="api_key" type="password" dir="ltr" autoComplete="new-password" required={creating&&kind==='external'} minLength={8} maxLength={4096}/></Field>
      <Field label={tr(lang,'أعلى تصنيف بيانات','Highest data classification')} required><Select name="max_classification" defaultValue={value.max_classification}>{(['public','internal','confidential','restricted'] as const).map(item=><option key={item} value={item}>{classificationLabels[item].label[lang]}</option>)}</Select></Field>
      <Field label={tr(lang,'حد الطلبات بالساعة','Requests per hour')} required><TextInput name="requests_per_hour" type="number" min={1} max={10000} required defaultValue={value.requests_per_hour||60}/></Field>
      <Field label={tr(lang,'حد الطلبات باليوم','Requests per day')} required><TextInput name="requests_per_day" type="number" min={1} max={100000} required defaultValue={value.requests_per_day||500}/></Field>
      <Field label={tr(lang,'سياسة البيانات','Data policy')} wide><label className="provider-check"><input name="retains_data" type="checkbox" defaultChecked={value.retains_data}/><span>{tr(lang,'المزوّد قد يحتفظ بالبيانات أو يستخدمها لتحسين خدمته.','The provider may retain data or use it to improve its service.')}</span></label></Field>
      <Field label={tr(lang,'ملاحظات','Notes')} wide><TextArea name="notes" maxLength={1000} defaultValue={value.notes||''}/></Field>
    </FormGrid>
  </Dialog>;
}

function providersHasOriginal(provider:ProviderRow){return Boolean(provider.created_at);}

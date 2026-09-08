import React from "react";
import { Activity, Bot, Boxes, BrainCircuit, CirclePause, Cpu, Gauge, HardDrive, Network, Play, Power, RefreshCw, Server, ShieldCheck, Wifi } from "lucide-react";
import { loadAgentControl, runAgent, runAgentTool, setAgentState, decideRun, canRun, providerAccepts, agentTopology, operationalState, topologyFor } from "./agents";
import type { AgentRow, ProviderRow, RunRow, Classification, AgentToolRow, RunnerStatusRow, SystemMetrics } from "./agents";
import type { WorldAgent, WorldState } from "./agent-world-scene";
import { useSession } from "./shell";
import { supabase } from "./supabase";

// The outpost and three.js are a separate chunk: an administrator opening the
// dashboard pays for the renderer, and nobody else does.
const AgentWorld = React.lazy(() => import("./agent-world"));

type Lang = "ar" | "en";
const copy = {
  ar: { title: "خريطة قيادة الوكلاء", subtitle: "شبكة التشغيل الحية — اضغط على أي وكيل للتفاصيل والتحكم", ready: "جاهز", working: "يعمل الآن", approval: "ينتظر موافقة", paused: "متوقف مؤقتًا", blocked: "محجوب أمنيًا", error: "خطأ", queue: "الطابور", tasks: "التشغيلات", tools: "الأدوات", memory: "نطاق الذاكرة", provider: "المزوّد والنموذج", permissions: "الحماية", run: "تشغيل يدوي", running: "جارٍ التشغيل…", prompt: "اكتب الهدف أو المهمة", pause: "إيقاف مؤقت", resume: "استئناف", disable: "تعطيل", enable: "تفعيل", close: "إغلاق", recent: "سجل التشغيل", approve: "اعتماد", reject: "رفض", replay: "إعادة المحاولة", owner: "الإعدادات الحساسة — Owner فقط", explanation: "الوكلاء لم تُدمج بياناتهم أو صلاحياتهم. جُمّعت بصريًا حسب مجال العمل، مع بقاء HR والمالية في حدود أمنية منفصلة.", live: "متصل بالبيانات الحية", noRuns: "لا توجد تشغيلات لهذا الوكيل.", latency: "الاستجابة", tokens: "التوكنز", blockedReason: "تصنيف بيانات هذا الوكيل أعلى من صلاحية المزوّد الحالي.", output: "نتيجة آخر أمر", view: "طريقة العرض", world: "العالم ثلاثي الأبعاد", classic: "الخريطة الكلاسيكية", loading: "جارٍ التحميل…", worldNote: "كل وكيل روبوت في مقر ريّد الصحراوي: يشتغل على مكتبه وقت التشغيل، يرفع يده حين ينتظر موافقة، وتُغلق فوقه قبة حمراء عند الحجب الأمني." },
  en: { title: "Agent Command Map", subtitle: "Live operating network — select any node for detail and control", ready: "Ready", working: "Working", approval: "Needs approval", paused: "Paused", blocked: "Security blocked", error: "Error", queue: "Queue", tasks: "Runs", tools: "Tools", memory: "Memory scope", provider: "Provider and model", permissions: "Guardrail", run: "Manual run", running: "Running…", prompt: "Describe the objective or task", pause: "Pause", resume: "Resume", disable: "Disable", enable: "Enable", close: "Close", recent: "Run log", approve: "Approve", reject: "Reject", replay: "Retry", owner: "Sensitive configuration — Owner only", explanation: "Agent data and permissions are not merged. Nodes are grouped visually by operating domain, while HR and Finance retain isolated security boundaries.", live: "Live data connected", noRuns: "No runs for this agent.", latency: "Latency", tokens: "Tokens", blockedReason: "This agent's data classification exceeds the current provider clearance.", output: "Latest command output", view: "View", world: "3D world", classic: "Classic map", loading: "Loading…", worldNote: "Every agent is a robot at Reid's desert outpost: it works its desk while running, raises a hand while an approval waits, and is sealed under a red dome when security blocks it." },
};
const stateLabel = (t: typeof copy.ar, state: string) => (t as unknown as Record<string, string>)[state] || state;

type MapView = "world" | "map";
const VIEW_KEY = "reid.agent-map-view";

/**
 * The world is the default because it is the point of this screen, but a
 * reader who asked the operating system for reduced motion starts on the still
 * diagram. Either choice is remembered, and either view is one click away.
 */
function preferredView(): MapView {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "world" || stored === "map") return stored;
  } catch { /* storage can be refused; the default below still applies */ }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "map" : "world";
}

export function AgentCommand({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const { roles } = useSession();
  const owner = roles.includes("owner");
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [tools, setTools] = React.useState<AgentToolRow[]>([]);
  const [runner, setRunner] = React.useState<RunnerStatusRow|null>(null);
  const [metrics, setMetrics] = React.useState<SystemMetrics>({activeProjects:0,openTasks:0,employees:0,pendingApprovals:0,failedRuns:0,queuedRuns:0});
  const [selectedId, setSelectedId] = React.useState("ceo");
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    const value = await loadAgentControl();
    setAgents(value.agents); setProviders(value.providers); setRuns(value.runs); setTools(value.tools); setRunner(value.runner); setMetrics(value.metrics);
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    if (!agents.length) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [agents.length, refresh]);
  React.useEffect(() => {
    if(!supabase || !owner)return;
    const client=supabase;
    const channel=client.channel('owner-command-center')
      .on('postgres_changes',{event:'*',schema:'public',table:'agent_runs'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'agents'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'agent_runner_status'},()=>void refresh())
      .subscribe();
    return ()=>{void client.removeChannel(channel)};
  },[owner,refresh]);

  const byId = React.useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const providerOf = React.useCallback((agent: AgentRow) => providers.find(provider => provider.id === agent.provider_id), [providers]);
  const selected = byId.get(selectedId) || agents[0];
  const selectedRuns = selected ? runs.filter(run => run.agent_id === selected.id) : [];
  const counts = React.useMemo(() => agentTopology.reduce<Record<string, number>>((all, node) => {
    const agent = byId.get(node.id); if (!agent) return all;
    const state = operationalState(agent, providerOf(agent), runs); all[state] = (all[state] || 0) + 1; return all;
  }, {}), [byId, providerOf, runs]);

  // One derivation of live state feeds both views: the diagram reads it inline,
  // the world needs it as data because the renderer cannot read React.
  const worldAgents = React.useMemo<WorldAgent[]>(() => agentTopology.flatMap(node => {
    const agent = byId.get(node.id);
    if (!agent) return [];
    return [{
      id: node.id, parent: node.parent, domain: node.domain, name: agent.name, level: agent.approval_level,
      state: operationalState(agent, providerOf(agent), runs) as WorldState,
      pending: runs.filter(run => run.agent_id === agent.id && ["queued", "running", "pending_approval"].includes(run.run_state)).length,
    }];
  }), [byId, providerOf, runs]);

  const [view, setView] = React.useState<MapView>(preferredView);
  React.useEffect(() => { try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* a private window may refuse storage; the view still works */ } }, [view]);
  const pick = React.useCallback((id: string) => { setSelectedId(id); setMessage(""); }, []);

  const execute = async (agent: AgentRow) => {
    setBusy(true); setMessage("");
    try {
      const result = await runAgent(agent.id, prompt || (lang === "ar" ? "أعد تنفيذ المهمة السابقة" : "Retry the previous task"), agent.classification as Classification);
      setMessage(result.status === "pending_approval" ? t.approval : result.output);
    } catch (error) { setMessage(error instanceof Error ? error.message : "unknown_error"); }
    finally { setBusy(false); await refresh(); }
  };
  const toggle = async (agent: AgentRow, patch: { status?: string; enabled?: boolean }) => {
    setBusy(true); try { await setAgentState(agent.id, patch); await refresh(); } finally { setBusy(false); }
  };
  const decide = async (run: RunRow, decision: "approved" | "rejected") => {
    setBusy(true); try { await decideRun(run.id, decision); await refresh(); } finally { setBusy(false); }
  };

  return (
    <section className="agent-command" aria-labelledby="agent-map-title">
      {owner && <SystemOverview lang={lang} runner={runner} metrics={metrics} onRefresh={refresh} />}
      <header className="agent-map-header">
        <div><span className="eyebrow"><Activity size={15} /> {t.live}</span><h2 id="agent-map-title">{t.title}</h2><p>{t.subtitle}</p></div>
        <div className="agent-map-controls">
          <div className="agent-view-toggle" role="group" aria-label={t.view}>
            <button type="button" data-active={view === "world"} aria-pressed={view === "world"} onClick={() => setView("world")}><Boxes size={14} />{t.world}</button>
            <button type="button" data-active={view === "map"} aria-pressed={view === "map"} onClick={() => setView("map")}><Network size={14} />{t.classic}</button>
          </div>
          <div className="agent-map-health" aria-label={t.live}>
            {(["working", "approval", "ready", "paused", "blocked", "error"] as const).map(state => <span key={state} data-state={state}><i />{stateLabel(t, state)} <b>{counts[state] || 0}</b></span>)}
          </div>
        </div>
      </header>
      <div className="agent-map-layout">
        {view === "world"
          ? <React.Suspense fallback={<div className="agent-world"><div className="agent-world-loading"><RefreshCw className="spin" /> {t.loading}</div></div>}>
              <AgentWorld lang={lang} agents={worldAgents} selectedId={selected?.id ?? null} stateLabel={state => stateLabel(t, state)} onSelect={pick} onUnsupported={() => setView("map")} />
            </React.Suspense>
          : <AgentDiagram t={t} agents={agents} byId={byId} providerOf={providerOf} runs={runs} selectedId={selectedId} onSelect={pick} />}
        {selected && <AgentInspector lang={lang} t={t} selected={selected} provider={providerOf(selected)} runs={selectedRuns} tools={tools.filter(tool => selected.permissions?.includes(tool.id))} owner={owner} busy={busy} prompt={prompt} message={message} setMessage={setMessage} setBusy={setBusy} refresh={refresh} setPrompt={setPrompt} execute={execute} toggle={toggle} decide={decide} />}
      </div>
      {view === "world" && <p className="agent-map-explanation">{t.worldNote}</p>}
      <p className="agent-map-explanation">{t.explanation}</p>
    </section>
  );
}

/**
 * The original map, kept rather than replaced. It is the fallback when WebGL
 * is unavailable, the view a reader who prefers reduced motion starts on, and
 * the fastest way to read eleven states at once on a small screen.
 */
function AgentDiagram({ t, agents, byId, providerOf, runs, selectedId, onSelect }: { t: Copy; agents: AgentRow[]; byId: Map<string, AgentRow>; providerOf: (agent: AgentRow) => ProviderRow | undefined; runs: RunRow[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="agent-network" aria-label={t.title}>
      <svg className="agent-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {agentTopology.filter(node => node.parent).map(node => {
          const parent = topologyFor(node.parent!); const agent = byId.get(node.id); const state = agent ? operationalState(agent, providerOf(agent), runs) : "blocked";
          return parent && <line key={node.id} x1={parent.x} y1={parent.y} x2={node.x} y2={node.y} data-state={state} />;
        })}
      </svg>
      {agentTopology.map(node => {
        const agent = byId.get(node.id); if (!agent) return null;
        const state = operationalState(agent, providerOf(agent), runs);
        const pending = runs.filter(run => run.agent_id === agent.id && ["queued", "running", "pending_approval"].includes(run.run_state)).length;
        return <button key={node.id} type="button" className="agent-node" data-domain={node.domain} data-state={state} data-selected={selectedId === node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => onSelect(node.id)} aria-label={`${agent.name}: ${stateLabel(t, state)}`}>
          <span className="agent-node-orbit" /><span className="agent-node-icon">{node.id === "ceo" ? <BrainCircuit /> : <Bot />}</span><b>{agent.name}</b><small><i />{stateLabel(t, state)}</small>{pending > 0 && <em>{pending}</em>}
        </button>;
      })}
      {!agents.length && <div className="agent-map-loading"><RefreshCw className="spin" /> Loading</div>}
    </div>
  );
}

function SystemOverview({lang,runner,metrics,onRefresh}:{lang:Lang;runner:RunnerStatusRow|null;metrics:SystemMetrics;onRefresh:()=>Promise<void>}) {
  const age=runner?Math.max(0,Math.round((Date.now()-new Date(runner.last_seen_at).getTime())/1000)):null;
  const online=!!runner && age!==null && age<90 && runner.status==='online';
  const labels=lang==='ar'
    ? {title:'مركز قيادة النظام',subtitle:'قياسات حقيقية تتحدث مباشرة من Reid و ai-lap',online:'متصل',offline:'غير متصل',last:'آخر نبضة',projects:'مشاريع فعالة',tasks:'مهام مفتوحة',people:'الموظفون',approvals:'موافقات معلقة',queue:'قيد التنفيذ',errors:'أخطاء 24س',cpu:'CPU',memory:'RAM',gpu:'GPU',vram:'VRAM',refresh:'تحديث الآن'}
    : {title:'System command center',subtitle:'Live operational telemetry from Reid and ai-lap',online:'Online',offline:'Offline',last:'Last heartbeat',projects:'Active projects',tasks:'Open tasks',people:'Employees',approvals:'Pending approvals',queue:'In progress',errors:'24h errors',cpu:'CPU',memory:'RAM',gpu:'GPU',vram:'VRAM',refresh:'Refresh now'};
  const cards=[[labels.projects,metrics.activeProjects],[labels.tasks,metrics.openTasks],[labels.people,metrics.employees],[labels.approvals,metrics.pendingApprovals],[labels.queue,metrics.queuedRuns],[labels.errors,metrics.failedRuns]];
  const percentage=(used:number|null,total:number|null)=>used!==null&&total?Math.round(used/total*100):null;
  const memory=percentage(runner?.memory_used_gb??null,runner?.memory_total_gb??null),vram=percentage(runner?.vram_used_mb??null,runner?.vram_total_mb??null);
  return <section className="system-overview" aria-labelledby="system-overview-title">
    <header><div><span className="eyebrow"><Gauge size={15}/>{online?labels.online:labels.offline}</span><h2 id="system-overview-title">{labels.title}</h2><p>{labels.subtitle}</p></div><button type="button" className="system-refresh" onClick={()=>void onRefresh()}><RefreshCw/>{labels.refresh}</button></header>
    <div className="system-kpis">{cards.map(([label,value])=><article key={label}><small>{label}</small><b>{value}</b></article>)}</div>
    <article className="runner-card" data-online={online}>
      <div className="runner-identity"><span><Server/></span><div><small>ai-lap · {runner?.version||'—'}</small><h3>{runner?.model||'gemma4:12b'}</h3><p>{runner?.gpu||'NVIDIA GPU'}</p></div><strong><i/>{online?labels.online:labels.offline}</strong></div>
      <div className="runner-stats">
        <Telemetry icon={<Wifi/>} label="Ping" value={runner?.ping_ms!=null?`${runner.ping_ms} ms`:'—'} percent={runner?.ping_ms!=null?Math.max(0,100-Math.min(100,runner.ping_ms/4)):0}/>
        <Telemetry icon={<Cpu/>} label={labels.cpu} value={runner?.cpu_percent!=null?`${runner.cpu_percent}%`:'—'} percent={runner?.cpu_percent||0}/>
        <Telemetry icon={<HardDrive/>} label={labels.memory} value={runner?.memory_used_gb!=null?`${runner.memory_used_gb}/${runner.memory_total_gb} GB`:'—'} percent={memory||0}/>
        <Telemetry icon={<Gauge/>} label={labels.gpu} value={runner?.gpu_utilization!=null?`${runner.gpu_utilization}%`:'—'} percent={runner?.gpu_utilization||0}/>
        <Telemetry icon={<HardDrive/>} label={labels.vram} value={runner?.vram_used_mb!=null?`${runner.vram_used_mb}/${runner.vram_total_mb} MB`:'—'} percent={vram||0}/>
      </div>
      <footer>{labels.last}: {age===null?'—':`${age}s`}</footer>
    </article>
  </section>;
}

function Telemetry({icon,label,value,percent}:{icon:React.ReactNode;label:string;value:string;percent:number}) {
  return <div className="telemetry"><span>{icon}{label}</span><b>{value}</b><div aria-hidden="true"><i style={{width:`${Math.max(0,Math.min(100,percent))}%`}}/></div></div>;
}

type Copy = typeof copy.ar;
function AgentInspector({ lang, t, selected, provider, runs, tools, owner, busy, prompt, message, setMessage, setBusy, refresh, setPrompt, execute, toggle, decide }: { lang: Lang; t: Copy; selected: AgentRow; provider: ProviderRow | undefined; runs: RunRow[]; tools: AgentToolRow[]; owner: boolean; busy: boolean; prompt: string; message: string; setMessage:(value:string)=>void; setBusy:(value:boolean)=>void; refresh:()=>Promise<void>; setPrompt: (value: string) => void; execute: (agent: AgentRow) => Promise<void>; toggle: (agent: AgentRow, patch: { status?: string; enabled?: boolean }) => Promise<void>; decide: (run: RunRow, decision: "approved" | "rejected") => Promise<void> }) {
  const node = topologyFor(selected.id)!; const state = operationalState(selected, provider, runs); const runnable = canRun(selected, provider); const latest = runs[0];
  const invokeTool = async (tool: AgentToolRow) => {
    let args: Record<string, unknown> = {};
    if (tool.input_schema.required?.length) {
      const raw = window.prompt(lang === 'ar' ? `أدخل بيانات JSON المطلوبة: ${tool.input_schema.required.join(', ')}` : `Enter required JSON: ${tool.input_schema.required.join(', ')}`, '{}');
      if (raw === null) return;
      try { args = JSON.parse(raw); } catch { setMessage(lang === 'ar' ? 'صيغة JSON غير صحيحة' : 'Invalid JSON'); return; }
    }
    setBusy(true); setMessage('');
    try { const result = await runAgentTool(selected.id, tool.id, args, selected.classification); setMessage(result.status === 'pending_approval' ? t.approval : JSON.stringify(result.result ?? result)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'unknown_error'); }
    finally { setBusy(false); await refresh(); }
  };
  return <aside className="agent-inspector" data-state={state} aria-label={selected.name}>
    <header><div className="inspector-icon"><Bot /></div><div><small>{node.domain} · L{selected.approval_level}</small><h3>{selected.name}</h3><span className="state-pill"><i />{stateLabel(t, state)}</span></div></header>
    <p className="agent-purpose">{node.purpose[lang]}</p>
    {state === "blocked" && <p className="agent-warning"><ShieldCheck /> {selected.disabled_reason || t.blockedReason}</p>}
    <div className="agent-metrics"><span><small>{t.queue}</small><b>{runs.filter(run => ["queued", "running", "pending_approval"].includes(run.run_state)).length}</b></span><span><small>{t.tasks}</small><b>{runs.length}</b></span><span><small>{t.latency}</small><b>{latest?.latency_ms ? `${latest.latency_ms}ms` : "—"}</b></span><span><small>{t.tokens}</small><b>{latest?.token_usage ?? "—"}</b></span></div>
    <section><h4>{t.tools}</h4><div className="chip-row">{tools.map(tool => <button type="button" key={tool.id} disabled={busy || !runnable} title={`${tool.description} · L${tool.approval_level}`} onClick={() => void invokeTool(tool)}>{lang === 'ar' ? tool.name_ar : tool.name_en} · L{tool.approval_level}</button>)}</div></section>
    <section><h4>{t.memory}</h4><div className="chip-row memory">{node.memories.map(memory => <span key={memory}>{memory}</span>)}</div></section>
    <dl><div><dt>{t.provider}</dt><dd>{provider?.name || "—"}<small>{provider?.chat_model || selected.model}</small></dd></div><div><dt>{t.permissions}</dt><dd>{selected.classification} · L{selected.approval_level}<small>{provider && providerAccepts(provider, selected.classification) ? "clearance OK" : "clearance denied"}</small></dd></div></dl>
    <section className="manual-run"><h4>{t.run}</h4><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t.prompt} rows={3} /><button className="primary" type="button" disabled={busy || !runnable || !prompt.trim()} onClick={() => void execute(selected)}><Play /> {busy ? t.running : t.run}</button></section>
    <div className="control-row"><button type="button" disabled={busy} onClick={() => void toggle(selected, { status: selected.status === "paused" ? "idle" : "paused" })}><CirclePause />{selected.status === "paused" ? t.resume : t.pause}</button><button type="button" disabled={busy || !owner} title={!owner ? t.owner : ""} onClick={() => void toggle(selected, { enabled: !selected.enabled })}><Power />{selected.enabled ? t.disable : t.enable}</button></div>
    {!owner && <small className="owner-note"><ShieldCheck /> {t.owner}</small>}
    {message && <output className="agent-output"><b>{t.output}</b>{message}</output>}
    <section className="selected-runs"><h4>{t.recent}</h4>{!runs.length ? <p>{t.noRuns}</p> : runs.slice(0, 5).map(run => <article key={run.id} data-state={run.run_state}><div><b>{stateLabel(t, run.run_state)}</b><small>{new Date(run.created_at).toLocaleString(lang === "ar" ? "ar-OM" : "en-GB")}</small></div>{run.output_preview && <p>{run.output_preview}</p>}{run.error && <p className="warn">{run.error}</p>}{run.approval_state === "pending" && <div className="run-actions"><button onClick={() => void decide(run, "approved")}>{t.approve}</button><button onClick={() => void decide(run, "rejected")}>{t.reject}</button></div>}{run.run_state === "failed" && <button onClick={() => void execute(selected)}><RefreshCw />{t.replay}</button>}</article>)}</section>
  </aside>;
}

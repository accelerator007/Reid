import React from "react";
import { Activity, Bot, BrainCircuit, CirclePause, Play, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { loadAgentControl, runAgent, setAgentState, decideRun, canRun, providerAccepts, agentTopology, operationalState, topologyFor } from "./agents";
import type { AgentRow, ProviderRow, RunRow, Classification } from "./agents";
import { useSession } from "./shell";

type Lang = "ar" | "en";
const copy = {
  ar: { title: "خريطة قيادة الوكلاء", subtitle: "شبكة التشغيل الحية — اضغط على أي وكيل للتفاصيل والتحكم", ready: "جاهز", working: "يعمل الآن", approval: "ينتظر موافقة", paused: "متوقف مؤقتًا", blocked: "محجوب أمنيًا", error: "خطأ", queue: "الطابور", tasks: "التشغيلات", tools: "الأدوات", memory: "نطاق الذاكرة", provider: "المزوّد والنموذج", permissions: "الحماية", run: "تشغيل يدوي", running: "جارٍ التشغيل…", prompt: "اكتب الهدف أو المهمة", pause: "إيقاف مؤقت", resume: "استئناف", disable: "تعطيل", enable: "تفعيل", close: "إغلاق", recent: "سجل التشغيل", approve: "اعتماد", reject: "رفض", replay: "إعادة المحاولة", owner: "الإعدادات الحساسة — Owner فقط", explanation: "الوكلاء لم تُدمج بياناتهم أو صلاحياتهم. جُمّعت بصريًا حسب مجال العمل، مع بقاء HR والمالية في حدود أمنية منفصلة.", live: "متصل بالبيانات الحية", noRuns: "لا توجد تشغيلات لهذا الوكيل.", latency: "الاستجابة", tokens: "التوكنز", blockedReason: "تصنيف بيانات هذا الوكيل أعلى من صلاحية المزوّد الحالي.", output: "نتيجة آخر أمر" },
  en: { title: "Agent Command Map", subtitle: "Live operating network — select any node for detail and control", ready: "Ready", working: "Working", approval: "Needs approval", paused: "Paused", blocked: "Security blocked", error: "Error", queue: "Queue", tasks: "Runs", tools: "Tools", memory: "Memory scope", provider: "Provider and model", permissions: "Guardrail", run: "Manual run", running: "Running…", prompt: "Describe the objective or task", pause: "Pause", resume: "Resume", disable: "Disable", enable: "Enable", close: "Close", recent: "Run log", approve: "Approve", reject: "Reject", replay: "Retry", owner: "Sensitive configuration — Owner only", explanation: "Agent data and permissions are not merged. Nodes are grouped visually by operating domain, while HR and Finance retain isolated security boundaries.", live: "Live data connected", noRuns: "No runs for this agent.", latency: "Latency", tokens: "Tokens", blockedReason: "This agent's data classification exceeds the current provider clearance.", output: "Latest command output" },
};
const stateLabel = (t: typeof copy.ar, state: string) => (t as unknown as Record<string, string>)[state] || state;

export function AgentCommand({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const { roles } = useSession();
  const owner = roles.includes("owner");
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = React.useState("ceo");
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    const value = await loadAgentControl();
    setAgents(value.agents); setProviders(value.providers); setRuns(value.runs);
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    if (!agents.length) return;
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [agents.length, refresh]);

  const byId = React.useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const providerOf = React.useCallback((agent: AgentRow) => providers.find(provider => provider.id === agent.provider_id), [providers]);
  const selected = byId.get(selectedId) || agents[0];
  const selectedRuns = selected ? runs.filter(run => run.agent_id === selected.id) : [];
  const counts = React.useMemo(() => agentTopology.reduce<Record<string, number>>((all, node) => {
    const agent = byId.get(node.id); if (!agent) return all;
    const state = operationalState(agent, providerOf(agent), runs); all[state] = (all[state] || 0) + 1; return all;
  }, {}), [byId, providerOf, runs]);

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
      <header className="agent-map-header">
        <div><span className="eyebrow"><Activity size={15} /> {t.live}</span><h2 id="agent-map-title">{t.title}</h2><p>{t.subtitle}</p></div>
        <div className="agent-map-health" aria-label={t.live}>
          {(["working", "approval", "ready", "paused", "blocked", "error"] as const).map(state => <span key={state} data-state={state}><i />{stateLabel(t, state)} <b>{counts[state] || 0}</b></span>)}
        </div>
      </header>
      <div className="prototype-notice" role="note">
        <ShieldCheck />
        <div>
          <b>{lang === "ar" ? "وضع النموذج التجريبي مفعّل" : "Prototype mode is active"}</b>
          <span>{lang === "ar" ? "كل الوكلاء يعملون على Gemini ببيانات تجريبية عامة فقط. لا تدخل بيانات موظفين أو عملاء أو معلومات مالية حقيقية." : "All agents run on Gemini with public test data only. Do not enter real employee, customer, or financial information."}</span>
        </div>
      </div>
      <div className="agent-map-layout">
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
            return <button key={node.id} type="button" className="agent-node" data-domain={node.domain} data-state={state} data-selected={selectedId === node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => { setSelectedId(node.id); setMessage(""); }} aria-label={`${agent.name}: ${stateLabel(t, state)}`}>
              <span className="agent-node-orbit" /><span className="agent-node-icon">{node.id === "ceo" ? <BrainCircuit /> : <Bot />}</span><b>{agent.name}</b><small><i />{stateLabel(t, state)}</small>{pending > 0 && <em>{pending}</em>}
            </button>;
          })}
          {!agents.length && <div className="agent-map-loading"><RefreshCw className="spin" /> Loading</div>}
        </div>
        {selected && <AgentInspector lang={lang} t={t} selected={selected} provider={providerOf(selected)} runs={selectedRuns} owner={owner} busy={busy} prompt={prompt} message={message} setPrompt={setPrompt} execute={execute} toggle={toggle} decide={decide} />}
      </div>
      <p className="agent-map-explanation">{t.explanation}</p>
    </section>
  );
}

type Copy = typeof copy.ar;
function AgentInspector({ lang, t, selected, provider, runs, owner, busy, prompt, message, setPrompt, execute, toggle, decide }: { lang: Lang; t: Copy; selected: AgentRow; provider: ProviderRow | undefined; runs: RunRow[]; owner: boolean; busy: boolean; prompt: string; message: string; setPrompt: (value: string) => void; execute: (agent: AgentRow) => Promise<void>; toggle: (agent: AgentRow, patch: { status?: string; enabled?: boolean }) => Promise<void>; decide: (run: RunRow, decision: "approved" | "rejected") => Promise<void> }) {
  const node = topologyFor(selected.id)!; const state = operationalState(selected, provider, runs); const runnable = canRun(selected, provider); const latest = runs[0];
  return <aside className="agent-inspector" data-state={state} aria-label={selected.name}>
    <header><div className="inspector-icon"><Bot /></div><div><small>{node.domain} · L{selected.approval_level}</small><h3>{selected.name}</h3><span className="state-pill"><i />{stateLabel(t, state)}</span></div></header>
    <p className="agent-purpose">{node.purpose[lang]}</p>
    {state === "blocked" && <p className="agent-warning"><ShieldCheck /> {selected.disabled_reason || t.blockedReason}</p>}
    <div className="agent-metrics"><span><small>{t.queue}</small><b>{runs.filter(run => ["queued", "running", "pending_approval"].includes(run.run_state)).length}</b></span><span><small>{t.tasks}</small><b>{runs.length}</b></span><span><small>{t.latency}</small><b>{latest?.latency_ms ? `${latest.latency_ms}ms` : "—"}</b></span><span><small>{t.tokens}</small><b>{latest?.token_usage ?? "—"}</b></span></div>
    <section><h4>{t.tools}</h4><div className="chip-row">{node.tools.map(tool => <span key={tool}>{tool}</span>)}</div></section>
    <section><h4>{t.memory}</h4><div className="chip-row memory">{node.memories.map(memory => <span key={memory}>{memory}</span>)}</div></section>
    <dl><div><dt>{t.provider}</dt><dd>{provider?.name || "—"}<small>{provider?.chat_model || selected.model}</small></dd></div><div><dt>{t.permissions}</dt><dd>{selected.classification} · L{selected.approval_level}<small>{provider && providerAccepts(provider, selected.classification) ? "clearance OK" : "clearance denied"}</small></dd></div></dl>
    <section className="manual-run"><h4>{t.run}</h4><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t.prompt} rows={3} /><button className="primary" type="button" disabled={busy || !runnable || !prompt.trim()} onClick={() => void execute(selected)}><Play /> {busy ? t.running : t.run}</button></section>
    <div className="control-row"><button type="button" disabled={busy} onClick={() => void toggle(selected, { status: selected.status === "paused" ? "idle" : "paused" })}><CirclePause />{selected.status === "paused" ? t.resume : t.pause}</button><button type="button" disabled={busy || !owner} title={!owner ? t.owner : ""} onClick={() => void toggle(selected, { enabled: !selected.enabled })}><Power />{selected.enabled ? t.disable : t.enable}</button></div>
    {!owner && <small className="owner-note"><ShieldCheck /> {t.owner}</small>}
    {message && <output className="agent-output"><b>{t.output}</b>{message}</output>}
    <section className="selected-runs"><h4>{t.recent}</h4>{!runs.length ? <p>{t.noRuns}</p> : runs.slice(0, 5).map(run => <article key={run.id} data-state={run.run_state}><div><b>{stateLabel(t, run.run_state)}</b><small>{new Date(run.created_at).toLocaleString(lang === "ar" ? "ar-OM" : "en-GB")}</small></div>{run.output_preview && <p>{run.output_preview}</p>}{run.error && <p className="warn">{run.error}</p>}{run.approval_state === "pending" && <div className="run-actions"><button onClick={() => void decide(run, "approved")}>{t.approve}</button><button onClick={() => void decide(run, "rejected")}>{t.reject}</button></div>}{run.run_state === "failed" && <button onClick={() => void execute(selected)}><RefreshCw />{t.replay}</button>}</article>)}</section>
  </aside>;
}

import React from "react";
import {
  loadAgentControl,
  runAgent,
  setAgentState,
  decideRun,
  canRun,
  providerAccepts,
} from "./agents";
import type { AgentRow, ProviderRow, RunRow, Classification } from "./agents";

type Lang = "ar" | "en";

const text = {
  ar: {
    heading: "مركز قيادة الوكلاء",
    providers: "مزوّدو النماذج",
    external: "خارجي",
    local: "محلي",
    retains: "قد يحتفظ بالمحتوى",
    ceiling: "أقصى تصنيف",
    runs: "آخر التشغيلات",
    run: "تشغيل",
    running: "جارٍ التشغيل…",
    pause: "إيقاف مؤقت",
    resume: "استئناف",
    disable: "تعطيل",
    enable: "تفعيل",
    replay: "إعادة تشغيل",
    approve: "اعتماد",
    reject: "رفض",
    blocked: "محجوب: تصنيف البيانات أعلى من صلاحية المزوّد",
    prompt: "اكتب المهمة للوكيل",
    empty: "لا توجد تشغيلات بعد.",
    latency: "زمن الاستجابة",
    tokens: "التوكنز",
    awaiting: "بانتظار اعتماد بشري",
    level: "مستوى الاعتماد",
  },
  en: {
    heading: "Agent Command",
    providers: "Model providers",
    external: "External",
    local: "Local",
    retains: "May retain content",
    ceiling: "Max classification",
    runs: "Recent runs",
    run: "Run",
    running: "Running…",
    pause: "Pause",
    resume: "Resume",
    disable: "Disable",
    enable: "Enable",
    replay: "Replay",
    approve: "Approve",
    reject: "Reject",
    blocked: "Blocked: data classification exceeds the provider's clearance",
    prompt: "Describe the task for this agent",
    empty: "No runs yet.",
    latency: "Latency",
    tokens: "Tokens",
    awaiting: "Awaiting human approval",
    level: "Approval level",
  },
};

export function AgentCommand({ lang }: { lang: Lang }) {
  const t = text[lang];
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    const control = await loadAgentControl();
    setAgents(control.agents);
    setProviders(control.providers);
    setRuns(control.runs);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const providerOf = (agent: AgentRow) => providers.find((p) => p.id === agent.provider_id);

  const execute = async (agent: AgentRow) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await runAgent(agent.id, prompt, agent.classification as Classification);
      setMessage(result.status === "pending_approval" ? t.awaiting : result.output);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const toggle = async (agent: AgentRow, patch: Partial<AgentRow>) => {
    await setAgentState(agent.id, patch);
    await refresh();
  };

  const decide = async (run: RunRow, decision: "approved" | "rejected") => {
    await decideRun(run.id, decision);
    await refresh();
  };

  return (
    <section className="agent-command">
      <h2>{t.heading}</h2>

      <h3>{t.providers}</h3>
      <ul className="provider-list">
        {providers.map((provider) => (
          <li key={provider.id} data-kind={provider.kind} data-enabled={provider.enabled}>
            <b>{provider.name}</b>
            <small>{provider.kind === "external" ? t.external : t.local} · {provider.chat_model}</small>
            <small>{t.ceiling}: {provider.max_classification}</small>
            {provider.retains_data && <small className="warn">{t.retains}</small>}
          </li>
        ))}
      </ul>

      <div className="grid">
        {agents.map((agent) => {
          const provider = providerOf(agent);
          const runnable = canRun(agent, provider);
          const cleared = provider ? providerAccepts(provider, agent.classification) : false;
          return (
            <article key={agent.id} className={"agent " + agent.status} data-enabled={agent.enabled}>
              <b>{agent.name}</b>
              <small>{agent.status} · {agent.classification}</small>
              <small>{t.level} L{agent.approval_level} · {agent.provider_id}</small>
              {!cleared && <small className="warn">{t.blocked}</small>}
              {agent.disabled_reason && <small className="warn">{agent.disabled_reason}</small>}
              <div className="agent-actions">
                <button type="button" onClick={() => setSelected(selected === agent.id ? null : agent.id)} disabled={!runnable}>
                  {t.run}
                </button>
                <button type="button" onClick={() => toggle(agent, { status: agent.status === "paused" ? "idle" : "paused" })}>
                  {agent.status === "paused" ? t.resume : t.pause}
                </button>
                <button type="button" onClick={() => toggle(agent, { enabled: !agent.enabled })}>
                  {agent.enabled ? t.disable : t.enable}
                </button>
              </div>
              {selected === agent.id && runnable && (
                <div className="agent-run">
                  <label htmlFor={`prompt-${agent.id}`}>{t.prompt}</label>
                  <textarea
                    id={`prompt-${agent.id}`}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={3}
                  />
                  <button type="button" onClick={() => execute(agent)} disabled={busy || !prompt.trim()}>
                    {busy ? t.running : t.run}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {message && <p className="agent-output" role="status">{message}</p>}

      <h3>{t.runs}</h3>
      {runs.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <ul className="run-list">
          {runs.map((run) => (
            <li key={run.id} data-state={run.run_state}>
              <b>{run.agent_id}</b>
              <small>{run.run_state} · {run.classification} · {run.provider_id}</small>
              <small>
                {t.latency}: {run.latency_ms ?? "—"}ms · {t.tokens}: {run.token_usage ?? "—"}
              </small>
              {run.output_preview && <small className="preview">{run.output_preview}</small>}
              {run.error && <small className="warn">{run.error}</small>}
              {run.approval_state === "pending" && (
                <div className="agent-actions">
                  <button type="button" onClick={() => decide(run, "approved")}>{t.approve}</button>
                  <button type="button" onClick={() => decide(run, "rejected")}>{t.reject}</button>
                </div>
              )}
              {run.run_state === "failed" && (
                <button type="button" onClick={() => { setSelected(run.agent_id); setPrompt(""); }}>
                  {t.replay}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

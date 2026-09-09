import React from "react";
import { createRoot } from "react-dom/client";
import AgentWorld from "../../src/agent-world";
import { agentTopology } from "../../src/agents";
import type { AgentWorld as World, WorldAgent, WorldQuality, WorldState } from "../../src/agent-world-scene";
import "../../src/tokens.css";
import "../../src/style.css";
import "../../src/agents.css";
import "../../src/agent-world.css";

// Every state at once, so one screenshot and one benchmark cover the whole
// behaviour table rather than whichever states production happens to be in.
const states: readonly WorldState[] = ["working", "approval", "ready", "paused", "blocked", "error", "working", "ready", "working", "approval", "ready"];
const agents: WorldAgent[] = agentTopology.map((node, index) => ({
  id: node.id, parent: node.parent, domain: node.domain, name: node.id.toUpperCase(),
  state: states[index % states.length], pending: index % 3, level: 1,
}));

declare global {
  interface Window { agentWorld?: World | null; agentWorldUnsupported?: boolean }
}

function Harness() {
  const query = new URLSearchParams(location.search);
  const [selected, setSelected] = React.useState(query.get("selected") ?? "ceo");
  const [mounted, setMounted] = React.useState(true);
  return (
    <div className={query.has("dark") ? "app dark" : "app"} style={{ background: "var(--bg)", minHeight: "100vh", padding: "1rem" }}>
      <button type="button" id="unmount" onClick={() => setMounted(false)}>unmount</button>
      {mounted && (
        <AgentWorld
          lang={query.get("lang") === "en" ? "en" : "ar"}
          agents={agents}
          selectedId={selected}
          onSelect={setSelected}
          onUnsupported={() => { window.agentWorldUnsupported = true; }}
          onWorld={world => { window.agentWorld = world; }}
          quality={(["low", "medium", "high"] as const).find(level => level === query.get("quality")) as WorldQuality | undefined}
          stateLabel={state => state}
        />
      )}
      <output id="selected">{selected}</output>
      {/* Tall enough that scrolling really moves the stage out of the viewport,
          which is how the benchmark proves the frame loop stops. */}
      <div id="spacer" style={{ height: "250vh" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  detectQuality, duneHeight, normaliseHex, qualityBudget, readWorldPalette, ringRadius,
  seeded, stateVisual, toneToken, WORLD_TOKENS, worldLayout,
} from "./agent-world-scene";
import type { WorldNode, WorldState, WorldToken } from "./agent-world-scene";
import { agentTopology } from "./agents";

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const view = readFileSync(new URL("./agent-world.tsx", import.meta.url), "utf8");
const command = readFileSync(new URL("./agent-command.tsx", import.meta.url), "utf8");
const nodes: readonly WorldNode[] = agentTopology.map(node => ({ id: node.id, parent: node.parent, domain: node.domain }));

describe("the campus is derived from the reporting tree", () => {
  it("places every agent exactly once", () => {
    const layout = worldLayout(nodes);
    expect(layout.size).toBe(agentTopology.length);
    for (const node of nodes) expect(layout.has(node.id)).toBe(true);
  });

  it("puts the orchestrator at the centre and its reports on one ring", () => {
    const layout = worldLayout(nodes);
    expect(layout.get("ceo")).toMatchObject({ x: 0, z: 0, depth: 0 });
    const reports = nodes.filter(node => node.parent === "ceo").map(node => layout.get(node.id)!);
    expect(reports).toHaveLength(6);
    for (const report of reports) expect(Math.hypot(report.x, report.z)).toBeCloseTo(ringRadius(1), 5);
  });

  it("stands a specialist on the next ring out, beside the parent it reports to", () => {
    const layout = worldLayout(nodes);
    const content = layout.get("content")!;
    const marketing = layout.get("marketing")!;
    expect(content.depth).toBe(2);
    expect(Math.hypot(content.x, content.z)).toBeCloseTo(ringRadius(2), 5);
    // Same bearing as its parent, so the reporting line reads as an avenue.
    expect(Math.abs(content.angle - marketing.angle)).toBeLessThan(0.6);
  });

  it("never stacks two stations on the same spot", () => {
    const layout = worldLayout(nodes);
    const places = [...layout.values()];
    for (const a of places) {
      for (const b of places) {
        if (a.id === b.id) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(6);
      }
    }
  });

  it("survives a topology it has never seen", () => {
    expect(worldLayout([]).size).toBe(0);
    const orphan = worldLayout([{ id: "lost", parent: "nobody", domain: "delivery" }]);
    // An unreachable node is simply not placed rather than crashing the renderer.
    expect(orphan.size).toBe(0);
  });
});

describe("state drives behaviour, not just colour", () => {
  it("only a working agent sends packets up the link", () => {
    const states: WorldState[] = ["ready", "working", "approval", "paused", "blocked", "error"];
    expect(states.filter(state => stateVisual(state).packets)).toEqual(["working"]);
  });

  it("shows a raised arm for approval and a dome for a security block", () => {
    expect(stateVisual("approval")).toMatchObject({ raised: true, beacon: true, tone: "warn" });
    expect(stateVisual("blocked")).toMatchObject({ dome: true, tone: "risk", activity: 0 });
    expect(stateVisual("error").flash).toBeGreaterThan(0);
  });

  it("slumps a paused agent instead of stopping the world", () => {
    expect(stateVisual("paused").droop).toBe(1);
    expect(stateVisual("working").droop).toBe(0);
    expect(stateVisual("working").activity).toBeGreaterThan(stateVisual("ready").activity);
  });

  it("maps every tone onto a semantic token that exists", () => {
    for (const state of ["ready", "working", "approval", "paused", "blocked", "error"] as WorldState[]) {
      expect(WORLD_TOKENS).toContain(toneToken(stateVisual(state).tone));
    }
  });
});

describe("the world names no colour of its own", () => {
  it("defines every token the renderer asks for, and flips the scenery at night", () => {
    const [light, dark] = (() => { const at = tokens.indexOf(".dark"); return [tokens.slice(0, at), tokens.slice(at)]; })();
    for (const token of WORLD_TOKENS) expect(light, `light theme is missing --${token}`).toContain(`--${token}:`);
    // The brand ramp keeps its deep steps in both themes, which tokens.test.ts
    // owns. The outpost itself has to change: midday sand is not moonlit sand.
    for (const token of WORLD_TOKENS.filter(name => name.startsWith("world-"))) {
      expect(dark, `dark theme is missing --${token}`).toContain(`--${token}:`);
    }
  });

  it("refuses a value three.js cannot parse rather than blacking out the scene", () => {
    expect(normaliseHex("#dcbf90", "#000")).toBe("#dcbf90");
    expect(normaliseHex("  #abc  ", "#000")).toBe("#abc");
    // Alpha is dropped: the renderer composites its own transparency.
    expect(normaliseHex("#55418b20", "#000")).toBe("#55418b");
    expect(normaliseHex("color-mix(in srgb, red, blue)", "#123456")).toBe("#123456");
    expect(normaliseHex("", "#123456")).toBe("#123456");
  });

  it("falls back token by token when the stylesheet has not applied", () => {
    const palette = readWorldPalette((token: WorldToken) => (token === "world-sand" ? "#112233" : ""));
    expect(palette["world-sand"]).toBe("#112233");
    for (const token of WORLD_TOKENS) expect(palette[token]).toMatch(/^#[0-9a-f]{3,6}$/i);
  });
});

describe("the world sizes itself to the machine", () => {
  it("drops shadows and dust on a small or weak device", () => {
    expect(detectQuality({ cores: 2, memory: 2, width: 390 })).toBe("low");
    expect(qualityBudget("low").shadowMap).toBe(0);
    expect(detectQuality({ cores: 8, memory: 8, width: 1000 })).toBe("medium");
    expect(detectQuality({ cores: 12, memory: 16, width: 1600 })).toBe("high");
    expect(qualityBudget("high").dust).toBeGreaterThan(qualityBudget("medium").dust);
    expect(qualityBudget("high").pixelRatio).toBeGreaterThan(qualityBudget("low").pixelRatio);
  });

  it("flattens the dunes under the campus so no station sits on a slope", () => {
    for (const [x, z] of [[0, 0], [13, 0], [0, -13], [17, 17]]) expect(Math.abs(duneHeight(x, z))).toBeLessThan(0.01);
    let relief = 0;
    for (let angle = 0; angle < 6; angle += 0.5) relief = Math.max(relief, Math.abs(duneHeight(Math.sin(angle) * 70, Math.cos(angle) * 70)));
    expect(relief).toBeGreaterThan(0.5);
  });

  it("scatters the same desert on every mount", () => {
    const first = Array.from({ length: 5 }, seeded(7));
    const second = Array.from({ length: 5 }, seeded(7));
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(5);
    for (const value of first) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1); }
  });
});

describe("the world stays a control surface", () => {
  it("keeps the classic map as a real fallback rather than a dead branch", () => {
    expect(command).toContain('onUnsupported={() => setView("map")}');
    expect(command).toContain("function AgentDiagram");
    expect(view).toContain("supportsWebGL()");
  });

  it("loads three.js only when the map is opened", () => {
    expect(command).toContain('React.lazy(() => import("./agent-world"))');
    expect(command).not.toContain('from "three"');
  });

  it("gives the canvas an accessible twin instead of leaving it unreachable", () => {
    expect(view).toContain('aria-hidden", "true"');
    expect(view).toContain("aria-pressed=");
    expect(view).toContain("onFocus=");
  });

  it("stops rendering when nobody is looking", () => {
    expect(view).toContain("IntersectionObserver");
    expect(view).toContain("visibilitychange");
    expect(view).toContain("instance.dispose()");
  });
});

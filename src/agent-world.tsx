import React from "react";
import { Bot, Compass, Maximize2, MousePointerClick } from "lucide-react";
import {
  createAgentWorld, detectQuality, readWorldPalette, supportsWebGL,
} from "./agent-world-scene";
import type { AgentWorld, WorldAgent, WorldPalette, WorldQuality, WorldState, WorldToken } from "./agent-world-scene";

type Lang = "ar" | "en";

export type AgentWorldProps = {
  lang: Lang;
  agents: readonly WorldAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The caller owns the fallback: it already renders the 2D map. */
  onUnsupported: () => void;
  stateLabel: (state: WorldState) => string;
  /** The renderer handle, for a caller that needs to drive the camera or read
   *  its cost. `tests/harness/world.tsx` uses it to benchmark the scene. */
  onWorld?: (world: AgentWorld | null) => void;
  /** Force a detail level. Omit to size the scene to the device it runs on. */
  quality?: WorldQuality;
};

const copy = {
  ar: { hint: "اسحب للدوران · عجلة الفأرة للتقريب · اضغط على أي روبوت", reset: "إعادة ضبط الكاميرا", loading: "يُبنى المشهد…", canvas: "مشهد ثلاثي الأبعاد لشبكة الوكلاء" },
  en: { hint: "Drag to orbit · scroll to zoom · click any robot", reset: "Reset camera", loading: "Building the scene…", canvas: "3D scene of the agent network" },
};

/**
 * The React half of the desert outpost. It owns the element lifecycle, the
 * nameplates a keyboard and a screen reader actually use, and the rules for
 * when the renderer is allowed to burn a frame; `src/agent-world.ts` owns
 * everything inside the canvas.
 *
 * Default-exported because `agent-command.tsx` mounts it through `React.lazy`,
 * which keeps three.js out of the bundle until an administrator opens the map.
 */
export default function AgentWorld({ lang, agents, selectedId, onSelect, onUnsupported, stateLabel, onWorld, quality }: AgentWorldProps) {
  const t = copy[lang];
  const stage = React.useRef<HTMLDivElement>(null);
  const world = React.useRef<AgentWorld | null>(null);
  const labels = React.useRef(new Map<string, HTMLElement>());
  const [ready, setReady] = React.useState(false);
  const [hovered, setHovered] = React.useState<string | null>(null);

  // The renderer must not be rebuilt when the selection changes, so the frame
  // loop reads the callbacks through a ref rather than closing over them.
  const handlers = React.useRef({ onSelect, onUnsupported, onWorld });
  handlers.current = { onSelect, onUnsupported, onWorld };
  const forcedQuality = React.useRef(quality);
  forcedQuality.current = quality;

  React.useEffect(() => {
    const host = stage.current;
    if (!host) return;
    if (!supportsWebGL()) { handlers.current.onUnsupported(); return; }

    // A fresh canvas per mount: StrictMode mounts twice in development, and a
    // context that has been disposed cannot always be reacquired on the same element.
    const canvas = document.createElement("canvas");
    canvas.className = "agent-world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);

    const palette = (): WorldPalette => {
      const style = getComputedStyle(host);
      return readWorldPalette((token: WorldToken) => style.getPropertyValue(`--${token}`));
    };
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const navigatorHints = navigator as Navigator & { deviceMemory?: number };

    let instance: AgentWorld;
    try {
      instance = createAgentWorld({
        canvas,
        palette: palette(),
        quality: forcedQuality.current ?? detectQuality({
          cores: navigator.hardwareConcurrency, memory: navigatorHints.deviceMemory,
          width: window.innerWidth, coarsePointer: coarse,
        }),
        reducedMotion: motionQuery.matches,
        onSelect: id => handlers.current.onSelect(id),
        onHover: setHovered,
        onReady: () => setReady(true),
      });
    } catch {
      // A driver can refuse a context even when the feature test passed.
      canvas.remove();
      handlers.current.onUnsupported();
      return;
    }
    world.current = instance;
    handlers.current.onWorld?.(instance);
    instance.attachLabels(labels.current);
    instance.resize(host.clientWidth, host.clientHeight);

    const resizeObserver = new ResizeObserver(([entry]) => {
      instance.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(host);

    // Nothing renders while the tab is hidden or the map is scrolled away.
    let visible = !document.hidden;
    let onScreen = true;
    const settle = () => instance.setRunning(visible && onScreen);
    const viewObserver = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; settle(); }, { threshold: 0.05 });
    viewObserver.observe(host);
    const onVisibility = () => { visible = !document.hidden; settle(); };
    document.addEventListener("visibilitychange", onVisibility);
    settle();

    // The theme lives as a class on the application root, so the palette is
    // re-read from the cascade rather than duplicated in the renderer.
    const app = host.closest(".app");
    const themeObserver = app ? new MutationObserver(() => instance.setPalette(palette())) : null;
    themeObserver?.observe(app!, { attributes: true, attributeFilter: ["class"] });

    return () => {
      resizeObserver.disconnect();
      viewObserver.disconnect();
      themeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      instance.dispose();
      canvas.remove();
      world.current = null;
      handlers.current.onWorld?.(null);
      setReady(false);
    };
  }, []);

  React.useEffect(() => { world.current?.sync(agents, selectedId); }, [agents, selectedId]);

  const registerLabel = React.useCallback((id: string, element: HTMLElement | null) => {
    if (element) labels.current.set(id, element); else labels.current.delete(id);
    world.current?.attachLabels(labels.current);
  }, []);

  return (
    <div className="agent-world" ref={stage} data-ready={ready}>
      <div className="agent-world-labels" aria-label={t.canvas}>
        {agents.map(agent => (
          <button
            key={agent.id}
            type="button"
            ref={element => registerLabel(agent.id, element)}
            className="agent-world-label"
            data-state={agent.state}
            data-domain={agent.domain}
            data-selected={selectedId === agent.id}
            data-hovered={hovered === agent.id}
            // Focus moves the camera too, so a keyboard reader is never
            // inspecting a robot that is behind them.
            onFocus={() => onSelect(agent.id)}
            onClick={() => onSelect(agent.id)}
            aria-pressed={selectedId === agent.id}
            aria-label={`${agent.name}: ${stateLabel(agent.state)}${agent.pending ? ` · ${agent.pending}` : ""}`}
          >
            <span className="agent-world-label-icon"><Bot aria-hidden="true" /></span>
            <span className="agent-world-label-text">
              <b>{agent.name}</b>
              <small><i />{stateLabel(agent.state)}</small>
            </span>
            {agent.pending > 0 && <em>{agent.pending}</em>}
          </button>
        ))}
      </div>
      <div className="agent-world-hud">
        <span className="agent-world-hint"><MousePointerClick aria-hidden="true" />{t.hint}</span>
        <button type="button" className="agent-world-reset" onClick={() => world.current?.resetCamera()}>
          <Compass aria-hidden="true" />{t.reset}
        </button>
      </div>
      {!ready && <div className="agent-world-loading"><Maximize2 aria-hidden="true" />{t.loading}</div>}
    </div>
  );
}

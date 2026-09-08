/* The agent map as a place instead of a diagram.
 *
 * `src/agent-command.tsx` drew the eleven governed agents as absolutely
 * positioned buttons over an SVG line chart. It was accurate and unreadable: a
 * state change was a four-pixel dot changing colour. Here the same eleven
 * agents are robots at workstations in a desert outpost, and every state the
 * gateway reports is a behaviour you can see from across the room.
 *
 * This module owns the renderer and nothing else. It never reads Supabase, it
 * never imports React, and it names no colour: `readWorldPalette()` lifts the
 * `--world-*` tokens out of the cascade so the outpost flips with the theme.
 * The pure functions above `createAgentWorld` carry the decisions worth
 * testing, because a WebGL context is not available to Vitest.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type WorldState = "ready" | "working" | "approval" | "paused" | "blocked" | "error";
export type WorldDomain = "executive" | "delivery" | "growth" | "revenue" | "governance" | "knowledge";

/** The shape `agentTopology` already has. Kept structural so the engine never imports the app. */
export type WorldNode = { readonly id: string; readonly parent: string | null; readonly domain: WorldDomain };

export type WorldAgent = WorldNode & {
  readonly name: string;
  readonly state: WorldState;
  /** Runs queued, running or awaiting a decision. Shown as a badge on the nameplate. */
  readonly pending: number;
  readonly level: number;
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type WorldPlacement = { id: string; x: number; z: number; angle: number; depth: number };

/** The campus is rings, not rows: depth 0 is the HQ platform, each level out is a wider avenue. */
export const ringRadius = (depth: number) => (depth === 0 ? 0 : 3.5 + depth * 9);

/**
 * Places every node from the reporting tree alone, so adding an agent to
 * `agentTopology` moves nobody by hand. Direct reports are spread evenly around
 * the HQ; a specialist sits on the next ring out, beside the parent it reports
 * to, and siblings fan around that parent's bearing.
 */
export function worldLayout(nodes: readonly WorldNode[]): Map<string, WorldPlacement> {
  const placements = new Map<string, WorldPlacement>();
  const childrenOf = (parent: string | null) => nodes.filter(node => node.parent === parent);

  const roots = childrenOf(null);
  roots.forEach((root, index) => {
    // A second root would mean a broken topology, which agents.test.ts already
    // refuses. If one ever appears it stands beside the first rather than inside it.
    placements.set(root.id, { id: root.id, x: index * 6, z: 0, angle: 0, depth: 0 });
  });

  let frontier = roots;
  let depth = 1;
  while (frontier.length && depth < 8) {
    const next: WorldNode[] = [];
    // Direct reports of the root own the whole circle; deeper nodes fan around
    // their own parent so the tree stays legible as the campus grows outward.
    const firstRing = depth === 1;
    const ringMembers = frontier.flatMap(parent => childrenOf(parent.id));
    let placedOnRing = 0;
    for (const parent of frontier) {
      const children = childrenOf(parent.id);
      const base = placements.get(parent.id);
      children.forEach((child, index) => {
        const angle = firstRing
          ? ((placedOnRing + index) / Math.max(1, ringMembers.length)) * Math.PI * 2 + Math.PI / Math.max(1, ringMembers.length)
          : (base?.angle ?? 0) + (index - (children.length - 1) / 2) * 0.36;
        const radius = ringRadius(depth);
        placements.set(child.id, { id: child.id, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, angle, depth });
        next.push(child);
      });
      placedOnRing += children.length;
    }
    frontier = next;
    depth += 1;
  }
  return placements;
}

// ---------------------------------------------------------------------------
// State to behaviour
// ---------------------------------------------------------------------------

export type StateVisual = {
  /** Which semantic token drives the accent lights. */
  tone: "good" | "warn" | "risk" | "muted";
  /** How hard the robot works its desk: typing speed, screen brightness, dust. */
  activity: number;
  /** How far it sinks toward the pad. A paused agent slumps. */
  droop: number;
  /** A rotating light above the head. */
  beacon: boolean;
  /** Flashes per second. Zero is a steady beacon. */
  flash: number;
  /** The red containment dome a security block closes over an agent. */
  dome: boolean;
  /** An arm raised for a decision. */
  raised: boolean;
  /** Data packets travelling the link toward the parent. */
  packets: boolean;
};

const VISUALS: Record<WorldState, StateVisual> = {
  ready:    { tone: "good",  activity: 0.18, droop: 0,    beacon: false, flash: 0, dome: false, raised: false, packets: false },
  working:  { tone: "good",  activity: 1,    droop: 0,    beacon: false, flash: 0, dome: false, raised: false, packets: true },
  approval: { tone: "warn",  activity: 0.3,  droop: 0,    beacon: true,  flash: 0, dome: false, raised: true,  packets: false },
  paused:   { tone: "muted", activity: 0.02, droop: 1,    beacon: false, flash: 0, dome: false, raised: false, packets: false },
  blocked:  { tone: "risk",  activity: 0,    droop: 0.45, beacon: false, flash: 0, dome: true,  raised: false, packets: false },
  error:    { tone: "risk",  activity: 0.1,  droop: 0.2,  beacon: true,  flash: 3, dome: false, raised: false, packets: false },
};

export const stateVisual = (state: WorldState): StateVisual => VISUALS[state] ?? VISUALS.blocked;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const WORLD_TOKENS = [
  "world-sky-top", "world-sky-bottom", "world-sun", "world-haze",
  "world-sand", "world-sand-shade", "world-rock",
  "world-metal", "world-metal-dark", "world-glass",
  "world-district-executive", "world-district-delivery", "world-district-growth",
  "world-district-revenue", "world-district-governance", "world-district-knowledge",
  "good", "warn", "risk", "muted", "brand-400", "brand-600",
] as const;

export type WorldToken = typeof WORLD_TOKENS[number];
export type WorldPalette = Record<WorldToken, string>;

/** Only reached when the stylesheet has not applied yet; the world still renders. */
const FALLBACK: WorldPalette = {
  "world-sky-top": "#8fb3dd", "world-sky-bottom": "#f6ddb4", "world-sun": "#fff4d8", "world-haze": "#e9d5b2",
  "world-sand": "#dcbf90", "world-sand-shade": "#b99a68", "world-rock": "#9a8365",
  "world-metal": "#dcd7e6", "world-metal-dark": "#6d6681", "world-glass": "#2b2440",
  "world-district-executive": "#6f56b8", "world-district-delivery": "#2f79ad", "world-district-growth": "#c2703a",
  "world-district-revenue": "#2c8663", "world-district-governance": "#98548a", "world-district-knowledge": "#3a7f96",
  good: "#237a51", warn: "#8a5f12", risk: "#a52f2f", muted: "#71677e", "brand-400": "#8069bd", "brand-600": "#55418b",
};

/**
 * Three.js cannot parse `#rrggbbaa`, and a token that has drifted to a
 * `color-mix()` or an empty string must not black out the scene, so an
 * unreadable value falls back rather than throwing at the material.
 */
export function normaliseHex(value: string, fallback: string): string {
  const match = /^#([0-9a-fA-F]{3,8})$/.exec(value.trim());
  if (!match) return fallback;
  const digits = match[1];
  if (digits.length === 3 || digits.length === 6) return `#${digits}`;
  if (digits.length === 4) return `#${digits.slice(0, 3)}`;
  if (digits.length === 8) return `#${digits.slice(0, 6)}`;
  return fallback;
}

/** `lookup` is injected so the palette can be unit-tested without a document. */
export function readWorldPalette(lookup: (token: WorldToken) => string): WorldPalette {
  const palette = {} as WorldPalette;
  for (const token of WORLD_TOKENS) palette[token] = normaliseHex(lookup(token) ?? "", FALLBACK[token]);
  return palette;
}

export const districtToken = (domain: WorldDomain): WorldToken => `world-district-${domain}` as WorldToken;

export const toneToken = (tone: StateVisual["tone"]): WorldToken =>
  tone === "good" ? "good" : tone === "warn" ? "warn" : tone === "risk" ? "risk" : "muted";

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export type WorldQuality = "low" | "medium" | "high";

export type DeviceHints = { cores?: number; memory?: number; width?: number; coarsePointer?: boolean };

/**
 * A phone rendering eleven shadow-casting robots at device pixel ratio 3 is a
 * space heater, so the world sizes itself to the machine rather than asking.
 */
export function detectQuality({ cores = 4, memory = 4, width = 1280, coarsePointer = false }: DeviceHints): WorldQuality {
  if (cores <= 3 || memory <= 2 || width < 720) return "low";
  if (cores <= 6 || memory <= 4 || coarsePointer || width < 1100) return "medium";
  return "high";
}

export type QualityBudget = { shadowMap: number; dust: number; pixelRatio: number; tubeSegments: number; props: boolean };

export const qualityBudget = (quality: WorldQuality): QualityBudget =>
  quality === "high" ? { shadowMap: 2048, dust: 900, pixelRatio: 2, tubeSegments: 56, props: true }
  : quality === "medium" ? { shadowMap: 1024, dust: 420, pixelRatio: 1.5, tubeSegments: 36, props: true }
  : { shadowMap: 0, dust: 160, pixelRatio: 1, tubeSegments: 20, props: false };

/** Deterministic scatter: the dunes and rocks must not reshuffle on every mount. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low, wide dunes that flatten under the campus so no station sits on a slope. */
export function duneHeight(x: number, z: number): number {
  const wave = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 2.4 + Math.sin((x + z) * 0.05) * 1.7 + Math.cos(x * 0.031 - z * 0.043) * 3.4;
  const distance = Math.hypot(x, z);
  return wave * THREE.MathUtils.smoothstep(distance, 28, 52);
}

/** Relative luminance, used for exactly one decision: is this outpost in daylight? */
export function luminance(hex: string): number {
  const value = normaliseHex(hex, "#000000");
  const full = value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16) / 255;
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * The dark theme is not a filter over the day scene: a moon is dimmer and
 * bluer than a sun, and the emissive panels have to carry the frame instead.
 */
export const isNight = (palette: WorldPalette) => luminance(palette["world-sky-top"]) < 0.3;

export function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export type WorldOptions = {
  canvas: HTMLCanvasElement;
  palette: WorldPalette;
  quality: WorldQuality;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onReady?: () => void;
  /** Called when the world has just made itself cheaper to keep the frame rate. */
  onDegrade?: (step: number) => void;
};

/** What the renderer is actually costing, so a budget can be asserted rather than assumed. */
export type WorldStats = {
  drawCalls: number; triangles: number; geometries: number; textures: number; programs: number;
  frames: number; quality: WorldQuality; agents: number;
  /** How many times the world has stepped its own detail down to keep up. */
  degraded: number;
};

export type AgentWorld = {
  sync(agents: readonly WorldAgent[], selectedId: string | null): void;
  stats(): WorldStats;
  attachLabels(labels: ReadonlyMap<string, HTMLElement>): void;
  setPalette(palette: WorldPalette): void;
  setRunning(running: boolean): void;
  resize(width: number, height: number): void;
  resetCamera(): void;
  dispose(): void;
};

type Rig = {
  agent: WorldAgent;
  station: THREE.Group;
  robot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  beacon: THREE.Mesh;
  dome: THREE.Mesh;
  column: THREE.Mesh;
  anchor: THREE.Object3D;
  pick: THREE.Mesh;
  accent: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  padRing: THREE.MeshStandardMaterial;
  beaconMaterial: THREE.MeshBasicMaterial;
  domeMaterial: THREE.MeshBasicMaterial;
  columnMaterial: THREE.ShaderMaterial;
  phase: number;
  visual: StateVisual;
  lean: number;
  sink: number;
  lift: number;
  selected: boolean;
};

type Link = { childId: string; material: THREE.ShaderMaterial; packets: THREE.Mesh[]; curve: THREE.QuadraticBezierCurve3 };

const LABEL_HEIGHT = 2.55;
/** Where a robot floats above its own station, before the station scale applies. */
const ROBOT_BASE_Y = 0.42;

export function createAgentWorld(options: WorldOptions): AgentWorld {
  const { canvas, onSelect, onHover } = options;
  let palette = options.palette;
  const budget = qualityBudget(options.quality);
  const reducedMotion = options.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.quality !== "low", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = budget.shadowMap > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 420);
  // Low and close: the point of a world is that the robots read as characters.
  const HOME = new THREE.Vector3(0, 16, 42);
  camera.position.copy(HOME);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.06;
  controls.minDistance = 9;
  controls.maxDistance = 78;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 2.5, 0);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(value: T): T => { disposables.push(value); return value; };
  const colour = (token: WorldToken) => new THREE.Color(palette[token]);

  // ---- lighting -----------------------------------------------------------
  const hemisphere = new THREE.HemisphereLight(colour("world-sky-top"), colour("world-sand-shade"), 0.8);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(colour("world-sun"), 2.1);
  sun.position.set(30, 26, 24);
  if (budget.shadowMap > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(budget.shadowMap, budget.shadowMap);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    // The sun does not move and the campus does not either; only the robots
    // shift, by centimetres, so the depth map is regenerated a few times a
    // second rather than sixty. Under this container's software rasterizer the
    // saving is inside the noise — there the cost is in sampling the shadow,
    // not producing it — but on a GPU it is a whole render pass per frame that
    // nothing in the scene needed.
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
  }
  scene.add(sun);
  scene.add(sun.target);

  // ---- sky and haze -------------------------------------------------------
  const skyMaterial = track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: colour("world-sky-top") }, bottom: { value: colour("world-sky-bottom") } },
    vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;",
      "void main(){",
      "  float h = clamp(vPos.y / 190.0 + 0.12, 0.0, 1.0);",
      "  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }));
  const skyGeometry = track(new THREE.SphereGeometry(190, 32, 20));
  scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
  scene.fog = new THREE.Fog(colour("world-haze"), 72, 215);

  function applyDaylight() {
    const night = isNight(palette);
    hemisphere.intensity = night ? 1.45 : 0.8;
    sun.intensity = night ? 1.5 : 2.1;
    renderer.toneMappingExposure = night ? 1.35 : 0.95;
    const fog = scene.fog as THREE.Fog;
    fog.near = night ? 52 : 72; fog.far = night ? 165 : 215;
    sunDiscMaterial.opacity = night ? 0.9 : 0.75;
  }

  const sunDiscMaterial = track(new THREE.MeshBasicMaterial({ color: colour("world-sun"), fog: false, transparent: true, opacity: 0.75 }));
  const sunDisc = new THREE.Mesh(track(new THREE.SphereGeometry(6.5, 20, 14)), sunDiscMaterial);
  sunDisc.position.copy(sun.position).multiplyScalar(3.4);
  scene.add(sunDisc);
  applyDaylight();

  // ---- ground -------------------------------------------------------------
  const groundGeometry = track(new THREE.PlaneGeometry(300, 300, 110, 110));
  const groundPosition = groundGeometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < groundPosition.count; index += 1) {
    // The plane is still in its own XY space here: Y becomes -Z once rotated.
    const x = groundPosition.getX(index);
    const y = groundPosition.getY(index);
    groundPosition.setZ(index, duneHeight(x, -y));
  }
  groundGeometry.computeVertexNormals();
  const groundMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-sand"), roughness: 1, metalness: 0, flatShading: true }));
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = budget.shadowMap > 0;
  scene.add(ground);

  // The campus apron: one flat disc so the stations never float over a dune edge.
  const apronMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-sand-shade"), roughness: 0.95, metalness: 0.05 }));
  const apron = new THREE.Mesh(track(new THREE.CircleGeometry(25.5, 64)), apronMaterial);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.02;
  apron.receiveShadow = budget.shadowMap > 0;
  const apronRim = new THREE.Mesh(track(new THREE.TorusGeometry(25.5, 0.1, 6, 80)), track(new THREE.MeshStandardMaterial({ color: colour("world-rock"), roughness: 0.9, metalness: 0.1 })));
  apronRim.rotation.x = Math.PI / 2;
  apronRim.position.y = 0.05;
  scene.add(apron, apronRim);

  // ---- scenery ------------------------------------------------------------
  const rockMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-rock"), roughness: 1, flatShading: true }));
  const rockGeometry = track(new THREE.IcosahedronGeometry(1, 0));
  const random = seeded(20260908);
  const scenery = new THREE.Group();
  // One instanced mesh instead of twenty-six draw calls of the same rock.
  const rockCount = budget.props ? 28 : 10;
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  rocks.castShadow = budget.shadowMap > 0;
  const placement = new THREE.Object3D();
  for (let index = 0; index < rockCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 38 + random() * 76;
    placement.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    placement.position.y = duneHeight(placement.position.x, placement.position.z) - 0.35;
    placement.scale.set(0.8 + random() * 2.4, 0.6 + random() * 1.6, 0.8 + random() * 2.4);
    placement.rotation.set(random(), random() * Math.PI, random());
    placement.updateMatrix();
    rocks.setMatrixAt(index, placement.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  scenery.add(rocks);
  if (budget.props) {
    // A desert outpost runs on its own power: five solar arrays on the perimeter.
    const panelGeometry = track(new THREE.BoxGeometry(4.6, 0.16, 2.6));
    const panelMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), roughness: 0.25, metalness: 0.7 }));
    const frameGeometry = track(new THREE.BoxGeometry(4.8, 0.1, 2.8));
    const mastGeometry = track(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 8));
    const mastMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-metal-dark"), roughness: 0.6, metalness: 0.5 }));
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 + 0.4;
      const array = new THREE.Group();
      array.position.set(Math.sin(angle) * 33, 0, Math.cos(angle) * 33);
      array.position.y = duneHeight(array.position.x, array.position.z);
      // Facing the sun, which is where a solar array points and where the
      // panel catches enough light to stop reading as a hole in the sand.
      array.lookAt(sun.position.x, 0, sun.position.z);
      const mast = new THREE.Mesh(mastGeometry, mastMaterial);
      mast.position.y = 1.1;
      mast.castShadow = budget.shadowMap > 0;
      const frame = new THREE.Mesh(frameGeometry, mastMaterial);
      frame.position.y = 2.1;
      frame.rotation.x = -0.85;
      const panel = new THREE.Mesh(panelGeometry, panelMaterial);
      panel.position.y = 2.16;
      panel.rotation.x = -0.85;
      panel.castShadow = budget.shadowMap > 0;
      array.add(mast, frame, panel);
      scenery.add(array);
    }

  }
  scene.add(scenery);

  // ---- headquarters -------------------------------------------------------
  const metalMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-metal"), roughness: 0.45, metalness: 0.35 }));
  const darkMetalMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-metal-dark"), roughness: 0.55, metalness: 0.4 }));
  const glassMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), roughness: 0.2, metalness: 0.6 }));
  const brandMaterial = track(new THREE.MeshStandardMaterial({
    color: colour("brand-600"), emissive: colour("brand-400"), emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.3,
  }));

  const headquarters = new THREE.Group();
  const hqBase = new THREE.Mesh(track(new THREE.CylinderGeometry(6.4, 7.1, 0.7, 6)), darkMetalMaterial);
  hqBase.position.y = 0.35;
  hqBase.receiveShadow = budget.shadowMap > 0;
  const hqDeck = new THREE.Mesh(track(new THREE.CylinderGeometry(5.4, 5.9, 0.35, 6)), metalMaterial);
  hqDeck.position.y = 0.85;
  hqDeck.receiveShadow = budget.shadowMap > 0;
  const hqCore = new THREE.Mesh(track(new THREE.CylinderGeometry(0.55, 0.75, 4.6, 6)), brandMaterial);
  hqCore.position.set(0, 3.3, -2.4);
  hqCore.castShadow = budget.shadowMap > 0;
  const hqHalo = new THREE.Mesh(track(new THREE.TorusGeometry(1.5, 0.07, 8, 40)), brandMaterial);
  hqHalo.position.set(0, 5.1, -2.4);
  hqHalo.rotation.x = Math.PI / 2;
  headquarters.add(hqBase, hqDeck, hqCore, hqHalo);
  scene.add(headquarters);

  // ---- shared geometry ----------------------------------------------------
  // Eleven robots share one set of geometries; only the materials that carry
  // state are cloned, so a station costs draw calls rather than memory.
  const geometry = {
    pad: track(new THREE.CylinderGeometry(2.9, 3.1, 0.26, 28)),
    padRing: track(new THREE.TorusGeometry(2.92, 0.075, 8, 40)),
    deskTop: track(new THREE.BoxGeometry(2.2, 0.11, 1.0)),
    deskLeg: track(new THREE.BoxGeometry(0.14, 0.72, 0.14)),
    monitorFrame: track(new THREE.BoxGeometry(1.15, 0.72, 0.07)),
    monitorScreen: track(new THREE.PlaneGeometry(1.02, 0.6)),
    monitorStand: track(new THREE.CylinderGeometry(0.06, 0.16, 0.3, 8)),
    chairSeat: track(new THREE.CylinderGeometry(0.34, 0.3, 0.12, 12)),
    chairBack: track(new THREE.BoxGeometry(0.6, 0.5, 0.1)),
    crate: track(new THREE.BoxGeometry(0.7, 0.55, 0.7)),
    torso: track(new THREE.CapsuleGeometry(0.38, 0.5, 4, 14)),
    chest: track(new THREE.BoxGeometry(0.44, 0.24, 0.1)),
    head: track(new THREE.BoxGeometry(0.56, 0.46, 0.5)),
    visor: track(new THREE.PlaneGeometry(0.44, 0.2)),
    neck: track(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 10)),
    shoulder: track(new THREE.BoxGeometry(0.2, 0.16, 0.26)),
    backpack: track(new THREE.BoxGeometry(0.36, 0.46, 0.18)),
    waist: track(new THREE.TorusGeometry(0.34, 0.05, 6, 20)),
    ear: track(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8)),
    arm: track(new THREE.CapsuleGeometry(0.1, 0.42, 3, 8)),
    thruster: track(new THREE.ConeGeometry(0.4, 0.55, 16, 1, true)),
    antenna: track(new THREE.CylinderGeometry(0.028, 0.035, 0.34, 6)),
    beacon: track(new THREE.SphereGeometry(0.11, 12, 8)),
    dome: track(new THREE.SphereGeometry(1.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    column: track(new THREE.CylinderGeometry(0.5, 1.2, 10, 20, 1, true)),
    pick: track(new THREE.CylinderGeometry(1.6, 1.6, 4.4, 10)),
    packet: track(new THREE.OctahedronGeometry(0.16, 0)),
    crownCube: track(new THREE.BoxGeometry(0.17, 0.17, 0.17)),
  };

  // A comms mast, because an outpost that reports to nobody is a sculpture.
  if (budget.props) {
    const mast = new THREE.Group();
    mast.position.set(-25, 0, -13);
    mast.rotation.y = -1.1;
    const pylon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.4, 9, 6)), darkMetalMaterial);
    pylon.position.y = 4.5;
    pylon.castShadow = budget.shadowMap > 0;
    const disc = new THREE.Mesh(track(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 16)), metalMaterial);
    disc.position.set(0, 8.6, 0.5);
    disc.rotation.set(-1.1, 0, 0);
    const tip = new THREE.Mesh(geometry.beacon, track(new THREE.MeshBasicMaterial({ color: colour("brand-400"), fog: false })));
    tip.position.y = 9.2;
    mast.add(pylon, disc, tip);
    scenery.add(mast);
  }

  const linkMaterialFor = (tone: WorldToken) => track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { colour: { value: colour(tone) }, time: { value: 0 }, speed: { value: 0.35 }, strength: { value: 0.6 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 colour; uniform float time; uniform float speed; uniform float strength; varying vec2 vUv;",
      "void main(){",
      "  float pulse = smoothstep(0.62, 1.0, fract(vUv.x * 22.0 - time * speed));",
      "  gl_FragColor = vec4(colour * (0.35 + pulse * 1.8), strength);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }));

  const rigs = new Map<string, Rig>();
  const links: Link[] = [];
  const pickTargets: THREE.Mesh[] = [];
  const stationRoot = new THREE.Group();
  const linkRoot = new THREE.Group();
  scene.add(stationRoot, linkRoot);
  let labels: ReadonlyMap<string, HTMLElement> = new Map();
  let built = false;
  let ready = false;

  /** A light column that reads as light: bright at the pad, gone before the top. */
  const columnMaterialFor = () => track(new THREE.ShaderMaterial({
    // Low strength on purpose: a beam that hides the robot it points at is a bug.
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { colour: { value: colour("brand-400") }, strength: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 colour; uniform float strength; varying vec2 vUv;",
      "void main(){",
      "  float fade = pow(1.0 - vUv.y, 3.0) * 0.85 + 0.05;",
      "  gl_FragColor = vec4(colour * fade * strength, 1.0);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }));

  function buildStation(agent: WorldAgent, placement: WorldPlacement): Rig {
    const district = colour(districtToken(agent.domain));
    const isChief = placement.depth === 0;
    // The orchestrator is bigger because it is the orchestrator. Everything on a
    // station scales together, so a robot never towers over its own desk.
    const scale = isChief ? 1.75 : 1.3;
    const station = new THREE.Group();
    station.position.set(placement.x, 0, placement.z);
    // Facing out, not in. Facing the headquarters was the honest diagram of the
    // reporting line, and it pointed eleven robots away from a camera that
    // orbits the outside of the campus. The glowing link paths carry the
    // hierarchy instead, and the reader gets faces.
    station.rotation.y = placement.angle;

    const padMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-metal-dark"), roughness: 0.7, metalness: 0.25 }));
    const pad = new THREE.Mesh(geometry.pad, padMaterial);
    pad.position.y = isChief ? 1.15 : 0.13;
    pad.receiveShadow = budget.shadowMap > 0;
    if (isChief) pad.scale.setScalar(1.15);

    const padRing = track(new THREE.MeshStandardMaterial({ color: district, emissive: district, emissiveIntensity: 0.6, roughness: 0.4 }));
    const ring = new THREE.Mesh(geometry.padRing, padRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = pad.position.y + 0.14;
    if (isChief) ring.scale.setScalar(1.15);
    station.add(pad, ring);

    const furnished = new THREE.Group();
    furnished.position.y = pad.position.y + 0.13;
    furnished.scale.setScalar(scale);
    station.add(furnished);

    // ---- the desk it actually works at -----------------------------------
    const desk = new THREE.Group();
    desk.position.set(0, 0, 1.15);
    const deskTop = new THREE.Mesh(geometry.deskTop, metalMaterial);
    deskTop.position.y = 0.72;
    deskTop.castShadow = budget.shadowMap > 0;
    desk.add(deskTop);
    for (const side of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(geometry.deskLeg, darkMetalMaterial);
      leg.position.set(side, 0.36, 0);
      desk.add(leg);
    }
    const monitor = new THREE.Mesh(geometry.monitorFrame, darkMetalMaterial);
    monitor.position.set(0, 1.22, 0.12);
    monitor.rotation.x = 0.12;
    const stand = new THREE.Mesh(geometry.monitorStand, darkMetalMaterial);
    stand.position.set(0, 0.9, 0.12);
    const screenMaterial = track(new THREE.MeshStandardMaterial({
      color: colour("world-glass"), emissive: district, emissiveIntensity: 0.4, roughness: 0.3, side: THREE.DoubleSide,
    }));
    const screen = new THREE.Mesh(geometry.monitorScreen, screenMaterial);
    screen.position.set(0, 1.22, 0.08);
    screen.rotation.x = 0.12;
    screen.rotation.y = Math.PI;
    desk.add(monitor, stand, screen);

    const chair = new THREE.Group();
    chair.position.set(0, 0, 0.15);
    const seat = new THREE.Mesh(geometry.chairSeat, darkMetalMaterial);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(geometry.chairBack, darkMetalMaterial);
    back.position.set(0, 0.8, -0.28);
    chair.add(seat, back);

    const crate = new THREE.Mesh(geometry.crate, darkMetalMaterial);
    crate.position.set(-1.75, 0.28, -0.3);
    crate.rotation.y = 0.4;
    crate.castShadow = budget.shadowMap > 0;
    furnished.add(desk, chair, crate);

    // ---- the robot --------------------------------------------------------
    const robot = new THREE.Group();
    robot.position.set(0, ROBOT_BASE_Y, -0.7);

    const torso = new THREE.Group();
    const shell = new THREE.Mesh(geometry.torso, metalMaterial);
    shell.position.y = 1.05;
    shell.castShadow = budget.shadowMap > 0;
    const accent = track(new THREE.MeshStandardMaterial({ color: district, emissive: district, emissiveIntensity: 0.9, roughness: 0.35 }));
    const chest = new THREE.Mesh(geometry.chest, accent);
    chest.position.set(0, 1.12, 0.35);
    const thruster = new THREE.Mesh(geometry.thruster, accent);
    thruster.position.y = 0.5;
    thruster.rotation.x = Math.PI;
    // A capsule with a head on it is a pill. These are what make it a robot.
    const backpack = new THREE.Mesh(geometry.backpack, darkMetalMaterial);
    backpack.position.set(0, 1.12, -0.34);
    backpack.castShadow = budget.shadowMap > 0;
    const waist = new THREE.Mesh(geometry.waist, darkMetalMaterial);
    waist.position.y = 0.78;
    waist.rotation.x = Math.PI / 2;
    const neck = new THREE.Mesh(geometry.neck, darkMetalMaterial);
    neck.position.y = 1.44;
    const shoulders = [-0.47, 0.47].map(side => {
      const shoulder = new THREE.Mesh(geometry.shoulder, darkMetalMaterial);
      shoulder.position.set(side, 1.34, 0);
      return shoulder;
    });

    const head = new THREE.Group();
    head.position.y = 1.66;
    const skull = new THREE.Mesh(geometry.head, metalMaterial);
    skull.castShadow = budget.shadowMap > 0;
    const visor = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), emissive: colour("good"), emissiveIntensity: 1.4, roughness: 0.2 }));
    const visorMesh = new THREE.Mesh(geometry.visor, visor);
    visorMesh.position.z = 0.245;
    for (const side of [-0.29, 0.29]) {
      const ear = new THREE.Mesh(geometry.ear, darkMetalMaterial);
      ear.position.set(side, 0, 0);
      ear.rotation.z = Math.PI / 2;
      head.add(ear);
    }
    const antenna = new THREE.Mesh(geometry.antenna, darkMetalMaterial);
    antenna.position.y = 0.38;
    head.add(skull, visorMesh, antenna);

    const beaconMaterial = track(new THREE.MeshBasicMaterial({ color: colour("warn"), transparent: true, opacity: 0.9, fog: false }));
    const beacon = new THREE.Mesh(geometry.beacon, beaconMaterial);
    beacon.position.y = 2.28;
    beacon.visible = false;

    const armLeft = new THREE.Group();
    armLeft.position.set(-0.46, 1.28, 0);
    const armRight = new THREE.Group();
    armRight.position.set(0.46, 1.28, 0);
    for (const [pivot, sign] of [[armLeft, -1], [armRight, 1]] as const) {
      const limb = new THREE.Mesh(geometry.arm, metalMaterial);
      limb.position.y = -0.3;
      limb.castShadow = budget.shadowMap > 0;
      const hand = new THREE.Mesh(geometry.ear, accent);
      hand.position.y = -0.58;
      hand.rotation.z = Math.PI / 2 + sign * 0.1;
      pivot.add(limb, hand);
    }

    torso.add(shell, chest, thruster, backpack, waist, neck, ...shoulders, head, armLeft, armRight, beacon);
    robot.add(torso);

    if (isChief) {
      // The orchestrator wears its authority: three governance cubes in orbit.
      const crown = new THREE.Group();
      crown.name = "crown";
      for (let index = 0; index < 3; index += 1) {
        const cube = new THREE.Mesh(geometry.crownCube, brandMaterial);
        const angle = (index / 3) * Math.PI * 2;
        cube.position.set(Math.sin(angle) * 0.62, 2.24, Math.cos(angle) * 0.62);
        crown.add(cube);
      }
      robot.add(crown);
    }
    furnished.add(robot);

    const domeMaterial = track(new THREE.MeshBasicMaterial({ color: colour("risk"), wireframe: true, transparent: true, opacity: 0.5, fog: false }));
    const dome = new THREE.Mesh(geometry.dome, domeMaterial);
    dome.position.y = pad.position.y + 0.14;
    dome.scale.setScalar(scale);
    dome.visible = false;

    const columnMaterial = columnMaterialFor();
    const column = new THREE.Mesh(geometry.column, columnMaterial);
    column.position.y = pad.position.y + 5.4;

    const pickMaterial = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    const pick = new THREE.Mesh(geometry.pick, pickMaterial);
    pick.position.y = pad.position.y + 1.7 * scale;
    pick.scale.setScalar(scale);
    pick.userData.agentId = agent.id;
    pick.renderOrder = -1;

    const anchor = new THREE.Object3D();
    anchor.position.set(0, pad.position.y + LABEL_HEIGHT * scale, -0.7 * scale);

    station.add(dome, column, pick, anchor);
    stationRoot.add(station);
    pickTargets.push(pick);

    return {
      agent, station, robot, torso, head, armLeft, armRight, beacon, dome, column, anchor, pick,
      accent, visor, screen: screenMaterial, padRing, beaconMaterial, domeMaterial, columnMaterial,
      phase: (placement.angle + placement.depth) * 1.7, visual: stateVisual(agent.state),
      lean: 0, sink: 0, lift: 0, selected: false,
    };
  }

  function buildLinks(agents: readonly WorldAgent[], placements: Map<string, WorldPlacement>) {
    for (const agent of agents) {
      if (!agent.parent) continue;
      const from = placements.get(agent.parent);
      const to = placements.get(agent.id);
      if (!from || !to) continue;
      const start = new THREE.Vector3(from.x, 1.5, from.z);
      const end = new THREE.Vector3(to.x, 0.6, to.z);
      const middle = start.clone().add(end).multiplyScalar(0.5);
      middle.y = 2.6;
      // Bow the path outward so two links never overlap into one bright smear.
      middle.x *= 1.12; middle.z *= 1.12;
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      const material = linkMaterialFor("good");
      const mesh = new THREE.Mesh(track(new THREE.TubeGeometry(curve, budget.tubeSegments, 0.06, 6, false)), material);
      linkRoot.add(mesh);
      const packets: THREE.Mesh[] = [];
      const packetCount = budget.props ? 3 : 1;
      for (let index = 0; index < packetCount; index += 1) {
        const packet = new THREE.Mesh(geometry.packet, track(new THREE.MeshBasicMaterial({ color: colour("good"), fog: false })));
        packet.visible = false;
        linkRoot.add(packet);
        packets.push(packet);
      }
      links.push({ childId: agent.id, material, packets, curve });
    }
  }

  // ---- drifting sand ------------------------------------------------------
  const dustGeometry = track(new THREE.BufferGeometry());
  const dustPositions = new Float32Array(budget.dust * 3);
  const dustSpeeds = new Float32Array(budget.dust);
  for (let index = 0; index < budget.dust; index += 1) {
    dustPositions[index * 3] = (random() - 0.5) * 150;
    dustPositions[index * 3 + 1] = random() * 16;
    dustPositions[index * 3 + 2] = (random() - 0.5) * 150;
    dustSpeeds[index] = 1.4 + random() * 3.4;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = track(new THREE.PointsMaterial({
    color: colour("world-haze"), size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // ---- interaction --------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: string | null = null;
  let pressedAt: { x: number; y: number } | null = null;

  const toPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  };
  const pickAt = (): string | null => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    return (hit?.object.userData.agentId as string | undefined) ?? null;
  };
  let hoverThrottle = 0;
  const handleMove = (event: PointerEvent) => {
    const now = performance.now();
    if (now - hoverThrottle < 70) return;
    hoverThrottle = now;
    toPointer(event);
    const found = pickAt();
    if (found === hovered) return;
    hovered = found;
    canvas.style.cursor = found ? "pointer" : "grab";
    onHover(found);
    if (reducedMotion) requestRender();
  };
  const handleDown = (event: PointerEvent) => { pressedAt = { x: event.clientX, y: event.clientY }; };
  const handleUp = (event: PointerEvent) => {
    // An orbit drag must not select whatever robot the pointer landed on.
    if (!pressedAt || Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 6) { pressedAt = null; return; }
    pressedAt = null;
    toPointer(event);
    const found = pickAt();
    if (found) onSelect(found);
  };
  const handleLeave = () => { if (hovered !== null) { hovered = null; onHover(null); } };
  canvas.addEventListener("pointermove", handleMove);
  canvas.addEventListener("pointerdown", handleDown);
  canvas.addEventListener("pointerup", handleUp);
  canvas.addEventListener("pointerleave", handleLeave);
  canvas.style.cursor = "grab";

  // ---- camera focus -------------------------------------------------------
  const desiredTarget = new THREE.Vector3(0, 2, 0);
  const focus = (id: string | null) => {
    const rig = id ? rigs.get(id) : undefined;
    if (!rig) { desiredTarget.set(0, 2, 0); return; }
    desiredTarget.set(rig.station.position.x, 2.2, rig.station.position.z);
  };

  // ---- projection of the HTML nameplates ----------------------------------
  const projection = new THREE.Vector3();
  function placeLabels(width: number, height: number) {
    for (const [id, element] of labels) {
      const rig = rigs.get(id);
      if (!rig) continue;
      rig.anchor.getWorldPosition(projection);
      const distance = projection.distanceTo(camera.position);
      projection.project(camera);
      const behind = projection.z > 1;
      const x = (projection.x * 0.5 + 0.5) * width;
      const y = (-projection.y * 0.5 + 0.5) * height;
      // Depth is the only cue a flat overlay has, so a far nameplate shrinks
      // and fades rather than crowding the near ones.
      const scale = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(distance, 14, 80, 1, 0.62), 0.58, 1.06);
      element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      element.style.opacity = behind ? "0" : String(THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(distance, 20, 95, 1, 0.25), 0.25, 1));
      element.style.zIndex = String(Math.max(1, 400 - Math.round(distance)));
      element.style.pointerEvents = behind ? "none" : "auto";
    }
  }

  // ---- frame --------------------------------------------------------------
  let width = 1;
  let height = 1;
  let elapsed = 0;
  let frames = 0;
  let sinceShadow = 0;
  let framesSinceShadow = 0;
  let slowFor = 0;
  let degraded = 0;
  const startedAt = performance.now();

  /**
   * The device hints that pick a quality tier are a guess: two machines
   * reporting eight cores can be a workstation and a fanless tablet. So the
   * world also watches its own frame time and gives detail up rather than
   * asking the reader to sit through a slideshow. It never steps back up —
   * flipping between two qualities is worse than staying at the lower one.
   */
  function considerDegrading(frameSeconds: number) {
    // Wall clock, not scene time: the first seconds are shader compilation and
    // would otherwise convict a fast machine of being slow.
    if (degraded >= 2 || reducedMotion || performance.now() - startedAt < 2500) return;
    slowFor = frameSeconds > 1 / 24 ? slowFor + frameSeconds : 0;
    if (slowFor < 2.5) return;
    slowFor = 0;
    degraded += 1;
    if (degraded === 1) {
      renderer.setPixelRatio(1);
      dust.visible = false;
    } else {
      renderer.shadowMap.enabled = false;
      scene.traverse(object => {
        const material = (object as THREE.Mesh).material;
        if (!material) return;
        for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true;
      });
    }
    options.onDegrade?.(degraded);
  }
  let running = false;
  let renderRequested = false;
  const clock = new THREE.Clock();
  const ease = (current: number, goal: number, delta: number, rate = 6) => current + (goal - current) * (1 - Math.exp(-rate * delta));

  function animateRig(rig: Rig, delta: number) {
    const visual = rig.visual;
    const beat = elapsed * 1.7 + rig.phase;
    rig.lean = ease(rig.lean, visual.activity * 0.26, delta, 4);
    rig.sink = ease(rig.sink, visual.droop * 0.42, delta, 3);
    rig.lift = ease(rig.lift, rig.selected ? 0.22 : hovered === rig.agent.id ? 0.12 : 0, delta, 8);

    const hover = Math.sin(beat) * 0.06 * (1 - visual.droop);
    rig.robot.position.y = ROBOT_BASE_Y + hover - rig.sink + rig.lift;
    rig.torso.rotation.x = rig.lean;
    rig.torso.rotation.z = visual.dome ? 0 : Math.sin(beat * 0.6) * 0.02;

    // A robot in error shakes; the others hold still.
    rig.robot.position.x = visual.flash ? Math.sin(elapsed * 34) * 0.035 : 0;

    // Typing. The arms only move as fast as the agent is actually working.
    const typing = Math.sin(elapsed * 11 + rig.phase) * 0.5 + 0.5;
    const reach = visual.activity * 0.95;
    rig.armLeft.rotation.x = -reach * (0.55 + typing * 0.35);
    rig.armRight.rotation.x = visual.raised ? 0 : -reach * (0.55 + (1 - typing) * 0.35);
    rig.armRight.rotation.z = visual.raised ? -2.35 + Math.sin(elapsed * 3) * 0.12 : visual.dome ? -0.9 : 0;
    rig.armLeft.rotation.z = visual.dome ? 0.9 : 0;

    // The head tracks the camera so a face is always turned toward the reader,
    // however the campus happens to be rotated.
    const toCamera = Math.atan2(camera.position.x - rig.station.position.x, camera.position.z - rig.station.position.z) - rig.station.rotation.y;
    const wrapped = Math.atan2(Math.sin(toCamera), Math.cos(toCamera));
    const scan = visual.droop > 0.5 ? 0 : Math.sin(beat * 0.5) * 0.18;
    rig.head.rotation.y = ease(rig.head.rotation.y, THREE.MathUtils.clamp(wrapped, -1.2, 1.2) * 0.85 + scan, delta, 2.5);
    rig.head.rotation.x = ease(rig.head.rotation.x, visual.droop * 0.4 - rig.lean * 0.5, delta, 3);

    rig.visor.emissiveIntensity = visual.droop > 0.5 ? 0.15 : 1.1 + visual.activity * 0.9 + Math.sin(elapsed * 6 + rig.phase) * 0.12;
    rig.accent.emissiveIntensity = 0.35 + visual.activity * 1.1;
    rig.screen.emissiveIntensity = 0.18 + visual.activity * (0.9 + Math.sin(elapsed * 12 + rig.phase) * 0.35);
    rig.padRing.emissiveIntensity = 0.35 + (rig.selected ? 1.1 : 0) + visual.activity * 0.5
      + (visual.beacon ? (Math.sin(elapsed * (visual.flash || 1.6) * Math.PI) * 0.5 + 0.5) * 0.8 : 0);

    rig.beacon.visible = visual.beacon;
    if (visual.beacon) {
      rig.beacon.position.x = Math.sin(elapsed * 4) * 0.16;
      rig.beacon.position.z = Math.cos(elapsed * 4) * 0.16;
      rig.beaconMaterial.opacity = visual.flash ? (Math.sin(elapsed * visual.flash * Math.PI * 2) > 0 ? 0.95 : 0.12) : 0.9;
    }
    rig.dome.visible = visual.dome;
    if (visual.dome) rig.dome.rotation.y = elapsed * 0.35;

    const beam = rig.columnMaterial.uniforms.strength;
    beam.value = ease(beam.value as number, rig.selected ? 0.11 + Math.sin(elapsed * 2.4) * 0.03 : 0, delta, 5);
    rig.column.visible = (beam.value as number) > 0.01;

    const crown = rig.robot.getObjectByName("crown");
    if (crown) crown.rotation.y = elapsed * 0.6;
  }

  function frame() {
    // The animation clamps its step so a stall cannot teleport a robot across
    // the campus; the health check needs the real time the frame took.
    const frameSeconds = clock.getDelta();
    const delta = Math.min(frameSeconds, 0.05);
    elapsed += delta;
    considerDegrading(frameSeconds);
    // Two gates, because they protect different machines: the clock keeps the
    // shadow refresh at 4Hz on hardware fast enough not to need it, and the
    // frame count keeps it to every fourth frame on hardware slow enough that a
    // quarter of a second passes inside a single frame.
    sinceShadow += delta;
    framesSinceShadow += 1;
    if (sinceShadow > 0.25 && framesSinceShadow >= 4) { sinceShadow = 0; framesSinceShadow = 0; sun.shadow.needsUpdate = true; }
    controls.update();
    controls.target.lerp(desiredTarget, 1 - Math.exp(-3 * delta));

    for (const rig of rigs.values()) animateRig(rig, delta);

    for (const link of links) {
      const rig = rigs.get(link.childId);
      if (!rig) continue;
      link.material.uniforms.time.value = elapsed;
      link.material.uniforms.speed.value = 0.25 + rig.visual.activity * 2.2;
      link.material.uniforms.strength.value = 0.25 + rig.visual.activity * 0.55;
      link.packets.forEach((packet, index) => {
        packet.visible = rig.visual.packets;
        if (!packet.visible) return;
        // Packets travel child -> parent: the report goes up the tree.
        const progress = 1 - ((elapsed * 0.45 + index / link.packets.length) % 1);
        link.curve.getPoint(progress, packet.position);
        packet.rotation.set(elapsed * 2, elapsed * 3, 0);
      });
    }

    hqHalo.rotation.z = elapsed * 0.4;
    hqHalo.position.y = 5.1 + Math.sin(elapsed) * 0.12;

    const positions = dustGeometry.attributes.position as THREE.BufferAttribute;
    const gust = 1 + Math.sin(elapsed * 0.23) * 0.55;
    for (let index = 0; index < budget.dust; index += 1) {
      let x = positions.getX(index) + dustSpeeds[index] * delta * gust;
      if (x > 75) x -= 150;
      positions.setX(index, x);
      positions.setY(index, positions.getY(index) + Math.sin(elapsed * 0.8 + index) * delta * 0.2);
    }
    positions.needsUpdate = true;

    renderer.render(scene, camera);
    frames += 1;
    placeLabels(width, height);
    if (!ready) { ready = true; options.onReady?.(); }
  }

  function renderStill() {
    renderRequested = false;
    sun.shadow.needsUpdate = true;
    controls.update();
    controls.target.lerp(desiredTarget, 1);
    for (const rig of rigs.values()) animateRig(rig, 0.6);
    renderer.render(scene, camera);
    frames += 1;
    placeLabels(width, height);
    if (!ready) { ready = true; options.onReady?.(); }
  }

  function requestRender() {
    if (!reducedMotion || renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(renderStill);
  }

  // A reader who asked for reduced motion still gets the place, just not the
  // animation: the world renders on demand instead of every frame.
  if (reducedMotion) controls.addEventListener("change", requestRender);

  return {
    stats: () => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      frames: frames,
      quality: options.quality,
      agents: rigs.size,
      degraded,
    }),

    sync(agents, selectedId) {
      if (!built && agents.length) {
        const placements = worldLayout(agents);
        for (const agent of agents) {
          const placement = placements.get(agent.id);
          if (placement) rigs.set(agent.id, buildStation(agent, placement));
        }
        buildLinks(agents, placements);
        built = true;
      }
      for (const agent of agents) {
        const rig = rigs.get(agent.id);
        if (!rig) continue;
        rig.agent = agent;
        rig.visual = stateVisual(agent.state);
        rig.selected = agent.id === selectedId;
        const tone = colour(toneToken(rig.visual.tone));
        rig.visor.emissive.copy(tone);
        rig.beaconMaterial.color.copy(tone);
        const link = links.find(candidate => candidate.childId === agent.id);
        if (link) {
          link.material.uniforms.colour.value = tone;
          link.packets.forEach(packet => (packet.material as THREE.MeshBasicMaterial).color.copy(tone));
        }
      }
      focus(selectedId);
      requestRender();
    },

    attachLabels(next) { labels = next; requestRender(); },

    setPalette(next) {
      palette = next;
      // Rebuilding the campus for a theme toggle would drop the reader's camera,
      // so the materials are recoloured in place instead.
      hemisphere.color.copy(colour("world-sky-top"));
      hemisphere.groundColor.copy(colour("world-sand-shade"));
      sun.color.copy(colour("world-sun"));
      sunDiscMaterial.color.copy(colour("world-sun"));
      skyMaterial.uniforms.top.value = colour("world-sky-top");
      skyMaterial.uniforms.bottom.value = colour("world-sky-bottom");
      (scene.fog as THREE.Fog).color.copy(colour("world-haze"));
      groundMaterial.color.copy(colour("world-sand"));
      apronMaterial.color.copy(colour("world-sand-shade"));
      rockMaterial.color.copy(colour("world-rock"));
      metalMaterial.color.copy(colour("world-metal"));
      darkMetalMaterial.color.copy(colour("world-metal-dark"));
      glassMaterial.color.copy(colour("world-glass"));
      brandMaterial.color.copy(colour("brand-600"));
      brandMaterial.emissive.copy(colour("brand-400"));
      dustMaterial.color.copy(colour("world-haze"));
      for (const rig of rigs.values()) {
        const district = colour(districtToken(rig.agent.domain));
        rig.accent.color.copy(district); rig.accent.emissive.copy(district);
        rig.padRing.color.copy(district); rig.padRing.emissive.copy(district);
        rig.screen.color.copy(colour("world-glass")); rig.screen.emissive.copy(district);
        rig.visor.color.copy(colour("world-glass")); rig.visor.emissive.copy(colour(toneToken(rig.visual.tone)));
        rig.domeMaterial.color.copy(colour("risk"));
        rig.columnMaterial.uniforms.colour.value = colour("brand-400");
      }
      requestRender();
    },

    setRunning(next) {
      if (next === running) return;
      running = next;
      if (reducedMotion) { if (next) requestRender(); return; }
      if (next) { clock.getDelta(); renderer.setAnimationLoop(frame); } else renderer.setAnimationLoop(null);
    },

    resize(nextWidth, nextHeight) {
      width = Math.max(1, nextWidth); height = Math.max(1, nextHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      requestRender();
    },

    resetCamera() {
      camera.position.copy(HOME);
      desiredTarget.set(0, 2, 0);
      controls.target.set(0, 2, 0);
      controls.update();
      requestRender();
    },

    dispose() {
      renderer.setAnimationLoop(null);
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerdown", handleDown);
      canvas.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("pointerleave", handleLeave);
      if (reducedMotion) controls.removeEventListener("change", requestRender);
      controls.dispose();
      for (const resource of disposables) resource.dispose();
      disposables.length = 0;
      rigs.clear();
      links.length = 0;
      pickTargets.length = 0;
      renderer.dispose();
    },
  };
}

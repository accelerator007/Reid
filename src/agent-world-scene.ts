/* The agent map as a place instead of a diagram.
 *
 * `src/agent-command.tsx` drew the eleven governed agents as absolutely
 * positioned buttons over an SVG line chart. It was accurate and unreadable: a
 * state change was a four-pixel dot changing colour. Here the same eleven
 * agents are robots at workstations in a desert outpost, and every state the
 * gateway reports is a behaviour you can see from across the room.
 *
 * The world is modelled in metres: a robot is 1.85 tall, a desk is 0.74, a
 * workstation pad is 5.2 across. Keeping real proportions is most of what
 * makes a procedural scene look built rather than assembled from primitives.
 *
 * This module owns the renderer and nothing else. It never reads Supabase, it
 * never imports React, and it names no colour: `readWorldPalette()` lifts the
 * `--world-*` tokens out of the cascade so the outpost flips with the theme.
 * The pure functions above `createAgentWorld` carry the decisions worth
 * testing, because a WebGL context is not available to Vitest.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
export const ringRadius = (depth: number) => (depth === 0 ? 0 : 3 + depth * 8);

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
          : (base?.angle ?? 0) + (index - (children.length - 1) / 2) * 0.4;
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

/** What the body is doing. The renderer blends between these rather than snapping. */
export type PoseName = "idle" | "typing" | "raised" | "slumped" | "crossed" | "shaken";

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
  /** The whole-body posture this state stands in. */
  pose: PoseName;
};

const VISUALS: Record<WorldState, StateVisual> = {
  ready:    { tone: "good",  activity: 0.16, droop: 0,    beacon: false, flash: 0, dome: false, raised: false, packets: false, pose: "idle" },
  working:  { tone: "good",  activity: 1,    droop: 0,    beacon: false, flash: 0, dome: false, raised: false, packets: true,  pose: "typing" },
  approval: { tone: "warn",  activity: 0.3,  droop: 0,    beacon: true,  flash: 0, dome: false, raised: true,  packets: false, pose: "raised" },
  paused:   { tone: "muted", activity: 0.02, droop: 1,    beacon: false, flash: 0, dome: false, raised: false, packets: false, pose: "slumped" },
  blocked:  { tone: "risk",  activity: 0,    droop: 0.35, beacon: false, flash: 0, dome: true,  raised: false, packets: false, pose: "crossed" },
  error:    { tone: "risk",  activity: 0.1,  droop: 0.15, beacon: true,  flash: 3, dome: false, raised: false, packets: false, pose: "shaken" },
};

export const stateVisual = (state: WorldState): StateVisual => VISUALS[state] ?? VISUALS.blocked;

/** Joint angles in radians, blended toward every frame so a state change is a movement. */
export type Pose = {
  hip: number; knee: number;
  lean: number; headPitch: number; sink: number;
  shoulder: number; elbow: number; shoulderOut: number;
};

export const POSES: Record<PoseName, Pose> = {
  idle:    { hip: 0.02, knee: 0.08, lean: 0.02, headPitch: 0,    sink: 0,    shoulder: 0.06, elbow: -0.22, shoulderOut: 0.08 },
  typing:  { hip: 0.16, knee: 0.2,   lean: 0.2,  headPitch: 0.34, sink: 0.05, shoulder: -0.9, elbow: -1.15, shoulderOut: 0.18 },
  raised:  { hip: 0.02, knee: 0.06, lean: -0.05, headPitch: -0.12, sink: 0,  shoulder: 0.04, elbow: -0.2,  shoulderOut: 0.1 },
  slumped: { hip: 0.34, knee: 0.6,  lean: 0.3,  headPitch: 0.5,  sink: 0.22, shoulder: 0.2,  elbow: -0.32, shoulderOut: 0.05 },
  // Arms folded across the chest, which needs the shoulders in, not out.
  crossed: { hip: 0.04, knee: 0.1,  lean: -0.04, headPitch: -0.05, sink: 0,  shoulder: -1.2, elbow: -1.95, shoulderOut: -0.32 },
  shaken:  { hip: 0.08, knee: 0.16, lean: 0.1,  headPitch: 0.14, sink: 0.06, shoulder: 0.14, elbow: -0.5,  shoulderOut: 0.14 },
};

export const poseFor = (state: WorldState): Pose => POSES[stateVisual(state).pose];

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const WORLD_TOKENS = [
  "world-sky-top", "world-sky-bottom", "world-sun", "world-haze",
  "world-sand", "world-sand-shade", "world-rock",
  "world-shell", "world-shell-shade", "world-joint", "world-rubber",
  "world-metal", "world-metal-dark", "world-desk", "world-glass",
  "world-district-executive", "world-district-delivery", "world-district-growth",
  "world-district-revenue", "world-district-governance", "world-district-knowledge",
  "good", "warn", "risk", "muted", "brand-400", "brand-600",
] as const;

export type WorldToken = typeof WORLD_TOKENS[number];
export type WorldPalette = Record<WorldToken, string>;

/** Only reached when the stylesheet has not applied yet; the world still renders. */
const FALLBACK: WorldPalette = {
  "world-sky-top": "#4f8bcd", "world-sky-bottom": "#e9c99b", "world-sun": "#fff3d2", "world-haze": "#ddc39c",
  "world-sand": "#d9b678", "world-sand-shade": "#a8834f", "world-rock": "#8d7355",
  "world-shell": "#eceaf2", "world-shell-shade": "#b9b4c6", "world-joint": "#3c3847", "world-rubber": "#232029",
  "world-metal": "#cfcad9", "world-metal-dark": "#6d6681", "world-desk": "#ded8e4", "world-glass": "#0e0c16",
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

export type QualityBudget = {
  shadowMap: number; dust: number; pixelRatio: number; tubeSegments: number;
  props: boolean; /** Rounded corners and smooth capsules cost triangles; a weak device gets fewer. */ detail: number;
};

export const qualityBudget = (quality: WorldQuality): QualityBudget =>
  quality === "high" ? { shadowMap: 2048, dust: 900, pixelRatio: 2, tubeSegments: 56, props: true, detail: 1 }
  : quality === "medium" ? { shadowMap: 1024, dust: 420, pixelRatio: 1.5, tubeSegments: 36, props: true, detail: 1 }
  : { shadowMap: 0, dust: 160, pixelRatio: 1, tubeSegments: 20, props: false, detail: 1 };

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
  return wave * THREE.MathUtils.smoothstep(distance, 26, 50);
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

/** A shoulder-to-hand or hip-to-foot chain, posed by two angles. */
type Limb = { upper: THREE.Group; lower: THREE.Group };

type Rig = {
  agent: WorldAgent;
  station: THREE.Group;
  robot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  arms: readonly [Limb, Limb];
  legs: readonly [Limb, Limb];
  beacon: THREE.Mesh;
  dome: THREE.Mesh;
  column: THREE.Mesh;
  visorGlow: THREE.Sprite;
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
  pose: Pose;
  blinkAt: number;
  selected: boolean;
};

type Link = { childId: string; material: THREE.ShaderMaterial; packets: THREE.Mesh[]; curve: THREE.QuadraticBezierCurve3 };

/** Where a nameplate floats: just clear of a 1.85 m robot with its antenna up. */
const LABEL_HEIGHT = 2.35;

export function createAgentWorld(options: WorldOptions): AgentWorld {
  const { canvas, onSelect, onHover } = options;
  let palette = options.palette;
  const budget = qualityBudget(options.quality);
  const reducedMotion = options.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.quality !== "low", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = budget.shadowMap > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.4, 420);
  // Eye level of somebody standing at the edge of the outpost, not a satellite.
  const HOME = new THREE.Vector3(0, 12.5, 36);
  camera.position.copy(HOME);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 66;
  controls.maxPolarAngle = Math.PI * 0.487;
  controls.minPolarAngle = Math.PI * 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 1.6, 0);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(value: T): T => { disposables.push(value); return value; };
  const colour = (token: WorldToken) => new THREE.Color(palette[token]);

  // ---- procedural textures ------------------------------------------------
  // Every texture in the world is drawn here rather than downloaded: no asset
  // pipeline, no cache miss, and the grain follows the theme like everything else.
  function paint(size: number, draw: (context: CanvasRenderingContext2D) => void) {
    const surface = document.createElement("canvas");
    surface.width = surface.height = size;
    draw(surface.getContext("2d")!);
    return track(new THREE.CanvasTexture(surface));
  }

  const noise = seeded(7717);
  const sandTexture = paint(256, context => {
    const image = context.createImageData(256, 256);
    // Wind ripples plus grain. Flat colour reads as plastic at any distance.
    const grain = Array.from({ length: 256 * 256 }, () => noise());
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const at = y * 256 + x;
        const ripple = Math.sin((x * 0.28) + Math.sin(y * 0.06) * 3) * 0.5 + 0.5;
        const speck = grain[at] * 0.35 + grain[(at + 991) % grain.length] * 0.2;
        const value = Math.round(150 + ripple * 55 + speck * 50);
        image.data[at * 4] = image.data[at * 4 + 1] = image.data[at * 4 + 2] = value;
        image.data[at * 4 + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  });
  sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.repeat.set(70, 70);
  sandTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const radial = (stops: readonly [number, string][]) => paint(128, context => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, value] of stops) gradient.addColorStop(at, value);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
  const glowTexture = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.45)"], [1, "rgba(255,255,255,0)"]]);
  // Ambient occlusion the cheap and old way: a soft dark patch where a body
  // meets the floor. It is most of what stops a model from looking pasted on.
  const contactTexture = radial([[0, "rgba(0,0,0,0.62)"], [0.55, "rgba(0,0,0,0.22)"], [1, "rgba(0,0,0,0)"]]);

  // ---- lighting -----------------------------------------------------------
  const hemisphere = new THREE.HemisphereLight(colour("world-sky-top"), colour("world-sand-shade"), 0.8);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(colour("world-sun"), 2.1);
  sun.position.set(24, 20, 20);
  if (budget.shadowMap > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(budget.shadowMap, budget.shadowMap);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    // The sun does not move and the campus does not either; only the robots
    // shift, by centimetres, so the depth map is regenerated a few times a
    // second rather than sixty.
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
  }
  scene.add(sun, sun.target);
  // A cool bounce from the opposite side so the shadowed half of a robot has
  // shape instead of being a silhouette.
  const fill = new THREE.DirectionalLight(colour("world-sky-top"), 0.5);
  fill.position.set(-18, 9, -14);
  scene.add(fill);

  // ---- sky, haze and the reflections everything metal needs ---------------
  const skyShader = () => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: colour("world-sky-top") }, bottom: { value: colour("world-sky-bottom") }, sun: { value: colour("world-sun") } },
    vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vPos;",
      "void main(){",
      "  vec3 dir = normalize(vPos);",
      "  vec3 sky = mix(bottom, top, smoothstep(-0.02, 0.4, dir.y));",
      // A wide, soft glow where the sun sits, so the horizon is not a flat band.
      "  float halo = pow(max(0.0, dot(dir, normalize(vec3(0.68, 0.42, 0.6)))), 6.0);",
      "  gl_FragColor = vec4(sky + sun * halo * 0.5, 1.0);",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  });
  const skyMaterial = track(skyShader());
  const skyGeometry = track(new THREE.SphereGeometry(190, 32, 24));
  scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
  scene.fog = new THREE.Fog(colour("world-haze"), 60, 200);

  // Image-based lighting from the sky itself. Without it every metal surface is
  // a flat grey shape; with it the robots pick up the sand and the sky, which
  // is the single largest step from "primitives" to "objects".
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | null = null;
  function buildEnvironment() {
    const source = new THREE.Scene();
    const material = skyShader();
    const geometry = new THREE.SphereGeometry(80, 24, 16);
    const floorGeometry = new THREE.CircleGeometry(120, 24);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: colour("world-sand") });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    source.add(new THREE.Mesh(geometry, material), floor);
    environment?.dispose();
    environment = pmrem.fromScene(source, 0, 1, 200);
    scene.environment = environment.texture;
    geometry.dispose(); material.dispose(); floorGeometry.dispose(); floorMaterial.dispose();
  }
  buildEnvironment();

  const sunDiscMaterial = track(new THREE.SpriteMaterial({ map: glowTexture, color: colour("world-sun"), transparent: true, opacity: 0.85, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const sunDisc = new THREE.Sprite(sunDiscMaterial);
  sunDisc.scale.setScalar(46);
  sunDisc.position.set(88, 54, 78);
  scene.add(sunDisc);

  function applyDaylight() {
    const night = isNight(palette);
    hemisphere.intensity = night ? 1.9 : 0.75;
    sun.intensity = night ? 1.9 : 2.6;
    fill.intensity = night ? 0.7 : 0.3;
    renderer.toneMappingExposure = night ? 1.5 : 0.82;
    const fog = scene.fog as THREE.Fog;
    fog.near = night ? 46 : 62; fog.far = night ? 155 : 205;
    sunDiscMaterial.opacity = night ? 0.55 : 0.85;
  }
  applyDaylight();

  // ---- materials ----------------------------------------------------------
  // Real materials, not tinted defaults: painted shell, machined joints,
  // polished trim, rubber feet. The difference between them is what makes the
  // eye read a machine rather than a toy.
  const shellMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-shell"), roughness: 0.42, metalness: 0.1, envMapIntensity: 1 }));
  const panelMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-shell-shade"), roughness: 0.58, metalness: 0.2, envMapIntensity: 0.8 }));
  const jointMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-joint"), roughness: 0.34, metalness: 0.85, envMapIntensity: 1 }));
  const rubberMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-rubber"), roughness: 0.92, metalness: 0 }));
  const metalMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-metal"), roughness: 0.24, metalness: 1, envMapIntensity: 1.1 }));
  const deskMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-desk"), roughness: 0.5, metalness: 0.08, envMapIntensity: 0.7 }));
  const glassMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), roughness: 0.08, metalness: 0.3, envMapIntensity: 1.2 }));
  const brandMaterial = track(new THREE.MeshStandardMaterial({ color: colour("brand-600"), emissive: colour("brand-400"), emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.5 }));
  const contactMaterial = track(new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.75 }));

  /** Bakes a set of primitives into one mesh, because a station is not worth twenty draw calls. */
  const merge = (parts: readonly { geometry: THREE.BufferGeometry; position?: THREE.Vector3Tuple; rotation?: THREE.Vector3Tuple }[]) => {
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const clones = parts.map(part => {
      const clone = part.geometry.clone().toNonIndexed();
      matrix.compose(
        new THREE.Vector3(...(part.position ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(euler.set(...(part.rotation ?? [0, 0, 0]))),
        scale,
      );
      clone.applyMatrix4(matrix);
      return clone;
    });
    const result = mergeGeometries(clones, false) ?? clones[0].clone();
    for (const clone of clones) clone.dispose();
    return track(result);
  };

  const box = (width: number, height: number, depth: number, radius = 0.02) => new RoundedBoxGeometry(width, height, depth, budget.detail, radius);
  const capsule = (radius: number, length: number) => new THREE.CapsuleGeometry(radius, length, budget.detail + 1, 8 + budget.detail * 4);
  const tube = (top: number, bottom: number, height: number, sides = 12) => new THREE.CylinderGeometry(top, bottom, height, sides);

  // ---- shared geometry: eleven robots pay for one set ---------------------
  const parts = {
    // A robot: a painted shell over dark joints, 1.9 m to the tip of the antenna.
    torso: merge([
      { geometry: box(0.44, 0.44, 0.28, 0.1), position: [0, 1.28, 0] },
      { geometry: box(0.3, 0.16, 0.24, 0.06), position: [0, 1.02, 0] },
      { geometry: box(0.26, 0.28, 0.11, 0.04), position: [0, 1.3, -0.19] },
      { geometry: box(0.13, 0.1, 0.13, 0.03), position: [-0.24, 1.5, 0] },
      { geometry: box(0.13, 0.1, 0.13, 0.03), position: [0.24, 1.5, 0] },
    ]),
    chest: merge([
      { geometry: box(0.19, 0.09, 0.04, 0.015), position: [0, 1.33, 0.145] },
      { geometry: box(0.05, 0.05, 0.03, 0.01), position: [0, 1.18, 0.15] },
    ]),
    head: merge([
      { geometry: box(0.25, 0.23, 0.24, 0.075), position: [0, 0.09, 0] },
      { geometry: tube(0.055, 0.065, 0.09, 10), position: [0, -0.02, 0] },
      { geometry: tube(0.032, 0.032, 0.03, 8), position: [-0.132, 0.09, 0], rotation: [0, 0, Math.PI / 2] },
      { geometry: tube(0.032, 0.032, 0.03, 8), position: [0.132, 0.09, 0], rotation: [0, 0, Math.PI / 2] },
      { geometry: tube(0.008, 0.012, 0.13, 6), position: [0.06, 0.26, -0.04] },
    ]),
    visor: new THREE.PlaneGeometry(0.185, 0.07),
    beacon: new THREE.SphereGeometry(0.042, 12, 8),
    upperArm: merge([
      { geometry: new THREE.SphereGeometry(0.055, 10, 8) },
      { geometry: capsule(0.048, 0.2), position: [0, -0.15, 0] },
    ]),
    forearm: merge([
      { geometry: capsule(0.04, 0.17), position: [0, -0.12, 0] },
      { geometry: box(0.075, 0.1, 0.05, 0.02), position: [0, -0.27, 0.01] },
    ]),
    thigh: merge([
      { geometry: new THREE.SphereGeometry(0.075, 10, 8) },
      { geometry: capsule(0.072, 0.26), position: [0, -0.22, 0] },
    ]),
    shin: merge([
      { geometry: capsule(0.058, 0.26), position: [0, -0.21, 0] },
      { geometry: box(0.12, 0.055, 0.25, 0.02), position: [0, -0.44, 0.05] },
    ]),

    // A workstation, split by material so it costs two draw calls, not twelve.
    deskLight: merge([
      { geometry: box(1.5, 0.05, 0.72, 0.02), position: [0, 0.72, 0.8] },
      { geometry: box(0.44, 0.08, 0.42, 0.04), position: [0, 0.44, -0.62] },
      { geometry: box(0.42, 0.44, 0.07, 0.03), position: [0, 0.7, -0.82], rotation: [-0.12, 0, 0] },
    ]),
    deskDark: merge([
      { geometry: box(0.06, 0.68, 0.62, 0.02), position: [-0.68, 0.35, 0.8] },
      { geometry: box(0.06, 0.68, 0.62, 0.02), position: [0.68, 0.35, 0.8] },
      { geometry: box(1.3, 0.04, 0.1, 0.02), position: [0, 0.12, 0.8] },
      { geometry: tube(0.05, 0.09, 0.1, 10), position: [-0.3, 0.79, 1.02] },
      { geometry: box(0.06, 0.2, 0.05, 0.02), position: [-0.3, 0.9, 1.02] },
      { geometry: box(0.66, 0.4, 0.035, 0.015), position: [-0.3, 1.12, 1.0], rotation: [0.1, 0.5, 0] },
      { geometry: box(0.4, 0.018, 0.14, 0.008), position: [0.12, 0.757, 0.58], rotation: [0, -0.12, 0] },
      { geometry: box(0.5, 0.4, 0.5, 0.03), position: [-1.25, 0.2, -0.15], rotation: [0, 0.4, 0] },
      { geometry: tube(0.3, 0.32, 0.04, 14), position: [0, 0.04, -0.62] },
      { geometry: tube(0.035, 0.045, 0.36, 10), position: [0, 0.22, -0.62] },
    ]),
    screen: new THREE.PlaneGeometry(0.6, 0.35),
    holo: new THREE.PlaneGeometry(0.78, 0.4),
    mug: tube(0.037, 0.032, 0.09, 12),

    pad: tube(2.6, 2.72, 0.16, 40),
    padRing: new THREE.TorusGeometry(2.62, 0.055, 8, 56),
    dome: new THREE.SphereGeometry(1.35, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    column: new THREE.CylinderGeometry(0.34, 0.95, 4.4, 20, 1, true),
    pick: tube(1.25, 1.25, 2.6, 10),
    packet: new THREE.OctahedronGeometry(0.11, 0),
    contact: new THREE.PlaneGeometry(1.5, 1.5),
    crown: box(0.11, 0.11, 0.11, 0.02),
  };
  for (const geometry of Object.values(parts)) track(geometry);

  // ---- ground -------------------------------------------------------------
  const groundGeometry = track(new THREE.PlaneGeometry(320, 320, 96, 96));
  const groundPosition = groundGeometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < groundPosition.count; index += 1) {
    // The plane is still in its own XY space here: Y becomes -Z once rotated.
    groundPosition.setZ(index, duneHeight(groundPosition.getX(index), -groundPosition.getY(index)));
  }
  groundGeometry.computeVertexNormals();
  const groundMaterial = track(new THREE.MeshStandardMaterial({
    color: colour("world-sand"), roughness: 1, metalness: 0,
    // Ripples and grain. A flat colour on a 320 m plane reads as painted card.
    bumpMap: sandTexture, bumpScale: 0.6, envMapIntensity: 0.3,
  }));
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = budget.shadowMap > 0;
  scene.add(ground);

  // Two service tracks worn into the sand along the rings the stations sit on:
  // enough to say the campus is used, without paving the desert over.
  const trackMaterial = track(new THREE.MeshStandardMaterial({
    color: colour("world-sand-shade"), roughness: 1, metalness: 0, transparent: true, opacity: 0.32,
    envMapIntensity: 0.3, depthWrite: false,
  }));
  for (const radius of [ringRadius(1), ringRadius(2)]) {
    const road = new THREE.Mesh(track(new THREE.RingGeometry(radius - 0.7, radius + 0.7, 96)), trackMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.012;
    scene.add(road);
  }

  // ---- scenery ------------------------------------------------------------
  const rockMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-rock"), roughness: 0.95, metalness: 0.02, flatShading: true, envMapIntensity: 0.5 }));
  const rockGeometry = track(new THREE.IcosahedronGeometry(1, 1));
  {
    const shape = seeded(4242);
    const vertices = rockGeometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < vertices.count; index += 1) {
      const push = 0.62 + shape() * 0.55;
      vertices.setXYZ(index, vertices.getX(index) * push, vertices.getY(index) * push * 0.8, vertices.getZ(index) * push);
    }
    rockGeometry.computeVertexNormals();
  }
  const random = seeded(20260908);
  const scenery = new THREE.Group();
  const rockCount = budget.props ? 30 : 12;
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  rocks.castShadow = budget.shadowMap > 0;
  const placement = new THREE.Object3D();
  for (let index = 0; index < rockCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 30 + random() * 78;
    placement.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    placement.position.y = duneHeight(placement.position.x, placement.position.z) - 0.55;
    const bulk = 0.9 + random() * 1.8;
    placement.scale.set(bulk, bulk * (0.6 + random() * 0.7), bulk * (0.8 + random() * 0.5));
    placement.rotation.set(random(), random() * Math.PI, random());
    placement.updateMatrix();
    rocks.setMatrixAt(index, placement.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  scenery.add(rocks);

  if (budget.props) {
    // A desert outpost runs on its own power, and says so.
    const arrayGeometry = merge([
      { geometry: tube(0.13, 0.18, 1.9, 10), position: [0, 0.95, 0] },
      { geometry: box(3.4, 0.09, 1.9, 0.03), position: [0, 1.95, 0], rotation: [-0.72, 0, 0] },
      { geometry: box(0.12, 0.12, 1.9, 0.02), position: [0, 1.9, 0], rotation: [-0.72, 0, 0] },
    ]);
    const panelGeometry = merge([{ geometry: new THREE.PlaneGeometry(3.2, 1.7), position: [0, 2.02, 0.04], rotation: [-0.72 - Math.PI / 2, 0, 0] }]);
    const panelMaterialSolar = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), roughness: 0.12, metalness: 0.6, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 + 0.5;
      const array = new THREE.Group();
      array.position.set(Math.sin(angle) * 29, 0, Math.cos(angle) * 29);
      array.position.y = duneHeight(array.position.x, array.position.z);
      array.lookAt(sun.position.x, array.position.y, sun.position.z);
      const frame = new THREE.Mesh(arrayGeometry, jointMaterial);
      frame.castShadow = budget.shadowMap > 0;
      array.add(frame, new THREE.Mesh(panelGeometry, panelMaterialSolar));
      scenery.add(array);
    }

    // A comms mast, because an outpost that reports to nobody is a sculpture.
    const mast = new THREE.Group();
    mast.position.set(-19, 0, -11);
    mast.rotation.y = -1.05;
    const mastMesh = new THREE.Mesh(merge([
      { geometry: tube(0.1, 0.32, 8, 6), position: [0, 4, 0] },
      { geometry: tube(1.0, 1.0, 0.1, 18), position: [0, 7.6, 0.45], rotation: [-1.05, 0, 0] },
      { geometry: tube(0.04, 0.04, 0.5, 6), position: [0, 7.35, 0.15], rotation: [-1.05, 0, 0] },
    ]), jointMaterial);
    mastMesh.castShadow = budget.shadowMap > 0;
    const tip = new THREE.Mesh(parts.beacon, track(new THREE.MeshBasicMaterial({ color: colour("brand-400"), fog: false })));
    tip.position.y = 8.1;
    mast.add(mastMesh, tip);
    scenery.add(mast);
  }
  scene.add(scenery);

  // ---- headquarters -------------------------------------------------------
  const headquarters = new THREE.Group();
  const hqDeck = new THREE.Mesh(merge([
    { geometry: tube(4.6, 5.1, 0.5, 6), position: [0, 0.25, 0] },
    { geometry: tube(3.9, 4.2, 0.3, 6), position: [0, 0.62, 0] },
  ]), track(new THREE.MeshStandardMaterial({ color: colour("world-rock"), roughness: 0.9, metalness: 0.06, envMapIntensity: 0.25 })));
  hqDeck.receiveShadow = budget.shadowMap > 0;
  hqDeck.castShadow = budget.shadowMap > 0;
  const hqCore = new THREE.Mesh(merge([
    { geometry: tube(0.32, 0.46, 3.2, 6), position: [0, 2.3, 0] },
    { geometry: new THREE.TorusGeometry(0.95, 0.05, 8, 40), position: [0, 3.6, 0], rotation: [Math.PI / 2, 0, 0] },
  ]), brandMaterial);
  hqCore.position.z = -1.9;
  hqCore.castShadow = budget.shadowMap > 0;
  headquarters.add(hqDeck, hqCore);
  scene.add(headquarters);

  // ---- link paths ---------------------------------------------------------
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

  /** The readout the reader can actually see, because a monitor faces its robot. */
  const holoMaterialFor = (tint: THREE.Color) => track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { colour: { value: tint.clone() }, time: { value: 0 }, activity: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform vec3 colour; uniform float time; uniform float activity; varying vec2 vUv;",
      "void main(){",
      "  float column = floor(vUv.x * 9.0);",
      "  float height = 0.18 + 0.72 * activity * (0.5 + 0.5 * sin(time * 3.4 + column * 1.7));",
      "  float bar = step(vUv.y, height) * step(0.12, fract(vUv.x * 9.0));",
      "  float frame = step(0.97, vUv.y) + step(vUv.y, 0.03);",
      "  float scan = 0.06 * step(0.5, fract(vUv.y * 26.0 - time * 0.8));",
      "  float alpha = (bar * 1.0 + frame * 0.85 + scan) * (0.5 + activity * 0.5);",
      "  gl_FragColor = vec4(colour * (0.8 + bar * 0.8), alpha);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }));

  const rigs = new Map<string, Rig>();
  const links: Link[] = [];
  const holos: { material: THREE.ShaderMaterial; id: string }[] = [];
  const pickTargets: THREE.Mesh[] = [];
  const stationRoot = new THREE.Group();
  const linkRoot = new THREE.Group();
  scene.add(stationRoot, linkRoot);
  let labels: ReadonlyMap<string, HTMLElement> = new Map();
  let built = false;
  let ready = false;

  /** A light column that reads as light: bright at the pad, gone before the top. */
  const columnMaterialFor = () => track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { colour: { value: colour("brand-400") }, strength: { value: 0 } },
    vertexShader: [
      "varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;",
      "void main(){",
      "  vUv = uv;",
      "  vec4 world = modelViewMatrix * vec4(position, 1.0);",
      "  vNormal = normalize(normalMatrix * normal);",
      "  vView = normalize(-world.xyz);",
      "  gl_Position = projectionMatrix * world;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 colour; uniform float strength; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;",
      "void main(){",
      "  float fade = pow(1.0 - vUv.y, 3.0) * 0.9 + 0.04;",
      "  float body = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);",
      "  gl_FragColor = vec4(colour * fade * body * strength, 1.0);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  }));

  const limb = (upperGeometry: THREE.BufferGeometry, lowerGeometry: THREE.BufferGeometry, material: THREE.Material, jointDrop: number, side: number): Limb => {
    const upper = new THREE.Group();
    const upperMesh = new THREE.Mesh(upperGeometry, material);
    upperMesh.castShadow = budget.shadowMap > 0;
    const lower = new THREE.Group();
    lower.position.y = jointDrop;
    const lowerMesh = new THREE.Mesh(lowerGeometry, material);
    lowerMesh.castShadow = budget.shadowMap > 0;
    lowerMesh.scale.x = side;
    lower.add(lowerMesh);
    upper.add(upperMesh, lower);
    return { upper, lower };
  };

  function buildStation(agent: WorldAgent, place: WorldPlacement): Rig {
    const district = colour(districtToken(agent.domain));
    const isChief = place.depth === 0;
    const station = new THREE.Group();
    station.position.set(place.x, 0, place.z);
    // Facing out, not in. Facing the headquarters was the honest diagram of the
    // reporting line, and it pointed eleven robots away from a camera that
    // orbits the outside of the campus. The link paths carry the hierarchy.
    station.rotation.y = place.angle;

    const padMaterial = track(new THREE.MeshStandardMaterial({ color: colour("world-rock"), roughness: 0.94, metalness: 0.03, envMapIntensity: 0.2 }));
    const pad = new THREE.Mesh(parts.pad, padMaterial);
    pad.position.y = isChief ? 0.98 : 0.08;
    pad.receiveShadow = budget.shadowMap > 0;

    const padRing = track(new THREE.MeshStandardMaterial({ color: district, emissive: district, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5 }));
    const ring = new THREE.Mesh(parts.padRing, padRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = pad.position.y + 0.085;
    station.add(pad, ring);

    const floor = pad.position.y + 0.08;
    const furnished = new THREE.Group();
    furnished.position.y = floor;
    if (isChief) furnished.scale.setScalar(1.12);
    station.add(furnished);

    const deskLight = new THREE.Mesh(parts.deskLight, deskMaterial);
    deskLight.castShadow = budget.shadowMap > 0;
    const deskDark = new THREE.Mesh(parts.deskDark, jointMaterial);
    deskDark.castShadow = budget.shadowMap > 0;
    const screenMaterial = track(new THREE.MeshStandardMaterial({
      color: colour("world-glass"), emissive: district, emissiveIntensity: 0.5, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide,
    }));
    const screen = new THREE.Mesh(parts.screen, screenMaterial);
    screen.position.set(-0.3, 1.12, 0.98);
    screen.rotation.set(0.1, 0.5 + Math.PI, 0);
    const mug = new THREE.Mesh(parts.mug, metalMaterial);
    mug.position.set(0.52, 0.79, 0.62);
    // The monitor faces its robot, so the reader gets a holographic readout
    // angled their way instead of the back of a screen.
    const holoMaterial = holoMaterialFor(district);
    const holo = new THREE.Mesh(parts.holo, holoMaterial);
    holo.position.set(0.46, 1.18, 0.6);
    holo.rotation.set(-0.16, -0.55, 0);
    holos.push({ material: holoMaterial, id: agent.id });
    furnished.add(deskLight, deskDark, screen, mug, holo);

    const deskShadow = new THREE.Mesh(parts.contact, contactMaterial);
    deskShadow.rotation.x = -Math.PI / 2;
    deskShadow.position.set(0, 0.012, 0.8);
    deskShadow.scale.set(1.5, 1.1, 1);
    furnished.add(deskShadow);

    // ---- the robot --------------------------------------------------------
    const robot = new THREE.Group();
    const torso = new THREE.Group();
    const torsoMesh = new THREE.Mesh(parts.torso, shellMaterial);
    torsoMesh.castShadow = budget.shadowMap > 0;
    const accent = track(new THREE.MeshStandardMaterial({ color: district, emissive: district, emissiveIntensity: 1, roughness: 0.3, metalness: 0.3 }));
    const chest = new THREE.Mesh(parts.chest, accent);

    const head = new THREE.Group();
    head.position.y = 1.62;
    const headMesh = new THREE.Mesh(parts.head, shellMaterial);
    headMesh.castShadow = budget.shadowMap > 0;
    const visor = track(new THREE.MeshStandardMaterial({ color: colour("world-glass"), emissive: colour("good"), emissiveIntensity: 1.6, roughness: 0.06, metalness: 0.2 }));
    const visorMesh = new THREE.Mesh(parts.visor, visor);
    visorMesh.position.set(0, 0.095, 0.121);
    const visorGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTexture, color: colour("good"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false })));
    visorGlow.position.set(0, 0.095, 0.14);
    visorGlow.scale.setScalar(0.4);
    const beaconMaterial = track(new THREE.MeshBasicMaterial({ color: colour("warn"), transparent: true, opacity: 0.9, fog: false }));
    const beacon = new THREE.Mesh(parts.beacon, beaconMaterial);
    beacon.position.set(0.06, 0.36, -0.04);
    beacon.visible = false;
    head.add(headMesh, visorMesh, visorGlow, beacon);

    const arms = [limb(parts.upperArm, parts.forearm, panelMaterial, -0.3, -1), limb(parts.upperArm, parts.forearm, panelMaterial, -0.3, 1)] as const;
    arms[0].upper.position.set(-0.245, 1.5, 0);
    arms[1].upper.position.set(0.245, 1.5, 0);
    const legs = [limb(parts.thigh, parts.shin, jointMaterial, -0.45, -1), limb(parts.thigh, parts.shin, jointMaterial, -0.45, 1)] as const;
    legs[0].upper.position.set(-0.115, 0.95, 0);
    legs[1].upper.position.set(0.115, 0.95, 0);

    torso.add(torsoMesh, chest, head, arms[0].upper, arms[1].upper);
    robot.add(torso, legs[0].upper, legs[1].upper);

    const robotShadow = new THREE.Mesh(parts.contact, contactMaterial);
    robotShadow.rotation.x = -Math.PI / 2;
    robotShadow.position.y = 0.014;
    robotShadow.scale.setScalar(0.62);
    robot.add(robotShadow);

    if (isChief) {
      // The orchestrator wears its authority: three governance cubes in orbit.
      const crown = new THREE.Group();
      crown.name = "crown";
      crown.position.y = 2.05;
      for (let index = 0; index < 3; index += 1) {
        const cube = new THREE.Mesh(parts.crown, brandMaterial);
        const angle = (index / 3) * Math.PI * 2;
        cube.position.set(Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4);
        crown.add(cube);
      }
      robot.add(crown);
    }
    furnished.add(robot);

    const domeMaterial = track(new THREE.MeshBasicMaterial({ color: colour("risk"), wireframe: true, transparent: true, opacity: 0.42, fog: false }));
    const dome = new THREE.Mesh(parts.dome, domeMaterial);
    dome.position.y = floor;
    dome.visible = false;

    const columnMaterial = columnMaterialFor();
    const column = new THREE.Mesh(parts.column, columnMaterial);
    column.position.y = floor + 2.2;

    const pickMaterial = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    const pick = new THREE.Mesh(parts.pick, pickMaterial);
    pick.position.y = floor + 1.3;
    pick.userData.agentId = agent.id;
    pick.renderOrder = -1;

    const anchor = new THREE.Object3D();
    anchor.position.set(0, floor + LABEL_HEIGHT * (isChief ? 1.12 : 1), 0);

    station.add(dome, column, pick, anchor);
    stationRoot.add(station);
    pickTargets.push(pick);

    return {
      agent, station, robot, torso, head, arms, legs, beacon, dome, column, visorGlow, anchor, pick,
      accent, visor, screen: screenMaterial, padRing, beaconMaterial, domeMaterial, columnMaterial,
      phase: (place.angle + place.depth) * 1.7, visual: stateVisual(agent.state), pose: { ...poseFor(agent.state) },
      blinkAt: 2 + place.angle, selected: false,
    };
  }

  function buildLinks(agents: readonly WorldAgent[], placements: Map<string, WorldPlacement>) {
    for (const agent of agents) {
      if (!agent.parent) continue;
      const from = placements.get(agent.parent);
      const to = placements.get(agent.id);
      if (!from || !to) continue;
      const start = new THREE.Vector3(from.x, 1.2, from.z);
      const end = new THREE.Vector3(to.x, 0.4, to.z);
      const middle = start.clone().add(end).multiplyScalar(0.5);
      middle.y = 2.2;
      // Bow the path outward so two links never overlap into one bright smear.
      middle.x *= 1.14; middle.z *= 1.14;
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      const material = linkMaterialFor("good");
      const mesh = new THREE.Mesh(track(new THREE.TubeGeometry(curve, budget.tubeSegments, 0.045, 6, false)), material);
      linkRoot.add(mesh);
      const packets: THREE.Mesh[] = [];
      for (let index = 0; index < (budget.props ? 3 : 1); index += 1) {
        const packet = new THREE.Mesh(parts.packet, track(new THREE.MeshBasicMaterial({ color: colour("good"), fog: false })));
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
    dustPositions[index * 3] = (random() - 0.5) * 130;
    dustPositions[index * 3 + 1] = random() * 12;
    dustPositions[index * 3 + 2] = (random() - 0.5) * 130;
    dustSpeeds[index] = 1.2 + random() * 3;
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = track(new THREE.PointsMaterial({
    color: colour("world-haze"), size: 0.1, sizeAttenuation: true, transparent: true, opacity: 0.45, depthWrite: false, map: glowTexture,
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

  const desiredTarget = new THREE.Vector3(0, 1.6, 0);
  const focus = (id: string | null) => {
    const rig = id ? rigs.get(id) : undefined;
    if (!rig) { desiredTarget.set(0, 1.6, 0); return; }
    desiredTarget.set(rig.station.position.x, 1.5, rig.station.position.z);
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
      const scale = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(distance, 10, 60, 1, 0.62), 0.58, 1.06);
      element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      element.style.opacity = behind ? "0" : String(THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(distance, 14, 70, 1, 0.25), 0.25, 1));
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
  let running = false;
  let renderRequested = false;
  const startedAt = performance.now();
  const clock = new THREE.Clock();
  const ease = (current: number, goal: number, delta: number, rate = 6) => current + (goal - current) * (1 - Math.exp(-rate * delta));

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
    if (degraded >= 3 || reducedMotion || performance.now() - startedAt < 2500) return;
    slowFor = frameSeconds > 1 / 24 ? slowFor + frameSeconds : 0;
    if (slowFor < 2.5) return;
    slowFor = 0;
    degraded += 1;
    if (degraded === 1) {
      renderer.setPixelRatio(1);
      dust.visible = false;
    } else {
      const refresh = () => scene.traverse(object => {
        const material = (object as THREE.Mesh).material;
        if (!material) return;
        for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true;
      });
      if (degraded === 2) { renderer.shadowMap.enabled = false; refresh(); }
      else { scene.environment = null; groundMaterial.bumpMap = null; refresh(); }
    }
    options.onDegrade?.(degraded);
  }

  function animateRig(rig: Rig, delta: number) {
    const visual = rig.visual;
    const goal = poseFor(rig.agent.state);
    // Every joint is eased toward the target pose, so a state change is a
    // movement the reader can follow rather than a new frame of a flipbook.
    const rate = 3.4;
    rig.pose.hip = ease(rig.pose.hip, goal.hip, delta, rate);
    rig.pose.knee = ease(rig.pose.knee, goal.knee, delta, rate);
    rig.pose.lean = ease(rig.pose.lean, goal.lean, delta, rate);
    rig.pose.headPitch = ease(rig.pose.headPitch, goal.headPitch, delta, rate);
    rig.pose.sink = ease(rig.pose.sink, goal.sink, delta, rate);
    rig.pose.shoulder = ease(rig.pose.shoulder, goal.shoulder, delta, rate);
    rig.pose.elbow = ease(rig.pose.elbow, goal.elbow, delta, rate);
    rig.pose.shoulderOut = ease(rig.pose.shoulderOut, goal.shoulderOut, delta, rate);

    const beat = elapsed * 1.1 + rig.phase;
    const alive = 1 - visual.droop * 0.85;
    // Breathing and a slow weight shift. Perfect stillness is what makes a
    // rigged model look like a prop.
    const breath = Math.sin(beat * 1.7) * 0.008 * alive;
    const shift = Math.sin(beat * 0.6) * alive;

    rig.robot.position.y = -rig.pose.sink + breath;
    rig.robot.position.x = visual.flash ? Math.sin(elapsed * 32) * 0.018 : 0;
    rig.robot.rotation.z = shift * 0.014;
    rig.robot.rotation.y = shift * 0.03;

    rig.torso.rotation.x = rig.pose.lean + breath * 0.4;
    rig.torso.rotation.z = -shift * 0.02;

    rig.legs.forEach((leg, index) => {
      const side = index === 0 ? -1 : 1;
      leg.upper.rotation.x = rig.pose.hip + shift * 0.02 * side;
      leg.upper.rotation.z = side * -0.015;
      leg.lower.rotation.x = -rig.pose.knee;
    });

    // Typing is two hands taking turns, with the elbows doing the work.
    const tap = visual.activity * 0.22;
    rig.arms.forEach((arm, index) => {
      const outward = index === 0 ? 1 : -1;
      const phase = index === 0 ? 0 : Math.PI;
      const raised = visual.raised && index === 1;
      arm.upper.rotation.x = raised ? -0.2 : rig.pose.shoulder + Math.sin(elapsed * 7 + phase) * tap * 0.35;
      arm.upper.rotation.z = raised
        ? 2.5 + Math.sin(elapsed * 2.6) * 0.16
        : outward * rig.pose.shoulderOut + shift * 0.01;
      arm.lower.rotation.x = raised ? -0.5 : rig.pose.elbow - Math.sin(elapsed * 7 + phase) * tap;
    });

    // The head tracks the camera so a face is turned toward the reader however
    // the campus is rotated, and glances up from the desk now and then.
    const toCamera = Math.atan2(camera.position.x - rig.station.position.x, camera.position.z - rig.station.position.z) - rig.station.rotation.y;
    const wrapped = Math.atan2(Math.sin(toCamera), Math.cos(toCamera));
    const glance = visual.activity > 0.5 ? Math.max(0, Math.sin(elapsed * 0.42 + rig.phase)) : 1;
    rig.head.rotation.y = ease(rig.head.rotation.y, THREE.MathUtils.clamp(wrapped, -1.15, 1.15) * 0.8 * glance, delta, 2.2);
    rig.head.rotation.x = ease(rig.head.rotation.x, rig.pose.headPitch * (1 - glance * 0.55) - rig.pose.lean * 0.35, delta, 2.6);
    rig.head.rotation.z = shift * 0.02;

    // A blink: the eye line drops for a moment, on its own rhythm per robot.
    const cycle = 3.6 + (rig.phase % 2.4);
    const blink = visual.droop > 0.5 ? 1 : elapsed % cycle < 0.11 ? 0.1 : 1;
    rig.visor.emissiveIntensity = (visual.droop > 0.5 ? 0.22 : 1.25 + visual.activity * 0.85) * blink;
    (rig.visorGlow.material as THREE.SpriteMaterial).opacity = (0.18 + visual.activity * 0.32) * blink;
    rig.accent.emissiveIntensity = 0.35 + visual.activity * 1.2;
    rig.screen.emissiveIntensity = 0.2 + visual.activity * (0.95 + Math.sin(elapsed * 12 + rig.phase) * 0.3);
    rig.padRing.emissiveIntensity = 0.22 + (rig.selected ? 0.8 : 0) + visual.activity * 0.35
      + (visual.beacon ? (Math.sin(elapsed * (visual.flash || 1.6) * Math.PI) * 0.5 + 0.5) * 0.8 : 0);

    rig.beacon.visible = visual.beacon;
    if (visual.beacon) {
      rig.beacon.position.x = 0.06 + Math.sin(elapsed * 4) * 0.05;
      rig.beacon.position.z = -0.04 + Math.cos(elapsed * 4) * 0.05;
      rig.beaconMaterial.opacity = visual.flash ? (Math.sin(elapsed * visual.flash * Math.PI * 2) > 0 ? 0.95 : 0.12) : 0.9;
    }
    rig.dome.visible = visual.dome;
    if (visual.dome) rig.dome.rotation.y = elapsed * 0.3;

    const beam = rig.columnMaterial.uniforms.strength;
    beam.value = ease(beam.value as number, rig.selected ? 0.34 + Math.sin(elapsed * 2.4) * 0.07 : 0, delta, 5);
    rig.column.visible = (beam.value as number) > 0.01;

    const crown = rig.robot.getObjectByName("crown");
    if (crown) { crown.rotation.y = elapsed * 0.5; crown.position.y = 2.05 + Math.sin(elapsed * 1.4) * 0.04; }
  }

  function updateScene(delta: number) {
    controls.update();
    controls.target.lerp(desiredTarget, 1 - Math.exp(-3 * delta));
    for (const rig of rigs.values()) animateRig(rig, delta);

    for (const holo of holos) {
      const rig = rigs.get(holo.id);
      holo.material.uniforms.time.value = elapsed;
      holo.material.uniforms.activity.value = rig ? rig.visual.activity : 0;
    }

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
        link.curve.getPoint(1 - ((elapsed * 0.45 + index / link.packets.length) % 1), packet.position);
        packet.rotation.set(elapsed * 2, elapsed * 3, 0);
      });
    }

    hqCore.rotation.y = elapsed * 0.15;

    if (dust.visible) {
      const positions = dustGeometry.attributes.position as THREE.BufferAttribute;
      const gust = 1 + Math.sin(elapsed * 0.23) * 0.55;
      for (let index = 0; index < budget.dust; index += 1) {
        let x = positions.getX(index) + dustSpeeds[index] * delta * gust;
        if (x > 65) x -= 130;
        positions.setX(index, x);
      }
      positions.needsUpdate = true;
    }
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

    updateScene(delta);
    renderer.render(scene, camera);
    frames += 1;
    placeLabels(width, height);
    if (!ready) { ready = true; options.onReady?.(); }
  }

  function renderStill() {
    renderRequested = false;
    sun.shadow.needsUpdate = true;
    controls.target.copy(desiredTarget);
    updateScene(0.6);
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
      frames,
      quality: options.quality,
      agents: rigs.size,
      degraded,
    }),

    sync(agents, selectedId) {
      if (!built && agents.length) {
        const placements = worldLayout(agents);
        for (const agent of agents) {
          const place = placements.get(agent.id);
          if (place) rigs.set(agent.id, buildStation(agent, place));
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
        (rig.visorGlow.material as THREE.SpriteMaterial).color.copy(tone);
        rig.beaconMaterial.color.copy(tone);
        const link = links.find(candidate => candidate.childId === agent.id);
        if (link) {
          link.material.uniforms.colour.value = tone;
          for (const packet of link.packets) (packet.material as THREE.MeshBasicMaterial).color.copy(tone);
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
      fill.color.copy(colour("world-sky-top"));
      sunDiscMaterial.color.copy(colour("world-sun"));
      skyMaterial.uniforms.top.value = colour("world-sky-top");
      skyMaterial.uniforms.bottom.value = colour("world-sky-bottom");
      skyMaterial.uniforms.sun.value = colour("world-sun");
      (scene.fog as THREE.Fog).color.copy(colour("world-haze"));
      groundMaterial.color.copy(colour("world-sand"));
      trackMaterial.color.copy(colour("world-sand-shade"));
      rockMaterial.color.copy(colour("world-rock"));
      shellMaterial.color.copy(colour("world-shell"));
      panelMaterial.color.copy(colour("world-shell-shade"));
      jointMaterial.color.copy(colour("world-joint"));
      rubberMaterial.color.copy(colour("world-rubber"));
      metalMaterial.color.copy(colour("world-metal"));
      deskMaterial.color.copy(colour("world-desk"));
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
      for (const holo of holos) {
        const rig = rigs.get(holo.id);
        if (rig) holo.material.uniforms.colour.value = colour(districtToken(rig.agent.domain));
      }
      applyDaylight();
      // The sky is the light source for every reflection, so it is rebaked.
      buildEnvironment();
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
      desiredTarget.set(0, 1.6, 0);
      controls.target.set(0, 1.6, 0);
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
      environment?.dispose();
      pmrem.dispose();
      for (const resource of disposables) resource.dispose();
      disposables.length = 0;
      rigs.clear();
      links.length = 0;
      holos.length = 0;
      pickTargets.length = 0;
      renderer.dispose();
    },
  };
}

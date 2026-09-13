# The 3D Agent World

`src/agent-command.tsx` used to draw the eleven governed agents as absolutely
positioned buttons over an SVG line chart. It was accurate and unreadable: a
state change was a four-pixel dot swapping colour, and nobody could tell at a
glance which part of the company was actually busy.

The same eleven agents now also render as a low-poly desert outpost. Each agent
is a robot at its own workstation, and every operational state the gateway
reports is a visible behaviour rather than a legend entry.

## What is on screen

- **The campus.** The CEO/Orchestrator stands on a raised hexagonal platform at
  the centre. Its six direct reports form an inner ring, and the four
  specialists sit on an outer ring beside the parent they report to. Layout is
  derived from `agentTopology`, so adding an agent moves nobody by hand.
- **Districts.** Each workstation pad is tinted by the agent's operating
  domain — executive, delivery, growth, revenue, governance, knowledge — so the
  six domains read as six neighbourhoods.
- **Links.** A parent and child are joined by a glowing path across the sand.
  While a child is working, data packets travel the path toward the CEO.
- **The desert.** Flat-shaded dunes, scattered rock, solar arrays and drifting
  sand. The theme toggle moves the outpost from midday to moonlight.

## How an agent behaves

`operationalState()` in `src/agents.ts` stays the single source of truth. The
world only chooses how each state looks:

| State | Robot behaviour |
| --- | --- |
| `ready` | Idle hover, slow head scan, monitor dim |
| `working` | Leans into the desk, arms typing, bright screen, packets flow to the CEO, dust kicks up |
| `approval` | Raises an arm under a rotating amber beacon; the pad pulses |
| `paused` | Sinks, head down, thrusters and eyes dimmed |
| `blocked` | A red containment dome closes over it, arms crossed |
| `error` | Shakes under a flashing red beacon |

Pending runs appear as a badge on the agent's nameplate, and the selected agent
gets a light column plus a camera ease-in.

## Engineering constraints this respects

- **The map is a control surface, not a toy.** Selecting a robot selects the
  same agent in the existing inspector; every run, tool, approval and pause
  control is untouched.
- **Nothing is a colour literal.** The renderer reads `--world-*` tokens from
  `src/tokens.css` through `readWorldPalette()`, so the world flips with the
  theme and `tokens.test.ts` still owns every colour in the product.
- **Three.js never reaches the first paint.** `agent-command.tsx` mounts the
  world through `React.lazy`, so the renderer and its dependency load as a
  separate chunk only when an administrator opens the dashboard.
- **A 3D view is not a requirement.** The classic 2D map is still there behind a
  toggle, and it is selected automatically when WebGL is unavailable or the
  reader asks for reduced motion. The choice persists in `localStorage`.
- **The frame loop stops when nobody is looking.** Rendering pauses when the
  tab is hidden or the stage scrolls out of view, the device pixel ratio is
  capped, quality is chosen from the device, and every geometry, material and
  texture is disposed on unmount.
- **Keyboard and screen readers get the real thing.** The canvas is
  `aria-hidden`; each robot carries a focusable HTML nameplate positioned by
  projecting its world coordinate every frame, so the world is operable without
  a pointer. Focus moves the camera, so a keyboard reader is never inspecting a
  robot standing behind them.
- **The device hints are a guess, so the world checks them.** Quality is chosen
  from cores, memory and screen size, but if measured frame time stays below
  24 fps for two and a half seconds the world steps its own detail down — pixel
  ratio and drifting sand first, then shadows. It never steps back up, because
  oscillating between two qualities is worse than staying at the lower one.

## What makes it read as real

- **Metres, not units.** A robot is 1.85 m, a desk 0.74 m, a workstation pad 5.2 m
  across. Real proportions do more for a procedural scene than any amount of
  detail.
- **Image-based lighting.** A sky-derived environment map is baked with
  `PMREMGenerator` and rebaked when the theme flips. Without it, every metal
  surface is a flat grey shape; with it, the robots pick up the sand and the sky.
- **Materials that differ.** Matte painted shell over machined joints at high
  metalness, with polished trim, rubber and glass — not one tinted default.
- **Grain.** The sand texture is drawn in a canvas at load: wind ripples plus
  speckle, driving the ground's relief. Boulders are deformed icosahedra sunk
  into the dunes, and two worn tracks follow the rings.
- **Motion with weight.** Every joint eases toward a named pose, so a state
  change is a movement. Breathing, a slow weight shift, blinking, hands taking
  turns at the keyboard, and a head that tracks the camera and glances up from
  the desk while working sit on top of it.

## Two decisions that only rendering could settle

Both of these looked right in code and were wrong on screen.

**Robots face outward, not inward.** Facing the headquarters is the honest
diagram of the reporting line, and it pointed eleven robot backs at a camera
that orbits the *outside* of the campus. The link paths carry the hierarchy
instead, and the reader gets faces. Heads also track the camera within the range
a neck plausibly turns.

**Detail is not where the cost is.** The rebuilt scene first ran at 1.3 fps
under software rendering. Halving the rounded-corner tessellation and removing
the bump map from the thirteen surfaces that did not need it tripled the frame
rate and changed nothing visible. Baking each workstation's furniture into two
draw calls meant the far more detailed world costs *fewer* draw calls than the
simple one it replaced.

**The shadow pass is the expensive part, and not for the reason expected.**
Removing shadows entirely raised the frame rate 62% under software rendering,
but never regenerating the shadow map changed nothing, and a cheaper filter
changed nothing either: the cost is in *sampling* the shadow across the ground,
not in producing the depth map. So the `low` tier drops shadows outright, and
the 4 Hz depth refresh stays as work correctly avoided rather than as the fix it
is not.

## Measuring it

`npm run bench:world` drives `tests/harness/world.html` and reports frame rate,
first frame, draw calls, triangles, heap, whether the loop really stopped off
screen, and whether the renderer was released on unmount.
`tests/e2e/agent-world.spec.ts` asserts the parts of that which are the same on
every machine. Frame rate is not one of them — CI has no GPU — so it is measured
and recorded, never asserted.

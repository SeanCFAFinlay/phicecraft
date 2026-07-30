# Phase 3 — GPU Coach-Board Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A WebGL renderer for the flat coach-board editor behind a runtime toggle, reached through a clean renderer abstraction, with the Canvas 2D path retained as the default until visual and performance parity are demonstrated — plus the two infrastructure fixes the port depends on (app-owned paint counters; ghost-trail allocation).

**Architecture:** The entire renderer surface is already two pure functions — `drawStaticLayer(ctx, StaticLayerInput)` and `drawDynamicLayer(ctx, DynamicLayerInput)` (src/components/canvas/renderStatic.ts, renderDynamic.ts). Task 1 formalizes that as a `BoardRenderer` interface with the Canvas implementation as a thin adapter, chosen in `useCanvasLayers`. The GPU implementation uses **PixiJS v8** (lazy-loaded chunk; budget baseline raised deliberately — see Global Constraints for the arithmetic), rendering the same two-layer structure into the same two canvas elements. Tabletop (tilt > TABLETOP_MIN_TILT) stays on Canvas 2D in this phase: the flat and tabletop draw paths are already disjoint call sets behind one boolean, so the GPU renderer covers flat view and the surface transparently falls back for tabletop. Default renderer stays Canvas until the final task's parity gate; GPU is opt-in via a persisted setting + URL override, with automatic fallback when `webgl2` context creation fails.

**Tech Stack:** PixiJS v8 (`pixi.js`, tree-shaken imports), existing Vitest/Playwright suites, `@pixi/…` NOT used individually (v8 unified package).

## Global Constraints

- **Bundle budget:** `scripts/check-budgets.mjs` sums RAW bytes of every chunk (lazy included) against `budget-baseline.json` (`jsBytes: 534528`) × 1.15 = 614,707. Current build ≈ 570,800 (headroom ≈ 43.9KB). PixiJS adds ~300-400KB raw — **the baseline MUST be raised in the same commit that adds the dependency**, with a dated note in `budget-baseline.json` explaining the deliberate raise (the file's own precedent: the template-catalogue note). Record the exact new `jsBytes` from a real build; keep the 1.15 ratio.
- **Perf-spec contract (parity gates the GPU path must satisfy):** route drag 60 samples → react < 60, staticPaints === 0 during drag, ≤ 2 after commit; player drag → react < 20; playback → react ≤ 130, staticPaints ≤ 1, dynamicPaints/rafTicks > 0.6; pan → staticPaints > 0; DPR cap ≤ 2. After Task 2 these read app-owned counters, not `clearRect` wraps.
- **Canvas element contract:** exactly two canvases in the container, index 0 static / index 1 dynamic; all pointer handlers stay on the dynamic canvas; wheel stays natively bound `{ passive: false }`.
- **`useCanvasLayers` returns a `useMemo`'d object whose identity is load-bearing** (subscription stability). Any renderer instance added to it must not break the memo (hold the renderer in a ref).
- **Draws are synchronous inside the rAF callback** (PlaybackController → store.seek → frameListeners → draw). The GPU renderer must render synchronously in the listener (Pixi: `renderer.render(stage)` direct call — do NOT use Pixi's own ticker/Application loop).
- **Hit testing is geometric and must not change.** The only coupling: visuals must keep reading positions from the same `PlaybackFrame` the hit-tester reads (`playback.positionFor`).
- **Not exported today, must be exported by the task that needs them:** `ArenaView` (RinkRenderer.ts:693), `PlayerRenderOptions` (PlayerRenderer.ts:14), `DetailedSkaterOptions` (SkaterRenderer.ts:9).
- **Out of scope, explicitly:** `src/features/library/thumbnailRenderer.ts` (independent Canvas user, untouched); the tabletop pseudo-3D path (Canvas-only this phase); replacing the sprite atlas art (Phase 4); any simulation/domain change.
- **Visual parity gate:** pixel-exact GPU-vs-Canvas equality is not realistic (baselines are per-machine already). The GPU path gets its OWN baseline set under a separate Playwright project name; the parity bar is (a) all functional e2e green on the GPU renderer, (b) GPU visual baselines committed and stable across two consecutive runs, (c) a structured side-by-side review artifact for the human (screenshot pairs).
- `npm run lint` zero warnings incl. new files; `npm run typecheck` clean; full unit suite green at every task; sw.js precache picks up new lazy chunks automatically via the build manifest (verify once in Task 3).
- The `quality: RenderQuality` tier from useCanvasLayers ('high'|'medium'|'low', currently DPR-only) becomes a real input to the GPU renderer (Task 6): low sheds shadow/glow effects, matching the audit's quality-tier requirement.

---

### Task 1: `BoardRenderer` abstraction with the Canvas adapter (no behavior change)

**Files:**
- Create: `src/render/BoardRenderer.ts` (interface + types), `src/render/canvas2d/Canvas2DRenderer.ts` (adapter)
- Modify: `src/components/canvas/CanvasSurface.tsx` (consume the interface), `src/components/canvas/useCanvasLayers.ts` (own the renderer instance in a ref)
- Test: `src/render/canvas2d/Canvas2DRenderer.test.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
// src/render/BoardRenderer.ts
import type { StaticLayerInput } from '@/components/canvas/renderStatic';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';

export interface BoardRenderer {
  /** Draw the rink layer. Implementations self-skip when nothing changed (staticLayerKey). */
  drawStatic(input: StaticLayerInput): void;
  /** Draw the game layer. Called synchronously up to 60×/s. */
  drawDynamic(input: DynamicLayerInput): void;
  /** Resize backing stores. Called from the ResizeObserver/DPR effect. */
  resize(width: number, height: number, dpr: number): void;
  /** Release GPU/2D resources. */
  dispose(): void;
  readonly kind: 'canvas2d' | 'webgl';
}

export interface RendererHost {
  staticCanvas: HTMLCanvasElement;
  dynamicCanvas: HTMLCanvasElement;
  onPaint: (layer: 'static' | 'dynamic') => void;   // feeds the Task-2 counters
}

export type RendererFactory = (host: RendererHost) => BoardRenderer;
```

`Canvas2DRenderer` wraps the existing pure functions verbatim: `drawStatic` = staticLayerKey guard + `drawStaticLayer(ctx, input)` + `host.onPaint('static')`; `drawDynamic` = `drawDynamicLayer(ctx, input)` + `host.onPaint('dynamic')`; `resize` = the exact backing-store writes currently in useCanvasLayers lines 70-79; `dispose` = no-op. The staticLayerKey guard MOVES from CanvasSurface (`lastStaticKey` ref, lines 136-138) into the adapter so every implementation owns its own skip logic.

- [ ] **Step 1: Write the failing adapter test** — `Canvas2DRenderer.test.ts` (jsdom via `.dom.test.ts` naming per vite.config `environmentMatchGlobs`, canvas ctx stubbed as in `src/test/setup.ts` — note setup stubs `getContext` to return null, so this test builds a minimal ctx mock and injects real canvases): construct with two mock canvases whose `getContext('2d')` returns a recording stub; assert `drawStatic` calls through and fires `onPaint('static')` once, a second identical call is skipped (key guard), a camera change repaints; `drawDynamic` always paints; `resize` writes width/height×dpr and style sizes on both canvases.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/render/`
- [ ] **Step 3: Implement** `BoardRenderer.ts` + `Canvas2DRenderer.ts`; rewire `CanvasSurface.tsx`: `drawStatic`/`drawDynamic` callbacks become `renderer.drawStatic(buildStaticInput())` / `renderer.drawDynamic(buildDynamicInput())` — the input-building code (currently inline at lines ~95-125) stays in CanvasSurface unchanged; `useCanvasLayers` holds `rendererRef` and calls `renderer.resize(...)` from the existing size/DPR effect (memo identity preserved — renderer lives in a ref, not in the memo deps).
- [ ] **Step 4: Full verification** — `npx vitest run src/` green (App tests exercise the surface); `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** — `refactor: BoardRenderer abstraction; Canvas 2D becomes the first implementation`

---

### Task 2: App-owned paint counters and the perf-spec migration

**Files:**
- Create: `src/render/paintCounters.ts`
- Modify: `src/components/canvas/useCanvasLayers.ts` or `CanvasSurface.tsx` (wire `onPaint`), `e2e/perf.spec.ts` (read app counters instead of wrapping clearRect)
- Test: unit for the counter module; the perf project run is the integration proof

**Interfaces:**
- Produces: `window.__phicecraftPaint = { staticPaints: number, dynamicPaints: number, reset(): void }`, installed always (it is 20 lines, not worth gating to test builds; document why in the module header). `RendererHost.onPaint` increments it.

Why: the e2e instrumentation monkey-patches `clearRect` per canvas index — it breaks silently (counters read 0) the moment a canvas becomes `webgl2`, and it hard-codes canvas order. App-owned counters are renderer-agnostic and remove the index-0 assumption.

- [ ] **Step 1: Failing unit test** — counters increment via onPaint, reset works, double-install is idempotent.
- [ ] **Step 2: Implement + wire** — `onPaint` passed into the renderer host at construction.
- [ ] **Step 3: Migrate `e2e/perf.spec.ts`** — `instrument()` keeps the React MutationObserver but reads `staticPaints`/`dynamicPaints` from `window.__phicecraftPaint`; `resetCounters` calls its `reset()`. Assertions unchanged (same thresholds — this is a measurement-mechanism swap, not a contract change).
- [ ] **Step 4: Run** `npx playwright test --project=perf` — green with identical thresholds.
- [ ] **Step 5: Commit** — `test: app-owned paint counters replace the clearRect instrumentation`

---

### Task 3: Ghost-trail ring buffer read path (independent perf win)

**Files:**
- Modify: `src/playback/playbackFrame.ts` (`GhostTrailBuffer`), `src/components/canvas/CanvasSurface.tsx`, `src/components/canvas/renderDynamic.ts`
- Test: extend `src/playback/` tests

**Interfaces:**
- Produces: `GhostTrailBuffer.forEach(cb: (playerId: ID, points: readonly Point[]) => void): void` — allocation-free iteration reusing one scratch array per call (documented single-frame validity). `DynamicLayerInput.ghostTrails` type changes from `[ID, Point[]][]` to `{ forEach(cb): void }` (the buffer itself or an empty singleton).

Why: today every playback frame calls `entries()` (N fresh arrays) plus `new Map(...)` in renderDynamic — 60×/s of garbage for data the ring buffer already holds. A GPU renderer wants stable buffers; Canvas benefits immediately.

- [ ] **Step 1: Failing tests** — buffer test: `forEach` yields same points as `read()` per player, oldest-first, and reuses its scratch (assert no per-call array identity churn via a call-count spy on an injected factory or by asserting the SAME array reference is passed to consecutive callbacks — document the single-frame-validity contract in the assertion).
- [ ] **Step 2: Implement**; renderDynamic's `drawGhostTrails` signature adapts (it currently takes `Map<ID, Point[]>` — change to accept the forEach-able and iterate directly); CanvasSurface passes `playback.trails` when playing, `EMPTY_TRAILS` singleton otherwise.
- [ ] **Step 3: Full unit suite + one manual playback e2e project run** (`npx playwright test --project=flows`) to confirm trails still render (the visual suite covers appearance later).
- [ ] **Step 4: Commit** — `perf: ghost trails render without per-frame allocation`

---

### Task 4: PixiJS dependency, lazy renderer chunk, budget raise, renderer selection

**Files:**
- Create: `src/render/webgl/WebGLRenderer.ts` (skeleton: constructs a Pixi renderer per canvas, clears to transparent, delegates NOTHING yet — falls back internally to Canvas2D functions for all drawing via a temporary pass-through so the toggle is safe from day one), `src/render/selectRenderer.ts`
- Modify: `package.json` (add `pixi.js` ^8), `scripts/budget-baseline.json` (raise with dated note), `src/components/canvas/useCanvasLayers.ts` (async renderer selection), `src/core/types.ts`/`constants.ts` (setting), `src/components/sheets/MoreSheet.tsx` (experimental toggle UI, build-mode section)
- Test: `src/render/selectRenderer.test.ts`

**Interfaces:**
- Produces: `selectRenderer(pref: RendererPreference, host: RendererHost): Promise<BoardRenderer>` where `RendererPreference = 'canvas2d' | 'webgl'`; resolution order: URL `?renderer=` override → persisted setting → default `'canvas2d'`. WebGL selection dynamic-imports the chunk (`import('@/render/webgl/WebGLRenderer')`); on import failure OR `canvas.getContext('webgl2') === null`, falls back to Canvas2D and reports via the announcer ("GPU renderer unavailable; using standard renderer").
- Setting storage: localStorage (`phicecraft.renderer`), NOT the drill document (device capability, not document property) — same guarded idiom as FirstRunHint.

Critical ordering constraint: a canvas that has ever had a `2d` context cannot become `webgl2`. `useCanvasLayers` must therefore not touch contexts before selection resolves; the Canvas2D adapter acquires its ctx lazily on first draw (already true after Task 1 — verify), and selection completes before the first draw effect runs (async: render nothing until the renderer promise resolves; CanvasSurface's no-dep-array draw effect tolerates a null renderer by skipping).

- [ ] **Step 1: Failing selection tests** — default canvas2d; URL override wins; webgl2-null falls back with announcement; import-failure falls back.
- [ ] **Step 2: Implement**; run `npm run build` and record real chunk sizes; update `budget-baseline.json` (`recordedAt` today, note: "Raised deliberately for the lazy PixiJS GPU renderer chunk (audit Phase 3). The budget sums every chunk; startup cost is unaffected — the chunk loads only when the GPU renderer is selected."), `npm run check:budgets` green.
- [ ] **Step 3: Verify the sw.js manifest precaches the new chunk** — build, grep dist/manifest.json for the webgl chunk, confirm sw.js's buildAssets() picks manifest entries (it does — assert in the report with the chunk name).
- [ ] **Step 4: Full gate + commit** — `feat: renderer selection with a lazy WebGL chunk behind an experimental toggle`

---

### Task 5: WebGL static layer — the rink

**Files:**
- Create: `src/render/webgl/rinkScene.ts`
- Modify: `src/render/webgl/WebGLRenderer.ts` (drawStatic goes live)

Port `drawRink` (877-line RinkRenderer) to a Pixi scene graph built ONCE and re-rendered under a camera transform: ice gradient (Pixi FillGradient), lines/circles/creases/trapezoid (Graphics), board fixtures, zone tints, arc text + center logo + ARENA_ADS lettering (Pixi Text, baked at 2× resolution into the static scene). Camera: `container.setFromMatrix(new Matrix(a, b, c, d, e, f))` from `cameraMatrix(camera)` with the DPR outer scale on `renderer.resolution`. The tabletop branch (`tilt > TABLETOP_MIN_TILT`) is NOT ported: `WebGLRenderer.drawStatic` detects it and delegates the whole frame (both layers, via an internal `canvasFallback` flag) to Canvas2D functions on the same canvases — set `kind`-specific behavior so the fallback is total, not per-layer (mixed WebGL/2D contexts on one canvas are impossible).
Note: the moment WebGL owns the canvas, it owns it permanently for this page — entering tabletop with the GPU renderer selected therefore renders tabletop via Canvas functions on the *dynamic-layer path drawing onto WebGL canvases is impossible*; instead the fallback swaps the DOM: `WebGLRenderer` keeps two hidden 2D canvases and toggles visibility. Simpler alternative the implementer may choose with justification: when tilt > threshold and renderer is webgl, `selectRenderer` swaps the whole renderer instance to Canvas2D for the session and announces it. Either way, tabletop MUST still work with the GPU toggle on — covered by a test.

- [ ] **Step 1:** Static-scene unit test (Pixi headless: `autoDetectRenderer` with `preference:'webgl'` fails in jsdom — use Pixi's mock/`skipHello` + construct scene graph WITHOUT a renderer and assert node counts/types per rink feature group; rendering itself is e2e-verified).
- [ ] **Step 2:** Implement; manual check via `npm run dev` + `?renderer=webgl`.
- [ ] **Step 3:** Add a `visual-webgl-shell` Playwright project (visual.spec parameterized by `?renderer=webgl`, own baseline dir) capturing `flat-rink` only at this task; generate + commit baselines.
- [ ] **Step 4:** Commit — `feat: WebGL rink scene`

---

### Task 6: WebGL dynamic layer — paths, events, players, overlays

**Files:**
- Create: `src/render/webgl/gameScene.ts`, `src/render/webgl/dashedLine.ts` (dash tessellation helper — Pixi has no native dash; CPU-tessellate dash segments from the same expanded polylines PathRenderer uses), `src/render/webgl/spriteAtlas.ts` (the 4-region `HOCKEY_SPRITES` webp as a Pixi Spritesheet; vector-skater fallback via Graphics using the pure `deriveSkaterPose`/`getSkaterPalette`)
- Modify: `src/render/webgl/WebGLRenderer.ts` (drawDynamic goes live)

Port order within the task (each drawn from the SAME DynamicLayerInput, no new state): ghost trails (Task 3's forEach → one Graphics polyline per player) → skate paths + transient route (dash helper; reuse `expandCurve`) → events + flight lines (`eventFlightLine` is pure — reuse) → drag preview → pass-from highlight → dimmed players + pass candidates → players: atlas sprites (rotation = heading; the same custom-jersey → vector-fallback rule as Canvas via pose+palette) → edit handles (CONTROL_HANDLE_RADIUS/ADD_HANDLE_RADIUS constants reused so hit-testing alignment is by construction) → animated puck → diagnostics (Graphics lines). `quality` tier from useCanvasLayers reaches the renderer: `'low'` skips glow/shadow filters entirely (the audit's effect-shedding tier). shadowBlur equivalents: Pixi BlurFilter on dedicated containers at 'high' only; skater contact shadows = pre-tessellated ellipse alpha gradients, no filter.

- [ ] **Step 1:** Unit tests for `dashedLine` (pure: given points + dash pattern → segment list; parity case: total dashed length ≈ polyline length) and `spriteAtlas` region math (HOCKEY_SPRITES anchors → Pixi frame rects).
- [ ] **Step 2:** Implement incrementally, `?renderer=webgl` dev-checking each group.
- [ ] **Step 3:** Extend `visual-webgl-shell` to the full 12-scenario set; generate + commit baselines; run twice to confirm stability.
- [ ] **Step 4:** Functional e2e on GPU: run `--project=flows --project=puckActions --project=lineShapes` with the webgl URL param via a `RENDERER=webgl` env the config maps to `?renderer=webgl` (add that plumbing to playwright.config/support.openEditor). All green.
- [ ] **Step 5:** Commit — `feat: WebGL game layer with dash tessellation and atlas sprites`

---

### Task 7: Parity gate, perf verification, and the default decision artifact

**Files:**
- Modify: `e2e/perf.spec.ts` (parameterized run), docs
- Create: side-by-side comparison artifact (report file with paired screenshots)

- [ ] **Step 1:** Run the perf project against BOTH renderers (`RENDERER=webgl npx playwright test --project=perf` and default). All five assertions green on both. Record numbers in the report.
- [ ] **Step 2:** Run the FULL functional e2e matrix on webgl (`RENDERER=webgl npm run test:e2e`). Green, or each failure diagnosed & fixed.
- [ ] **Step 3:** Produce the human-review artifact: for each of the 12 visual scenarios, Canvas PNG vs WebGL PNG side by side (an HTML file under docs/ or the report dir), plus a one-paragraph delta description (fonts/gradients will differ subtly — name every visible difference).
- [ ] **Step 4:** Document in `docs/v2/PROGRESS.md` (new `## Phase 3 — GPU coach board` section): abstraction, selection/fallback rules, tabletop delegation, budget raise, parity results, and that the DEFAULT remains canvas2d pending the human's call (flipping the default is one line in selectRenderer + a visual-baseline swap — deliberately left as a human decision with the comparison artifact in hand).
- [ ] **Step 5:** Full gate (`typecheck`, `lint`, `test`, `test:e2e` both renderers, `test:visual` both projects, `build`+`check:budgets`). Commit — `feat: GPU renderer parity gates green; default flip staged for review`

---

## Self-review notes (already applied)

- PixiJS over raw WebGL2: 19 dash uses, 20 shadow uses, 23 text draws, 14 gradients hand-ported to raw GL is months of shader maintenance in a repo with zero render-layer unit tests; Pixi ships all of it. The cost is the budget raise, which the baseline file's own history treats as a legitimate, documented act.
- Tabletop stays Canvas: the two paths are disjoint call sets behind `tilt > TABLETOP_MIN_TILT` already; porting the pseudo-3D pass has no payoff since audit Phase 5 replaces it with true 3D.
- The thumbnailRenderer and the perf counters' index-0 fragility are handled (out of scope / fixed in Task 2 respectively).
- Type consistency: `BoardRenderer`/`RendererHost`/`RendererFactory` (Tasks 1,2,4,5,6), `selectRenderer` (4,5 fallback,7), `visual-webgl-shell` (5,6,7) spelled identically throughout.

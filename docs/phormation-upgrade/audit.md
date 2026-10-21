# PHormation / PHiceCraft Upgrade — Baseline Audit

**Date:** 2026-10-20  
**Repository:** `C:\phicecraft`  
**Branch:** `master`  
**Toolchain:** Vite 4.5.14, React 18.2.0, TypeScript 5.0.0, PixiJS 8.19.0, Three.js 0.182.0, Vitest 1.6.1, Playwright 1.62.0.

---

## 1. Toolchain & Baseline Test Results

- **TypeScript Typecheck (`npm run typecheck`):**
  - Result: Clean (0 errors, exit code 0).
- **Unit & Integration Suite (`npm run test:unit`):**
  - Result: 82 test files passed, 1822 tests passed (0 failures, 11.90s).
- **Production Build (`npm run build`):**
  - Result: Clean compilation and bundle emission, `sw.js` successfully stamped.
- **Linter (`npm run lint`):**
  - Result: 0 errors, 0 warnings (exit code 0).

---

## 2. Source Entrypoints & Architecture Mapping

- **Application Root & Shell:**
  - `src/main.tsx` → `src/App.tsx` → `src/AppShell.tsx`
  - Responsive mode system (`build`, `preview`, `present`), sheet navigation, live region, toast/dialog hosts.
- **Rink Renderers:**
  - `src/components/canvas/CanvasSurface.tsx`: Orchestrates static and dynamic canvas layers, manages gesture state machine and hit testing.
  - `src/render/BoardRenderer.ts`: Unified interface (`drawStatic`, `drawDynamic`, `resize`, `dispose`).
  - `src/render/canvas2d/Canvas2DRenderer.ts`: 2D Canvas fallback implementation.
  - `src/render/webgl/WebGLRenderer.ts`: PixiJS v8 WebGL accelerated renderer with sprite pooling.
  - `src/render3d/Board3D.tsx` & `src/render3d/loadBoard3D.ts`: Lazy-loaded Three.js true-3D view with animated player/goalie GLTF models.
- **Gesture & Input Pipeline:**
  - `src/editor/input/GestureStateMachine.ts`: Transient gesture states (press, hold, move-player, move-coach, draw-route, drag-puck, drag-route-handle, drag-event-handle, pan, pinch).
  - `src/editor/input/PointerRegistry.ts`: Multi-touch tracking.
- **Data Repositories & State Stores:**
  - `src/persistence/indexedDbRepository.ts`: IndexedDB database (`phicecraft`, version 2) storing `drills` (DrillDocumentV3 schema), `meta`, and `recovery`.
  - `src/persistence/saveCoordinator.ts`: Debounced drill saving with out-of-order save protection.
  - `src/domain/practice/practiceStore.ts`: Practice session store currently backed by `localStorage` (`phicecraft:practice_sessions_v1`).
  - `src/features/library/libraryStore.ts`: Search, filter, favourites, and thumbnail generation.
  - `src/playback/PlaybackStore.ts`: Animation playback, scrubbing, tick loop, and time evaluation.
- **Service Worker & Offline PWA:**
  - `public/sw.js`: Pre-caches shell (`/index.html`, `/manifest.json`, icon assets) and Vite build manifest chunks.
  - `scripts/stamp-sw.mjs`: Stamping script generating deterministic version hash from manifest.
  - `src/pwa/updateManager.ts` & `src/pwa/UpdateBanner.tsx`: User-consent update flow.

---

## 3. Investigation Leads Verification Matrix

| # | Investigation Lead | Status | Source Evidence & Verification Details |
|---|--------------------|--------|----------------------------------------|
| 1 | Repeated pending-action dispatches during route/puck previews create unnecessary state objects. | **Present** | In `CanvasSurface.tsx:400` (`onRouteSampling`) and `CanvasSurface.tsx:425` (`onPuckDragPreview`), `commands.setPendingAction` is called on every mouse/touch move frame, triggering continuous React state updates while dragging. |
| 2 | Route/event handles and coach dragging commit document changes during movement, while player dragging uses transient preview. | **Present** | In `CanvasSurface.tsx:396` (`onCoachMove`), `383` (`onRouteHandleDrag`), and `386` (`onEventHandleDrag`), `commands.moveCoach`, `commands.moveRouteControl`, and `commands.moveEventHandle` are called directly on every frame sample, pushing undo history and mutating the document on intermediate moves instead of on release. |
| 3 | Several code paths request drawing without one shared invalidation scheduler. | **Present** | `CanvasSurface.tsx:154-168` invokes `drawStatic()` and `drawDynamic()` synchronously in multiple disconnected `useEffect` listeners (`useEffect` on every render, `camera.subscribe`, `playback.subscribeToFrames`, and `subscribeToHockeySpriteAtlas`), causing multiple redundant redraws per frame. |
| 4 | Quality adaptation measures synchronous drawing cost rather than complete frame pacing. | **Present** | In `CanvasSurface.tsx:142`, frame duration is computed solely as `performance.now() - started` (synchronous CPU execution of `drawDynamicLayer`), ignoring inter-frame intervals, GPU pacing, and requestAnimationFrame delta. |
| 5 | Navigation waits for network rejection before using cached HTML, without explicit fallback timeout. | **Present** | In `public/sw.js:174-188`, `fetch(request)` in navigate mode runs without an explicit timeout; on high-latency/spotty arena connections, page load hangs waiting for default browser network timeout before falling back to cached `/index.html`. |
| 6 | Practice selection uses catalogue templates rather than saved personal drill revisions. | **Present** | In `PracticePage.tsx:87-100`, drills can only be added from `DRILL_TEMPLATES` (`handleAddBlockFromTemplate`); saved personal drills in IndexedDB cannot be selected or pinned into practice blocks. |
| 7 | Custom practice blocks have incomplete editing; practice save failures and empty-state behavior need repair. | **Present** | In `PracticePage.tsx:101-118`, custom blocks create hardcoded fields without inline editing for title, equipment, coaching points, notes; `practiceStore.ts:245-256` re-seeds presets whenever the stored list is empty, preventing a user from deleting all practices. |
| 8 | Station timing and equipment aggregation do not fully represent concurrency and rotations. | **Present** | `practiceStore.ts:365-389` computes total practice duration by naive summation of all block durations (ignoring station concurrency/rotations where multiple stations run simultaneously) and aggregates reusable equipment by naive summation across all blocks instead of peak concurrent demand. |
| 9 | Practice JSON export lacks a matching complete restore path. | **Present** | `exportPracticePlan.ts:94` implements `exportPracticePlanJson`, but there is zero restore/import code anywhere in the codebase for practice JSON bundles. |
| 10 | Compatibility playback projection simplifies rich segments and selects the first puck track. | **Present** | In `src/domain/v3/projectToV2.ts:82-94,159-185`, multi-segments are flattened to single polylines, only `document.puckTracks[0]` is projected, and pass-to-space is mapped to dump. |

---

## 4. Preservation & Baseline Guardrails

- All 1822 existing unit/dom tests must continue to pass without regressions.
- Existing drill schemas (v2, v3) and IndexedDB structure must be migrated idempotently without data loss.
- Storage keys (`phicecraft`, `phicecraft:practice_sessions_v1`) and user documents must be strictly preserved.
- Editing, playback, planning, and practice delivery must function 100% locally and offline without external API dependencies.

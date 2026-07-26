# PhiceCraft repair completion report

Branch `repair/mobile-production`, from `98bbfad` on `codex/hockey-drill-engine`.

---

## 1. Executive summary

PhiceCraft was a working hockey simulation wrapped in a desktop-only shell that
could lose the user's work. The simulation was kept intact; everything around it
was repaired.

**Data safety.** Persistence moved from boolean-returning `localStorage` calls to
a transactional IndexedDB repository behind typed `Result` values. Nothing
reports success until the repository has said so, no visible document changes
until its replacement is durable, and a failure stays on screen with Retry and
Export until it is resolved. Import is treated as untrusted input: parsed as
`unknown`, bounded, remapped to fresh identity by default, and only allowed to
replace a local play after an explicit per-drill confirmation.

**Core editor.** One command layer now owns every hockey action. Duplication
preserves complete route semantics; undo covers settings and jerseys; an
ordinary pass to an opponent is rejected in the domain, so every UI path
inherits it; the single misleading "clear all events" became three commands with
exact meanings; playback starts from exactly one place.

**Mobile and accessibility.** The fixed 259 px of chrome that left 116 px of ice
on a landscape phone became a mobile-first disclosure shell: 264 px of rink at
667 × 375 and 279 px at 844 × 390. Browser zoom is enabled again,
`touch-action: none` is scoped to the rink, and every surface has correct
dialog semantics, focus containment and restoration.

**Performance.** The camera and the playback frame left application state for
external stores. A full playback run now produces **101 React commits, 0 static
rink repaints and 109 dynamic frames** — the reducer used to be republished on
every one of those frames.

**Quality.** 641 unit and component tests (from 181) plus 113 end-to-end tests
across seven viewports, with axe clean of serious and critical violations.

---

## 2. Root cause and repair, by defect

### P0 — data and correctness

| Defect | Root cause | Repair |
| --- | --- | --- |
| Storage failure could display "Play saved" | `saveDrill()` called `persistDrill()` and toasted unconditionally; `persistDrill` returned a boolean nobody read | `SaveCoordinator.save()` returns a typed `Result`; `documentCommands.saveDrill` awaits it and only then toasts. Failure raises a `duration: 0`, `role="alert"` message and a persistent top-bar status. |
| Save As New could switch to an unpersisted copy | The copy was dispatched into state and only then written | The copy is written first; the editor switches only after `repository.save()` succeeds. On failure the user keeps editing the original and is told so. |
| Delete failure could remove the visible drill | `removeStoredDrill(id)` was fire-and-forget, then the reducer dropped the drill regardless | `deleteDrill` awaits the repository; on failure nothing is removed from the list or the screen. |
| Export flush failure was invisible | `exportDrills()` called `persistDrill()`, ignored the result and always toasted "Drills exported" | `exportService` flushes first; on failure the user must choose *Export current unsaved data anyway* or *Cancel*. An unsaved export merges the in-memory revision and is labelled `containsUnsavedRevision`, with `-unsaved` in the filename. The success message is only shown if a file was actually produced. |
| Persistence writes were not transactional | Each drill and the metadata list were separate `localStorage.setItem` calls | IndexedDB `phicecraft` v1 with `drills` (+`updatedAt` index), `meta` and `recovery`. Multi-record writes use one transaction; delete clears the current-drill pointer in the same transaction. |
| Import could save under `undefined` | `importDrills` repaired the object but never gave it an ID, then wrote `phicecraft_drills_undefined` | `remapImportedDrill` generates a fresh drill ID before anything is stored, and the result is revalidated against the storage schema. A test asserts no key is ever the literal string `undefined`. |
| Import could silently overwrite a local drill | A matching ID went straight to `saveDrill`, replacing the local value | Default mode is COPY. Replacement requires an explicit per-drill choice in the import preview, and `replaceAndSave` copies the replaced value into the recovery store inside the same transaction. |
| Import returned counts, not IDs | `{ imported, failed }`, so the app opened `getDrillList()[0]` and guessed | `ImportResult` returns `importedIds` and `replacedIds`; the app opens `importedIds[0]` exactly. A test seeds a newer local drill to prove the guess would have been wrong. |
| Imported identities were not remapped | Only the drill got a new ID | Players, coaches, routes and events all get fresh IDs, and `ownerId`, `fromPlayerId` and `toPlayerId` are rewritten through explicit maps. Property tests confirm the remap always leaves a valid document. |
| Duplicate drill lost route `mode` and `finish` | `duplicateDrill` rebuilt each route from a hand-picked subset of fields | It now `structuredClone`s and then replaces identity/reference fields, so every semantic field — including ones added later — survives. Covered by a unit test and an end-to-end reload test. |
| Jersey changes could not be undone | `UndoSnapshot` omitted `settings`, where jerseys live | `settings` is in the snapshot, deep-cloned. Set-home, set-away and swap all undo and redo. |
| Cross-team passes were accepted | `validatePass` never compared teams; only the drag path filtered by team, in the view | `fromPlayer.team === toPlayer.team` is enforced in `validatePass`, so two-tap, drag, retarget and dump-conversion all inherit it. |
| A pinch release became a tap | The pinch gesture was cleared as soon as fewer than two pointers remained, so the second finger's release ran the tap handler | `PointerRegistry` arms `suppressTapUntilAllPointersReleased` when a second pointer arrives and clears it only when the registry reaches zero — including through cancellation. Eleven registry tests and seven state-machine tests cover it. |
| Malformed `events` crashed validation | `migrateDrill` and `validateDrill` iterated unverified values | The whole pipeline is total. `fast-check` property tests over `fc.jsonValue()` prove parse → migrate → validate → repair never throws, and that a repaired document always passes both domain validation and the storage schema. |
| Corrupt data was discarded | `getDrill` caught, logged and returned `null` | Unreadable values go to the `recovery` store verbatim and are downloadable from the menu. |
| One clear removed three different things | `CLEAR_ALL_EVENTS` removed routes AND events while calling itself "clear all events" | `CLEAR_PUCK_ACTIONS`, `CLEAR_MOVEMENT_ROUTES` and `RESET_BOARD`, each undoable, each with one exact confirmation string that states what goes and what stays. |

### P1 — interaction and consistency

| Defect | Repair |
| --- | --- |
| Goalie end/team convention was inconsistent | `teamDefendingNet` / `teamForDefendedNet` / `teamAttackingNet` state it once. Manual placement used the inverse of the default lineup; both now read the same helper. |
| Hold-to-move used a private 230 ms | `HOLD_DURATION` (720 ms) from `src/core/constants.ts`, with visible progress on the selection chip, cancelled by movement, a second pointer, a tool change or a modal. |
| Move was not discoverable on touch | An explicit **Move** button on the selection chip and in the player inspector; hold-to-move is now the optional expert shortcut. |
| Play behaved differently per surface | `requestPlaybackStart()` is the only entry point. The dock, the transport, the expanded sheet and Space all call it. |
| Route/Pass/Shoot were invisible modes | `PendingEditorAction` is a discriminated union with a visible chip, a "next input" line, Cancel, Escape, and automatic cancellation when its subject is removed, a drill is loaded or a blocking surface opens. |
| The context menu was unreachable | Removed. Its useful actions are on the selection chip (Move / Details / Delete) and in the responsive inspectors. |
| Toasts rendered the oldest while claiming it was newest | A deliberate queue: the active toast stays until dismissed or timed out, repeats are de-duplicated, a failure may pre-empt a routine message but never the reverse, `role="status"` vs `role="alert"` by severity, and long messages wrap. |
| Timeline keyed lanes by jersey number | Keyed by immutable player ID. |
| Default numbers could collide | `nextPlayerNumber` / `nextGoalieNumber` pick a number no teammate is wearing. |
| Objects could end up unrecoverably off-rink | `constrainToRink()` clamps players, coaches, route points and non-shot event endpoints to the rounded rink outline, plus a **Recover off-rink objects** command that reports how many items it rescued. |
| Help contradicted the code | `src/editor/instructions.ts` generates every instruction and help line from the real state and the same constants the implementation uses. |
| Review could never complete | Complete when the current `documentRevision` has no blocking errors AND playback reached the end (or Review was pressed explicitly). Any edit resets it. |

---

## 3. Final architecture and state ownership

| Owner | Holds | Why |
| --- | --- | --- |
| `src/core/state.ts` (reducer) | The persisted drill, `documentRevision`, `reviewedRevision`, `pendingAction`, selection, coarse playback lifecycle, UI surfaces, toast queue, undo/redo, drill list | Low-frequency. Everything here is something React genuinely renders. |
| `src/camera/CameraStore.ts` | Camera, viewport, whether the user has taken the camera over | Changes on every pointer move during a pan and every frame of a pinch. |
| `src/playback/PlaybackStore.ts` | Progress, sampled positions, player frames, puck, fired events, ghost trails | Changes 60×/s. Publishes a coarse snapshot (progress to the nearest percent) to React separately from the per-frame stream the canvas subscribes to. |
| `src/playback/PlaybackController.ts` | The rAF clock | Samples the engine and writes the store; React hears "started" and "completed", nothing else. |
| `src/editor/input/*` | Active pointers, tap/drag discrimination, pinch lifecycle, hold timer, transient route samples, drag preview, tap suppression | Transient; nothing in the DOM renders it. |
| `src/persistence/SaveCoordinator.ts` | `clean`/`dirty`/`saving`/`saved`/`error`, dirty and saved revisions, last error, retry and emergency export | Serializes writes and decides what may be called saved. |
| `src/commands/*` | Validation, undo boundaries, persistence transitions, cancellation, feedback, destructive semantics | The single path every view calls. |

Canvas is two persistent layers in one container: a **static rink** repainted
only when its camera/viewport/DPR key changes, and a **dynamic game layer** for
players, puck, routes, events, handles, previews and trails. DOM owns menus,
dialogs, sheets, inspectors, toasts and every accessible control.

### Maintainability

| Target | Result |
| --- | --- |
| `CanvasSurface.tsx` ≤ 450 lines, an orchestrator | **439** (was 1286). Sizing, hit testing, rendering and gestures are separate modules. |
| `useAppState.tsx` no longer owns persistence, import/export, gestures and playback together | **198** lines (was 691): reducer, context, command host, auto-save trigger. |
| No new production module over 500 lines without justification | Two: `src/commands/authoringCommands.ts` (683) and `src/persistence/drillPipeline.ts` (636). Both are flat collections of small, independent functions with no shared control flow — splitting them would scatter one subject across files without reducing any single unit's complexity. `src/core/state.ts` (877) and `src/core/types.ts` (598) are pre-existing and were reduced, not grown. |
| No broad context updated per pointer event or playback frame | Verified by `e2e/perf.spec.ts`. |
| Duplicated command implementations removed | The context menu, the old `AppActions` surface and `src/storage/*` are deleted. |

---

## 4. Persistence, migration and recovery

**Database.** `phicecraft`, version 1. Stores: `drills` keyed by drill ID and
indexed by `updatedAt`; `meta` for the current drill ID and migration markers;
`recovery` for malformed source records and diagnostic metadata.

**Legacy migration.** On first successful open: read the metadata list *and*
scan raw `phicecraft_drills_*` keys (so a drill missing from the list is still
recovered) → keep the raw source → parse as `unknown` → normalize → migrate →
validate → repair → save every valid drill in **one transaction** → put anything
unrecoverable in `recovery` → **read every migrated drill back** → only then
write the completion marker. Legacy keys are never deleted, and the report
includes a `rawBackup` of every legacy value exactly as it was found.

**Recovery for users.** Menu → *Download recovery data* writes a JSON bundle of
every preserved raw value: legacy records that could not be read, import entries
that failed, and local drills that a confirmed import replaced.

**If storage fails entirely.** The status bar shows a persistent *Save failed*
with **Retry** and **Export**. The error boundary offers *Export the drill I was
working on* first, and *Reset interface state* clears interface keys only —
a test asserts stored drills survive it.

---

## 5. Responsive behaviour

| Breakpoint | Layout |
| --- | --- |
| Phone (< 768 px) | Top strip: menu, brand, truncated play name, save status, Undo, More. Rink. Compact transport. Five-target dock: Select, Add, Action, Erase, Play. Everything else is a sheet. Possession and workflow are one chip each. |
| Compact landscape (height ≤ 500 px) | The transport folds into the dock rather than taking a second 44 px row — the difference between a usable rink and a strip. Context chips are hidden; the pending-action chip is not. |
| Tablet (768–1023 px) | Same model, side sheets instead of bottom sheets, richer inspectors. |
| Desktop (≥ 1024 px) | Redo returns to the top strip and the validation panel is docked; sheets remain the disclosure model. |

Selection shows a compact chip with **Move / Details / Delete**; the inspector
opens only from Details, a second tap, or Enter. Inspectors and sheets scroll
internally, are capped to the viewport, respect safe areas, are dismissible by
Escape, a Close button and (on a bottom sheet) a downward drag.

`index.html` no longer sets `maximum-scale` or `user-scalable=no`.
`touch-action: none` applies only to `.rink-surface`; sheets use `pan-y` and
rails `pan-x`. `user-select: none` applies to `.app-chrome` only, so text in
dialogs, help and inspectors is selectable.

---

## 6. Accessibility

- **One dialog primitive** (`components/a11y/Dialog.tsx`) and **one sheet
  primitive** (`Sheet.tsx`), both built on `useFocusTrap`: correct role,
  accessible name, deterministic initial focus, Tab containment, Escape, and
  focus restoration to the opener. No `setTimeout`-based focus anywhere.
- **Nothing focusable off-screen.** Sheets are conditionally mounted. A test
  Tabs 30 times through the closed shell and asserts no menu control is reached.
- **`window.confirm` / `window.prompt` are gone.** Every decision goes through
  `DialogController`, so destructive copy is consistent and screen-reader
  accessible.
- **Toasts**: `role="status"` for information, `role="alert"` for blocking
  failures, wrapping text, de-duplication, and a queue that never lets a routine
  success displace a failure.
- **Live region** for canvas-only outcomes ("Action cancelled", "Playing …").
- **Reduced motion** from `prefers-reduced-motion` combined with the per-drill
  reduced-effects setting.
- **Help** is a semantic list. It previously rendered seven `<button>`s with
  empty `onClick`.
- **Keyboard**: Escape cancels the pending action or closes the topmost
  surface; Space plays/pauses outside text fields; Ctrl/⌘+Z/Y/S; Enter opens the
  current selection's details; focus indicators are visible everywhere.
- **axe**: no serious or critical violations on the initial editor, open menu,
  rename dialog, destructive confirmation, player inspector, event inspector,
  import preview, help sheet, or save-failure recovery state. Two real contrast
  and focusability defects were found and fixed during this pass.

---

## 7. Performance, measured

Measured by `e2e/perf.spec.ts`; raw output in
[`final/playback-counters.json`](final/playback-counters.json).

| Measurement | Before | After |
| --- | --- | --- |
| React commits during one full 8 s playback run | one reducer dispatch per frame (~480 at 60 fps) | **101** — bounded by 1 % progress granularity, not frame rate |
| Static rink repaints during camera-stable playback | every frame (single-canvas redraw) | **0** |
| Dynamic frames drawn / animation frames offered | n/a | **109 / 111** |
| React commits during a 60-sample route drag | one dispatch per raw pointer sample | **< 60**, and the rink layer repaints **0** times |
| Effective DPR on a DPR 3 device | 3 (uncapped) | **2**, with adaptive 1.5 / 1 under sustained frame pressure |
| Validation during playback | `compileDrill()` + `sampleFrame()` inside render, every tick | keyed to `documentRevision`; a hidden panel does no work |
| Ghost trails | a Map and its arrays cloned per player per frame | fixed-capacity ring buffers owned by the renderer |

Frame-time targets on real mid-range mobile hardware were **not** measured: no
such device was available, and CI hardware cannot substantiate a device-level
frame-time claim. The architectural results above are what was verified. To
reproduce a device trace: run `npm run preview`, open the app on the device via
Chrome remote debugging, record a Performance trace across one playback run, and
compare main-thread work against the 16.7 ms budget.

---

## 8. Assets and bundle

| Artifact | Before | After |
| --- | --- | --- |
| `ph-logo` | 2,013,749 B PNG (1254 × 1254, rendered at 36 px) | **4,100 B** WebP at 96 px |
| `arena-overhead` | 1,772,910 B PNG | **62,384 B** WebP at 1600 px |
| `hockey-sprite-atlas` | 912,293 B PNG | **141,310 B** WebP, full size |
| `hockey-sprite-atlas-source` | 1,594,129 B, shipped to production | moved to `assets-src/`, **not shipped** |
| **Runtime image transfer** | **6,293,081 B (5.99 MiB)** | **207,794 B (203 KiB)** — a 96.7 % reduction |
| Production JS | 305,614 B (1 chunk) | 455,769 B across 9 chunks; **429,758 B** initial, the rest lazy |
| Production CSS | 29,889 B | 27,080 B |
| Source maps in `dist` | 993,336 B, served publicly | **none** (opt-in via `PHICECRAFT_SOURCEMAP=true`) |
| **`dist` total** | **~7,465 KiB** | **~734 KiB** |

Initial JS grew by 124 KiB: that is `zod` and `idb` plus the persistence,
command and accessibility layers. Against 5.79 MiB less image traffic, initial
transfer is down by roughly 5.7 MiB.

`npm run check:budgets` fails when runtime images exceed 1 MiB, the logo exceeds
50 KiB, source-only artwork appears under `public/`, `dist/` contains source
maps, or JS/CSS grows more than 15 % past `scripts/budget-baseline.json`.

---

## 9. Commands run, and their results

Every command below was run in this checkout and its exit code observed.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | 349 packages |
| `npm run typecheck` | 0 | `tsc --noEmit`, with `noUnusedLocals` and `noUnusedParameters` enabled |
| `npm run lint` | 0 | 0 errors, 0 warnings, `--max-warnings 0` across `src`, `e2e` and `scripts` |
| `npm run test:coverage` | 0 | **25 files, 641 tests passed** |
| `npm run build` | 0 | 250 modules, 9 chunks |
| `npm run check:budgets` | 0 | images 203.4 KiB, logo 4.0 KiB, JS 445.4 KiB, CSS 26.4 KiB |
| `npm run test:e2e` | 0 | **113 tests passed** across 11 Playwright projects |
| `npm run test:visual` | 0 | **36 screenshots** matched across 3 viewport projects |
| `git diff --check` | 0 | no whitespace errors |

### Coverage

| Area | Lines | Branches | Gate |
| --- | --- | --- | --- |
| `src/persistence/**` | **95.5 %** | **90.7 %** | 90 / 90 ✓ |
| `src/commands/**` | **95.4 %** | **98.7 %** | 90 / 85 ✓ |
| All included modules | **≥ 80 %** | — | 80 ✓ |

### Test counts

| Suite | Before | After |
| --- | --- | --- |
| Unit and component | 181 | **641** |
| End-to-end | 0 | **113** |
| Visual snapshots | 0 | **36** |

---

## 10. Changed test expectations

Per §3.3, every changed expectation is justified here. No test was weakened,
skipped or deleted to make the suite pass; all 181 original assertions still
run, three groups of them against their new owner.

1. **Camera (12 tests)** moved from `src/core/state.test.ts` to
   `src/camera/CameraStore.test.ts`. The assertions are unchanged — same fit
   maths, same clamps, same anchor behaviour. Only the owner moved, because a
   camera in application state means a pan republishes the whole app.
2. **Playback (9 tests)** moved to `src/playback/PlaybackStore.test.ts`, again
   verbatim: the drill is still never mutated by playback, trails still only
   accumulate while playing, progress is still clamped, reset still clears.
   Two tests were extended to assert the new coarse-snapshot cadence.
3. **`CLEAR_ALL_EVENTS` (2 tests)** were replaced by **12** covering
   `CLEAR_PUCK_ACTIONS`, `CLEAR_MOVEMENT_ROUTES` and `RESET_BOARD`. The old
   action no longer exists: it conflated three operations, which was the defect.
4. **`validateDrillDocument`** treats a drill with no players as valid rather
   than reporting "No initial puck carrier". An empty board is a legitimate
   state; the rule is now "exactly one carrier *once anyone is on the ice*".
   Discovered by the property tests.
5. **`src/sim/simulation.test.ts`** imports `migrateDrillCandidate` from the
   persistence pipeline instead of the deleted `src/storage/migrations`. Same
   inputs, same expectations.

---

## 11. Bugs found by the new tests

Three defects that no unit test could have caught were found while writing the
end-to-end suite, and are fixed:

1. **Every drag was silently dropped.** The gesture machine was rebuilt on each
   render, and the first sample of a route dispatches a pending action — which
   re-renders, replacing the machine mid-gesture and losing the pointer. It is
   now built once and reads its handlers through refs.
2. **A tap on empty ice did nothing.** Pointer-down on empty ice committed
   immediately to a pan, and pan has no tap on release, so "tap empty ice to
   place a player" and "tap to deselect" never fired. Empty ice now stays a
   press until the drag threshold is crossed. Three regression tests added.
3. **Focus had nowhere to return to.** The selection chip unmounted when the
   inspector opened, so the Details button that opened it no longer existed when
   it closed. The chip now stays mounted.

---

## 12. Artefacts

| Artefact | Path |
| --- | --- |
| Baseline record | [`docs/repair/BASELINE.md`](BASELINE.md) |
| Measured rink heights | [`docs/repair/final/measurements.json`](final/measurements.json) |
| Playback counters | [`docs/repair/final/playback-counters.json`](final/playback-counters.json) |
| Visual baselines (36) | `e2e/__screenshots__/visual-{shell,phone-portrait,phone-landscape}/` |
| Playwright report | `playwright-report/` (generated; uploaded by CI) |
| Coverage | `coverage/` (generated; uploaded by CI) |
| Bundle baseline | `scripts/budget-baseline.json` |

### Measured rink height, by viewport

| Viewport | Before | After |
| --- | --- | --- |
| 320 × 568 portrait | 309 px | **393 px** |
| 360 × 800 portrait | 541 px | **625 px** |
| 390 × 844 portrait | 585 px | **669 px** |
| **667 × 375 landscape** | **116 px** | **264 px** (target ≥ 230) |
| **844 × 390 landscape** | **131 px** | **279 px** (target ≥ 250) |
| 768 × 1024 tablet | 765 px | **849 px** |
| 1366 × 768 desktop | 509 px | **580 px** |

"Before" is computed from the fixed chrome heights recorded in `BASELINE.md`
(50 + 32 + 40 + 65 + 72 = 259 px); "after" is measured in the browser by
`e2e/perf.spec.ts`.

---

## 13. Commits, by phase

| Commit | Phase |
| --- | --- |
| `fea8d92` | 1 — test foundation, scripts, baseline record |
| `e3a59df` | 2 + 3 — transactional persistence, strict import, recovery store |
| `efc22a1` | housekeeping — ignore generated coverage and report output |
| `f857bdc` | 4–8 — command layer, input model, responsive shell, accessibility, performance |
| `da9e4e6` | 9 — asset optimization, budgets, unused-code checks, error recovery |
| `8ef802e` | 10 — end-to-end, visual, axe, performance verification, CI, docs |
| `61a756b` | 10 — harness fix: poll the save status instead of sampling it |

---

## 14. Addendum — adjustable line shapes

Added after the ten repair phases, on the same branch lineage: spline and
polyline shapes for both skating routes and puck lines, with control points that
stay adjustable once the play is set up.

**Model.** `SkatePath.points` and `DrillEvent.waypoints` are *control points*,
not samples. `src/utils/curves.ts` expands them at render and simulation time
via `expandCurve(controls, shape)`, where `shape` is `'spline'` (centripetal
Catmull-Rom, alpha = 0.5) or `'polyline'` (straight segments, sharp corners).
Catmull-Rom was chosen over the previous Chaikin corner-cutting because it is
*interpolating*: the curve passes through every control point, so a dragged
handle sits on the line the coach sees. Chaikin only approximated, which left
handles floating beside their own curve.

**The line is now the trajectory.** Previously `DrillEvent.via` bent only the
drawing while `solvePassInterception` flew the puck straight to the receiver's
blade — the inspector described that line as "the exact puck trajectory", which
was false. `via` is gone, replaced by `waypoints: Point[]`, and
`src/sim/flightPath.ts` gives the simulation an arc-length parameterisation of
the drawn curve. Legacy `via` is migrated to a single waypoint on import.

**Re-timing.** Bending a line makes it longer. Rather than recompute from a
nominal puck speed (which would discard the authored pace), the flight window is
scaled proportionally in `applyEventGeometry`:
`arrivalAt = at + (arrivalAt - at) * (newLength / oldLength)`. The authored puck
speed is preserved and only the extra distance is charged for.

**Route capture.** A drawn route is reduced to about ten control points
(`simplifyToControls`, `ROUTE_CONTROL_TARGET = 10`) rather than the hundreds of
raw pointer samples, so there is something to grab. Dragging a handle moves that
one point; its neighbours are untouched. This replaced `processRawPath`, which
rebuilt the whole route as a five-point smooth on every edit.

**Editing.** `PathRenderer` draws a handle per control point and a `+` between
neighbours; `useHitTesting` hit-tests the *expanded* line, not the control
polygon. Tapping a `+` inserts a point; tapping a handle a second time removes
it. Both inspectors carry a Curved/Straight radiogroup, and the event inspector
reports how far the puck actually travels.

**Tests.** 89 new unit tests (`curves.test.ts` 37, `flightPath.test.ts` 20,
`lineShapeCommands.test.ts` 32) and 9 new E2E tests in the `line-shapes`
project. Suite total 739 unit tests across 28 files and 122 E2E tests, all
passing; the 36 visual baselines were re-run and did not need regenerating.
`src/sim/routeSmoothing.ts` was deleted.

One test premise was wrong on the first pass and is worth recording: it asserted
that a spline through a set of points is *shorter* than the polyline through
them. It is not — an interpolating spline bows outside the control polygon, so
it is longer (308.9 vs 300 in the fixture). The assertion now tests the property
that actually distinguishes them, maximum turn angle: pi/2 for the polyline
corner, under 0.5 rad for the spline.

## 15. Addendum — reaching the puck actions, and two dead controls

**Pass and Shoot were two taps deep.** Both lived behind the Action sheet:
open Action, read four rows, choose one. For the two verbs a coach uses most
while drawing a drill that is the wrong depth. They now sit on the rink beside
the puck chip, acting on whoever is carrying, and on the selection chip when
the selected player has the puck. One component (`PuckActionButtons`) renders
both places so they cannot disagree about what is available.

Shoot no longer arms a mode at all. A team attacks exactly one net, so
`attackingNetFor(team)` moved into the domain and the button fires the shot
directly — one tap, no second input. Pass still arms, because the receiver is a
real choice. `P`, `S` and `R` do the same three things from the keyboard.

**The four-pass cap.** `MAX_PASSES_PER_DRILL = 4` lives in `validatePass`, so
drag, tap, the Pass button, retarget and dump conversion all inherit it. A
drill needing a fifth pass is really two drills. `retargetPass` and
`convertDumpToPass` already excluded the event under edit from the list they
validate against, so the cap does not falsely block fixing the receiver of the
fourth pass — a case worth stating because a naive count would have.

Committing a pass now selects the RECEIVER. That is what makes chaining cheap:
the chip's Pass button is already pointed at the next link. The toast counts
down, and names the last pass as the last one.

**Two controls did nothing, and now do.**

1. *Move was decorative.* `beginPlayerMove` set `pendingAction: 'move-player'`,
   but `GestureContext` never carried it, so `GestureStateMachine` could not
   see a move was armed. The only way into the `move-player` gesture was the
   0.7s hold — meaning the button changed a chip caption and nothing else. The
   context now carries `armedMovePlayerId`: pressing the armed player drags it
   at once, and a tap anywhere else drops it there.

2. *Players had no screen-space hit floor.* `PLAYER_HIT_RADIUS` is a world
   constant. The edit handles have always been measured in screen pixels
   (`HANDLE_HIT`), but players were not, so zoomed out to fit a full sheet on a
   phone their tap target shrank to a few pixels. `playerReach()` now takes the
   larger of the world radius and `PLAYER_HIT_FLOOR / zoom`.

**The puck marker.** The carrier's puck was a 5.5x3.7 ellipse with a gold
stroke and a 7px gold glow — wider than the stick blade and the brightest thing
on the ice, so it read as a selection marker rather than as a puck. It is now a
small matte-black disc with no glow, defined once in `canvas/puckMarker.ts` and
shared by the skater, the goalie and the tabletop piece, which had three
separate copies of it. Who has the puck is still stated by the "Puck #11" chip.

**Tests.** 19 new unit tests (`puckActionCommands.test.ts` 14, plus 5 gesture
tests for the armed move) and 8 new E2E tests in a `puck-actions` project.
Suite total 758 unit tests across 29 files and 130 E2E tests. One visual
baseline was regenerated — the selection chip, which legitimately gained two
buttons; it still fits a 844x390 landscape phone.

Note for whoever runs these next: the E2E `webServer` is `npm run preview`,
which serves `dist/`. A UI change needs `npm run build` before the E2E suite
will see it, or every new assertion fails against the previous bundle.

## 16. Addendum — three verbs, a connected pass, and a derived shot

**The pass would not connect.** `passReceiverAt` has always accepted a hit on a
receiver's *route line* as well as their token, but only the drag path used it.
A tap went through `classify`, which returns the strict token hit, so with a
pass armed, tapping the line a receiver was skating selected that player and
silently dropped the pass. Both paths now resolve through `passReceiverAt`, so
a pass connects to a token or to any point on the receiver's route - which is
how you pass to where a player will be rather than where they are standing.

**Three verbs.** `Tool` is down to `move` and the four placement modes. `shoot`
and `erase` are gone, and the dock is Move / Pass / Skate / Add / Play. Only
Move is a mode: Pass and Skate arm one `PendingEditorAction` and finish, which
is the property that stops them becoming the invisible sticky states the old
Route/Pass/Shoot tools were. The Action sheet is deleted - everything in it is
now either a dock button or derived. Erase is not replaced: Delete is on the
selection chip and routes come off in Details, both of which show you what you
are about to remove first.

Skate is not only a shortcut. `promotePress` reads a drag on the carrier as
`drag-puck`, which made the carrier the one player who could never be given a
route by dragging - exactly the skate-in-and-shoot drill. `armedRoutePlayerId`
now overrides that, the same way `armedMovePlayerId` fixed Move.

**The finishing shot is derived.** `withFinishingShot` runs from `appReducer`,
the single point every drill mutation passes through, and maintains a trailing
`ShotEvent` with `auto: true` sourced from whoever ends up with the puck. Three
properties it has to hold, and each one cost something to get right:

- *Pure and cheap.* `MOVE_PLAYER` fires once per animation frame during a drag,
  so nothing in here compiles the drill; the release point comes straight from
  the authored route or the player's position.
- *Referentially stable.* When the derived shot already matches, the identical
  `Drill` object is returned. `appReducer` reads a new object as a document
  change, so churning would bump the revision and invalidate the review on
  every action - there is a test for exactly that.
- *Transparent.* `canAddEvents` and `getCurrentPuckHolder` both go through
  `authoredEvents`. Without that the shot would make `canAddEvents` false and
  the carrier null the instant it appeared, so the play it completed could
  never be extended and the shot would have nobody left to be sourced from.

One bug worth recording, because the fix is not the obvious one. `authoredEvents`
first stripped only a *trailing* auto shot. But the reducer appends, so a new
pass lands **after** the derived shot and strands it mid-list, where it then
looked authored - and the drill grew a second shot on the next edit. It now
strips every auto shot wherever it sits. The same append ordering meant
`releaseTimeFor` was timing new passes off the shot's arrival, scheduling them
after the shot had already been taken; it reads authored events now too.

The shot is gated on a play existing at all - an authored puck event, or a
route for the carrier - so a fresh board stays empty rather than opening with an
event nobody drew. A consequence worth knowing: *Clear puck actions* on a drill
that still has routes leaves the derived shot, because the drill is still a play.

**Who has the puck.** Shrinking the puck to something that looks like a puck
(§15) left the question "who is carrying" hard to answer across a full sheet of
ice. `drawCarrierRing` is a separate marker for a separate question - a gold
ring inside the highlight and selection rings so all three can coexist.

**Two duplications removed while verifying.** The screenshot showed Pass and
Shoot rendered twice at once - on the possession chip and on the selection chip
- so the possession chip is a readout again. And the dock's Move and the chip's
Move were two controls with the same accessible name; the chip's is now
`Move #11`.

**Tests.** 23 new unit tests in `finishingShot.test.ts` and one more E2E, on top
of retargeting every assertion that counted raw events at `authoredEvents`.
Suite total 782 unit tests over 30 files and 131 E2E tests. All 36 visual
baselines pass unchanged.

## 17. Remaining limitations

Each is evidence-backed. None is a guess.

1. **Visual regression does not run in CI.** Playwright screenshot baselines are
   per-platform bitmaps, and this repository carries only the 36 generated on
   the Windows machine the repair was done on. A Linux CI run would have no
   baseline to compare against. The visual project therefore runs as
   `npm run test:visual`, and CI runs the other 11 projects. Producing Linux
   baselines requires a Linux runner, which was not available here.

2. **Device frame-time targets are unverified.** No mid-range mobile device was
   available, and CI hardware cannot substantiate a device-level frame-time
   claim. What *was* measured is in §7: 0 static repaints and 101 React commits
   across a full playback run. A repeatable manual trace procedure is given in
   §7; it has not been executed.

3. **Two production modules exceed 500 lines.** `authoringCommands.ts` (683) and
   `drillPipeline.ts` (636), justified in §3.

4. **`npm audit` reports 23 advisories** in the development toolchain (1 low,
   3 moderate, 17 high, 2 critical), all from `vite@4` / `vitest@1` /
   `eslint@8` transitives. None affects the shipped bundle, whose only runtime
   dependencies are `react`, `react-dom`, `uuid`, `idb` and `zod`. Clearing them
   means a major upgrade of the build toolchain, which is a change of scope
   beyond this pass and was not made.

5. **The `phicecraft_settings` interface-state key is reserved, not used.** The
   error boundary clears it during *Reset interface state*, but nothing writes
   it yet; interface state currently lives only in memory.

6. **Legacy `localStorage` keys are never deleted.** This is deliberate — they
   are the backup until a user has had a successful session on the new store —
   but it means a migrated user keeps a duplicate copy of their drills in
   `localStorage` until they clear site data.

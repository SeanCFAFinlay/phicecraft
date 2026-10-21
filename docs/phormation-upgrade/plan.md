# PHormation / PHiceCraft Upgrade — Implementation Plan

This plan organizes the upgrade into ordered, reviewable stages following `PHormation_Master_Enhancement_Prompt.md`.

---

## Stage 0: Verification & Baseline Mapping (Completed)
- [x] Run baseline test suite, TypeScript typecheck, build, and linter.
- [x] Verify the 10 prior public-build findings against current source code.
- [x] Create upgrade documentation directory (`docs/phormation-upgrade/`) with `audit.md`, `decisions.md`, `plan.md`, `progress.md`, and `verification.md`.

---

## Stage 1: Responsive Editing, Gesture Transactions & Rendering Architecture
- **Objective:** Fix gesture commits, idempotent previews, invalidation scheduling, frame pacing, and mobile/a11y interactions.
- **Tasks:**
  1. **Invalidation Scheduler:**
     - Create `src/render/invalidationScheduler.ts` to coalesce static/dynamic render requests to at most once per display frame using `requestAnimationFrame`.
     - Wire into `CanvasSurface.tsx` to replace multiple synchronous `drawStatic()` and `drawDynamic()` invocations.
  2. **Idempotent Pending Action Updates:**
     - Update pending action dispatching in `src/commands/` and `src/components/canvas/CanvasSurface.tsx` so identical preview states do not trigger repeated React state dispatches during pointer movement.
  3. **Gesture Transactions for Handles & Coaches:**
     - Modify `GestureStateMachine.ts` and `CanvasSurface.tsx`: route handles, event handles, and coach dragging keep transient coordinates in a local ref and trigger dynamic redraws without committing to document history.
     - On release (`pointerUp`), commit a single semantic command (`moveRouteControl`, `moveEventHandle`, `moveCoach`) and create exactly one undo history step.
     - On cancel (`pointerCancel`, Escape, multi-touch pinch), restore baseline geometry without creating history or autosaving.
  4. **Quality Governor & Frame Pacing:**
     - Update `src/render/qualityStore.ts` and `CanvasSurface.tsx` to measure true inter-frame intervals (animation frame delta) rather than synchronous drawing duration alone, with hysteresis to avoid tier flapping.
  5. **Mobile & A11y Polish:**
     - Overlapping actor selection ambiguity resolver/picker.
     - Ensure minimum 44px touch targets on essential controls.
     - DOM keyboard alternatives and ARIA live region rate limiting.
- **Acceptance Checks:**
  - Dragging a coach, route handle, or event handle creates exactly one history/undo entry upon release.
  - No repeated `setPendingAction` state updates while dragging.
  - Frame pacing measures complete intervals; no double-redraws per animation frame.
  - All unit and DOM tests pass.

---

## Stage 2: Durable Drill-to-Practice Continuity & Storage
- **Objective:** Move practices into IndexedDB, support immutable drill revision pinning, full custom block editing, complete practice bundle import/restore, truthful save feedback, and offline fallback.
- **Tasks:**
  1. **IndexedDB Practice Repository & Idempotent Migration:**
     - Update `src/persistence/indexedDbRepository.ts` to database version 3 with a `practices` object store and `drillSnapshots` store (or embedded pinned snapshots).
     - Implement migration from `localStorage` to IndexedDB with a `practiceMigrationCompletedAt` marker.
     - Fix empty-state behavior: empty list after deleting the last practice remains `[]` and never resurrects presets.
  2. **Practice Revision Pinning:**
     - Extend `PracticeBlock` and `PracticeSession` types in `src/domain/practice/types.ts` to include `pinnedRevision?: DrillDocumentV3` or snapshot ID.
     - When adding a drill (from saved personal drills or templates), pin an immutable copy of its `DrillDocumentV3`.
     - Provide UI indication when the source drill has been updated, allowing the coach to review and explicitly update the pinned version.
  3. **Editable Custom Practice Blocks:**
     - In `PracticePage.tsx`, allow full in-place editing of title, objective, instructions, duration, equipment demands, coaching points, and notes for custom and template blocks.
  4. **Practice Selection from Personal Library:**
     - Allow selecting drills from personal saved drills in IndexedDB as well as catalogue templates.
  5. **Practice Bundle Export & Complete Restoration:**
     - Create `src/persistence/practiceBundle.ts`: generate self-contained practice bundle JSON with manifest, practice metadata, blocks, and all pinned drill snapshots.
     - Implement `importPracticeBundle` with Zod validation, collision handling, preview sheet, and commit into IndexedDB.
  6. **Service Worker Weak-Network Fallback:**
     - In `public/sw.js`, add a 2.5-second timeout for navigate mode fetch before falling back to cached `/index.html`.
     - Validate `response.ok` before updating the shell cache.
- **Acceptance Checks:**
  - Deleting the last practice leaves an empty list on reload.
  - Saved personal drills can be added to practices as pinned immutable revisions.
  - Modifying the original drill does not alter the pinned practice drill revision until explicitly updated.
  - Exported practice JSON can be imported into a clean profile and fully restored.
  - Service worker falls back to cached shell within 2.5 seconds on a hanging network.

---

## Stage 3: Faithful Teaching, Concurrency Logic & Practice Delivery
- **Objective:** Concurrency-aware station timing and equipment demands, deterministic evaluator for rich playback, and a live Practice Runner view.
- **Tasks:**
  1. **Station Concurrency & Equipment Calculation:**
     - In `src/domain/practice/practiceStore.ts`, calculate total duration considering station rotations (e.g. 3 concurrent stations with 2 rotations = `2 * max(station_time) + changeovers`).
     - Distinguish consumables (pucks) from reusable equipment (cones, tires, nets, etc.). Compute peak concurrent equipment demand across overlapping blocks/stations.
  2. **Deterministic Evaluator Alignment:**
     - Ensure seeking and sequential playback produce identical scene states across 2D and 3D, respecting multiple puck tracks, waits, and possession changes.
  3. **Live Practice Runner View:**
     - Implement `src/features/practice/PracticeRunner.tsx` with:
       - Large high-contrast timer display (minutes/seconds) with Play/Pause/Reset.
       - Current block and station/rotation indication.
       - Pinned drill diagram and coaching cues preview.
       - Explicit Complete / Modify / Skip actions.
       - Persistent session state (timestamp-based elapsed time so reload or backgrounding does not lose progress).
       - Quick coach observation notes field.
  4. **Interactive Teaching & Role Cues:**
     - Integrate named phase cues and role-filtered explanations during drill playback.
- **Acceptance Checks:**
  - 3 simultaneous 10-minute stations evaluate to 10 minutes total for 1 rotation.
  - 3 groups visiting 3 stations evaluate to 30 activity minutes plus changeovers.
  - Reusable equipment calculates peak concurrency (e.g. 8 sequential cones need 8 cones; 3 concurrent 8-cone stations need 24).
  - Practice runner persists elapsed time and tracks completed/modified/skipped states.

---

## Stage 4: Local Coaching Intelligence & Recommendations
- **Objective:** Domain validation layer, corrective timing proposals, offline drill recommendations, and post-session feedback.
- **Tasks:**
  1. **Domain Validation Engine:**
     - Create `src/domain/validation/coachIntelligence.ts` to analyze:
       - Pass departure and receiver arrival timing mismatches with explicit numbers (e.g. "Pass arrives at 3.2s, receiver arrives at 4.1s").
       - Role shortages (missing goalie, missing defensemen).
       - Duplicate assignments and space conflicts.
       - Equipment shortages against inventory.
     - Generate corrective proposals (e.g. delay pass, adjust route duration).
  2. **Offline Recommendation & Filtering:**
     - Recommend drills based on team age/level, available ice footprint, equipment availability, and target skills without requiring external AI.
  3. **Post-Session Feedback Collection:**
     - Record actual completed minutes, flow notes, and keep/modify tags.
- **Acceptance Checks:**
  - Timing mismatch correctly flags pass vs. receiver arrival differences.
  - Corrective proposals apply as a single undoable transaction.
  - Recommendations function fully offline with transparent scoring.

---

## Stage 5: Grounded Assistant with Controlled Edits
- **Objective:** Safe assistant boundary with allowlisted operations, schema validation, diff previews, and unconfigured state handling.
- **Tasks:**
  1. **Assistant Adapter Interface:**
     - Create `src/features/assistant/assistantTypes.ts` and `assistantService.ts`.
     - Define allowlisted structured operations: add drill to practice, adjust block duration, update cue, edit custom block.
     - Validate model output strictly against current document revisions and schemas.
  2. **Accurate Unconfigured State:**
     - When no API endpoint/key is provided, display an honest, clear "Unconfigured" status without fake responses or hallucinations.
- **Acceptance Checks:**
  - Assistant operations strictly enforce allowlisted schema and revision guards.
  - Unconfigured state clearly communicates status.

---

## Stage 6: Richer Presentation, Authored Decisions & Final Verification
- **Objective:** Authored decision points, printable clipboard/cards export, and full journey verification.
- **Tasks:**
  1. **Decision Points & Variations:**
     - Support interactive pause events during playback with coach-authored learner options.
  2. **Updated Coaching Cards & Print Export:**
     - Polish print and PNG exports to include phase cues, equipment lists, and station assignments.
  3. **End-to-End User Journey Verification:**
     - Execute the full 12-step journey from Section 18 of the master prompt.
     - Update all documentation files in `docs/phormation-upgrade/`.
- **Acceptance Checks:**
  - All automated test suites green (`test:unit`, `typecheck`, `build`, `lint`).
  - Journey demonstration fully verified.

# PHormation / PHiceCraft Upgrade — Progress Log

This document tracks completed work, evidence, current blockers, and the exact next task.

---

## Current Status Overview
- **Current Stage:** Stages 0 through 6 + End-to-End Master Journey Implemented, Reviewed, and Verified.
- **Blockers:** None.
- **Test Metrics:** 1876 passing tests across 92 test files (all passing, 0 regressions, +54 new tests added).
- **Toolchain Status:** TypeScript clean (`npx tsc --noEmit` 0 errors), ESLint clean (`npm run lint` 0 errors/warnings), Production Build clean (`npm run build` 0 errors, 9.96s).

---

## Log of Completed Work

### Stage 0: Verification & Baseline Mapping
- **Action:** Executed baseline validation against the codebase.
- **Evidence:**
  - `npm run typecheck`: clean (0 errors).
  - `npm run test:unit`: 1822 tests passing across 82 test files.
  - `npm run build`: successful compilation, stamped `dist/sw.js`.
  - `npm run lint`: clean (0 errors, 0 warnings).
  - Verified all 10 investigation leads in `docs/phormation-upgrade/audit.md`.
  - Created upgrade documentation directory with `audit.md`, `decisions.md`, `plan.md`, `progress.md`, and `verification.md`.

### Stage 1: Responsive Editing, Gesture Transactions & Rendering Architecture
- **Action:**
  - Created `src/render/invalidationScheduler.ts` and unit tests in `src/render/invalidationScheduler.test.ts`. Coalesces static and dynamic render calls to at most one render per display animation frame, retaining dirty flags raised during painting.
  - Extended `src/render/qualityStore.ts` and tests in `src/render/qualityStore.test.ts` to measure full frame pacing (inter-frame intervals / timestamp delta) in addition to synchronous paint cost, with sustained pressure thresholds and hysteresis recovery.
  - Implemented `pendingActionEquals` and idempotent `SET_PENDING_ACTION` reducer handling in `src/core/state.ts` and `src/commands/authoringCommands.ts`, preventing duplicate React state allocations and re-renders during route/puck drag previews. Added unit tests in `src/core/state.test.ts`.
  - Added transient preview support for coaches, route handles, and event handles to `DynamicLayerInput` in `src/components/canvas/renderDynamic.ts` and `src/render/webgl/gameScene.ts`.
  - Unified gesture transaction lifecycle in `src/components/canvas/CanvasSurface.tsx`: movement of route handles, event handles, and coaches now updates transient preview refs and triggers dynamic redraws without pushing undo history or updating document state on intermediate frames. Release (`pointerUp`) commits one single semantic command and history entry; cancel clears all transients cleanly back to baseline.
  - Added overlapping actor disambiguation: `playersAt(point)` in `src/components/canvas/useHitTesting.ts` detects overlapping player clusters and allows sequential taps to cycle selection without moving either player.
- **Evidence:**
  - `npm run typecheck`: clean (0 errors).
  - `npm run test:unit`: 1833 tests passed across 84 test files (11 new unit tests).
  - `npm run lint`: clean (0 errors, 0 warnings).

### Stage 2: Durable Drill-to-Practice Continuity & Storage Boundary
- **Action:**
  - Added 2.5-second weak-network fallback to cached shell (`/index.html`) in `public/sw.js` with `response.ok` validation.
  - Extended `PracticeBlock` in `src/domain/practice/types.ts` with `pinnedRevision?: DrillDocumentV3`, `rotations`, `changeoverMinutes`, `retainedSetup`, `objective`, `instructions`, and `roles`.
  - Built Zod v4 schemas in `src/domain/practice/schema.ts` (`practiceBlockSchema`, `practiceSessionSchema`, `practiceBundleSchema`, `parsePracticeSession`, `parsePracticeBundle`).
  - Added empty state initialization persistence marker (`PRACTICE_INITIALIZED_KEY = 'phicecraft:practice_sessions_initialized'`) in `src/domain/practice/practiceStore.ts`: intentional deletion of all practices leaves an empty array (`[]`) and never resurrects presets.
  - Updated `createBlockFromTemplate` to pin immutable copies of drill revisions (`pinnedRevision: structuredClone(template.document)`). Added `createBlockFromDrill` and `createCustomBlock`.
  - Created `src/domain/practice/practiceBundle.ts`: `createPracticeBundle`, `validateBundlePayload`, and `restorePracticeBundle` supporting full portable bundles and legacy session JSON.
  - Updated `src/ui/exportPracticePlan.ts` to export portable bundles (`exportPracticePlanJson`).
  - Added Personal Saved Drills tab to Drill Picker in `src/features/practice/PracticePage.tsx` using `getRepository().readAllDocumentsV3()`.
  - Added Practice Plan Import file picker with validation feedback and session selection.
  - Added full inline block editor drawer for custom blocks and station splits.
- **Evidence:**
  - `src/domain/practice/concurrency.test.ts`: 4 passed.
  - `src/domain/practice/practiceStore.dom.test.ts`: 4 passed.
  - `src/domain/practice/practiceBundle.dom.test.ts`: 7 passed.

### Stage 3: Faithful Teaching, Concurrency Logic & Live Practice Runner
- **Action:**
  - Implemented ADM station concurrency metrics in `src/domain/practice/practiceStore.ts`: calculates true total duration across rotations and changeovers (`rotations * max(stationDuration) + (rotations - 1) * changeoverMinutes`).
  - Implemented dual equipment aggregation: checklist total (`equipmentTotals`) vs. peak concurrent reusable equipment demand (`peakConcurrentEquipment`).
  - Created `src/features/practice/PracticeRunner.tsx` and `src/features/practice/practiceRunnerStorage.ts`:
    - Large high-contrast timer display (remaining vs. overtime).
    - Timestamp-based elapsed time calculation (survives app backgrounding and reload without drift).
    - Explicit Complete / Modify / Skip activity progression.
    - Station and rotation progress tracking.
    - Instant coach observation notes captured per block.
  - Integrated "▶ Run Live Practice" launcher in `src/features/practice/PracticePage.tsx`.
- **Evidence:**
  - `src/features/practice/PracticeRunner.test.tsx`: 4 passed.
  - `src/features/practice/PracticePage.test.tsx`: 7 passed.

### Stage 4: Local Coaching Intelligence & Offline Recommendations
- **Action:**
  - Created `src/domain/validation/coachIntelligence.ts`:
    - Evaluates pass release vs arrival sequence sanity.
    - Evaluates pass arrival vs receiver arrival timing mismatches with exact delta calculations and timing sync proposals.
    - Evaluates roster roles (goalie requirements, skater minimums) and provides auto-placement proposals.
    - Evaluates spatial conflicts (< 3ft start position overlap) with offset proposals.
    - Evaluates equipment sufficiency against session inventory.
  - Created `src/domain/recommendation/recommendationEngine.ts`:
    - Transparent offline scoring and ranking for drill selection.
    - Matches age band, skill level, rink area / ice footprint, equipment availability, goalie availability, and category focus.
    - Generates reason badges with positive/negative points breakdown.
- **Evidence:**
  - `src/domain/validation/coachIntelligence.test.ts`: 6 passed.
  - `src/domain/recommendation/recommendationEngine.test.ts`: 4 passed.

### Stage 5: Grounded Assistant with Controlled Edits
- **Action:**
  - Created `src/features/assistant/types.ts` and `src/features/assistant/assistantService.ts`.
  - Enforced unconfigured state boundary: when no remote API key is supplied, `getAssistantStatus()` explicitly returns `'unconfigured'` (never emits hallucinated AI text).
  - Defined allowlisted operation generators: `proposeAddEquipment`, `proposeAppendCue`, `proposeAdjustPassTiming`, `proposeAssignRole`.
  - Every proposal provides structured diffs, assumptions, and validation guarantees via `parseDrillDocumentV3` in `safelyApplyProposal`.
- **Evidence:**
  - `src/features/assistant/assistantService.test.ts`: 5 passed.

### Stage 6: Visual Clarity & Teaching Presentation
- **Action:**
  - Extended `src/ui/exportPracticePlan.ts` with `formatPracticePlanMarkdown` and `copyPracticePlanMarkdown` to export clean Markdown tables with timing, station splits, coaching cues, and equipment checklists for WhatsApp, Discord, Slack, and Notion.
  - Added "Copy Markdown (Table)" button to `src/features/practice/PracticePage.tsx` with clipboard feedback.
  - Added ADM Peak Concurrent Equipment display chips to the Consolidated Equipment Checklist.
- **Evidence:**
  - `src/ui/exportPracticePlan.test.ts`: 2 passed.
  - Full suite passed: 1868 unit tests in 91 test files.
  - TypeScript clean (`npx tsc --noEmit` 0 errors).
  - ESLint clean (`npm run lint` 0 errors).
  - Production build clean (`npm run build` 0 errors).

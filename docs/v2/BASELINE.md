# V2 market rebuild — verified baseline

Recorded before any source change, as required by §5 of the master rebuild
prompt. Every number below is command output from this working tree, not a
recollection.

**Commit:** `25b44f6978c9d2d54482b155870f4d2cd4d41441`
**Branch at capture:** `master` (work proceeds on `v2/market-rebuild`)
**Node:** v24.16.0 **npm:** 11.13.0
**Working tree:** clean

---

## 1. Command results

| Command | Result |
|---|---|
| `npm run typecheck` | **pass** — 0 errors |
| `npm run lint` | **pass** — 0 errors, 0 warnings (`--max-warnings 0`) |
| `npm run test` | **pass** — 782 tests, 30 files |
| `npm run test:coverage` | **pass** — 782 tests, 30 files, thresholds met |
| `npm run build` | **pass** — built in 3.5s |
| `npm run check:budgets` | **pass** — all budgets |
| `npm run test:e2e` | **pass** — 131 tests |
| `npm run test:visual` | **pass** — 36 snapshots |

### Sizes at baseline

```
runtime images       203.4 KiB  (budget 1.00 MiB)
logo                   4.0 KiB  (budget 50.0 KiB)
production JS        459.3 KiB
production CSS        27.0 KiB
```

---

## 2. Correction to the review's §15

`PHICECRAFT_MARKET_READINESS_REVIEW_V2.md` §15 states:

> ```
> npm test
> → sh: 1: vitest: not found
> npm ci
> → installation process failed/timed out in the available container
> ```
> No claim is therefore made that the current build, tests, lint, or Playwright
> suites pass.

That was a limitation of the review container, not of the repository. In this
environment the full suite runs and is green, as recorded above. The review's
inference that "the visual baselines and completion report are not reliable
evidence for the current source tree" is **partly** wrong and partly right:

- **Wrong:** the suites do pass, and the 36 visual baselines match current
  source. The review was reading `phicecraft-master (1).zip`, an older
  snapshot, and its §15 claim that committed phone screenshots "still show
  Select, Add, Action, Erase, Play" does not hold here — those baselines were
  regenerated when the dock changed.
- **Right:** there is genuine product-language drift, catalogued in §4 below.

Findings in the review that describe *code* were re-verified individually
against this tree rather than taken on trust. §3 records which are live.

---

## 3. Review findings re-verified against current source

| Review § | Finding | Status | Evidence in this tree |
|---|---|---|---|
| 4.1 | Four-pass domain cap | **LIVE** | `src/engine/puck.ts:161` |
| 4.2 | One route per player | **LIVE** | `src/core/state.ts:450-454` |
| 4.3 | Single linear puck chain | **LIVE** | `src/core/types.ts` — no phases/tracks |
| 4.4 | Every play forced to finish with a shot | **LIVE** | `src/engine/finishingShot.ts` |
| 4.5 | `passReceiverAt` does not filter to teammates | **LIVE** | `useHitTesting.ts` — only `excludePlayerId` is skipped; team is never checked, so an opponent can win the nearest-target race and only then be rejected by the validator |
| 4.6 | Missed pass tap silently exits pass mode | **LIVE** | `CanvasSurface.tsx` — `cancelPendingAction()` on no candidate |
| 4.7 | Failed pass drag becomes a dump | **LIVE** | `onPuckDragRelease` |
| 6.2 | `MOVE_PLAYER` dispatched per pointer frame | **LIVE** | `CanvasSurface.tsx` → `movePlayerTo` |
| 6.3 | Shoot is described inconsistently | **LIVE** | see §4 |
| 7.1 | Tabletop is affine pseudo-3D | **LIVE** | `PlayerRenderer.ts` |
| 7.2 | Four static sprite crops | **LIVE** | `HockeySpriteAtlas.ts` |
| 7.4 | Real brand names hard-coded | **LIVE** | `src/core/constants.ts` |
| 8.1 | Portrait fits the full rink horizontally | **LIVE** | `src/camera/cameraMath.ts` |
| 14.1 | Offline claim with no service worker | **LIVE** | no manifest, no SW |

Three findings the review lists are **already addressed** in this tree and need
no work: the pass tap now also accepts a receiver's route line (§4.5's
"suggested result" is still outstanding, but the tap/drag path divergence it
describes is fixed), the Action sheet is gone, and Erase is no longer a tool.

---

## 4. Product-language drift to reconcile (review §6.3)

Confirmed contradictions in the current tree:

- `README.md` says "There is no Shoot button and no Erase tool" and, 20 lines
  later, "**Shoot** is on the selection chip when the selected player has the
  puck."
- `ToolDock.tsx`'s header comment says Shoot is "gone from here", which is true
  of the dock but reads as a product statement.
- `useKeyboardShortcuts.ts` binds `S` to shoot.
- `PuckActions.tsx` renders a Shoot button.

The underlying cause is the unresolved decision the review identifies: Shoot was
made automatic *and* kept as a manual action. §19 of this rebuild resolves it
with an explicit finish policy — a shot is authored when the coach wants one and
derived only when the phase asks for it.

---

## 5. Scope reality

The review's own roadmap (§18) estimates 3–5 days for Phase 0 and 2–8 weeks per
subsequent phase, totalling roughly five to eight months, and Phase 4 depends on
3D art production that is an asset-pipeline job rather than a coding one.

This document is the Phase 0 exit condition: one verified baseline, and one
catalogue of what is actually true about the current source. Work proceeds in
the mandated phase order, and `docs/v2/PROGRESS.md` records what is done, what is
in flight, and what is blocked on assets or hardware this environment does not
have.

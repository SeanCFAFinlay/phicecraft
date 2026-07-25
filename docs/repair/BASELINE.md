# PhiceCraft repair baseline

Captured before any repair work, from a clean `npm ci` checkout.

## Environment

| Item | Value |
| --- | --- |
| Node | v24.16.0 |
| npm | 11.13.0 |
| OS | Windows 11 Home 10.0.26200 |
| Branch at start | `codex/hockey-drill-engine` |
| Commit at start | `98bbfadc05c818a7767e55a00c6724778205ebd3` |
| Repair branch | `repair/mobile-production` |
| Uncommitted at start | `?? 94ghad4f.jpg` (untracked user file, preserved) |

## Commands

| Command | Exit code | Result |
| --- | --- | --- |
| `npm ci` | 0 | 330 packages added. 23 npm-audit advisories reported (1 low, 3 moderate, 17 high, 2 critical) in the dev toolchain. |
| `npm run test` | 0 | 6 test files, **181 tests passed**. |
| `npm run lint` | **1** | 1 error: `src/components/CanvasSurface.tsx:830` — `react-hooks/exhaustive-deps` unnecessary dependency `findPathAt`. |
| `npm run build` | 0 | `tsc && vite build`, 112 modules, built in 2.21s. |
| `npm run typecheck` | n/a | Script did not exist. |
| `npm run test:e2e` | n/a | Script did not exist. |
| `npm run check:budgets` | n/a | Script did not exist. |

### Baseline test breakdown (181)

| File | Tests |
| --- | --- |
| `src/core/rink.test.ts` | 27 |
| `src/utils/geometry.test.ts` | 22 |
| `src/engine/puck.test.ts` | 28 |
| `src/engine/playback.test.ts` | 37 |
| `src/core/state.test.ts` | 49 |
| `src/sim/simulation.test.ts` | 18 |

## Build output sizes

| Artifact | Bytes |
| --- | --- |
| `dist/index.html` | 753 |
| `dist/assets/index-3cc640e6.css` | 29,889 (gzip 6,240) |
| `dist/assets/index-0aa1f869.js` | 305,614 (gzip 92,190) |
| `dist/assets/index-0aa1f869.js.map` | 993,336 (**shipped publicly**) |
| `dist` total | ~7,465 KiB |

## Runtime images (all copied into `dist/assets` by Vite)

| Asset | Bytes | Notes |
| --- | --- | --- |
| `public/assets/ph-logo.png` | 2,013,749 | 1254×1254, rendered at 36 CSS px in `TopBar` |
| `public/assets/arena-overhead.png` | 1,772,910 | CSS background for `.arena-stage` |
| `public/assets/hockey-sprite-atlas.png` | 912,293 | runtime sprite atlas |
| `public/assets/hockey-sprite-atlas-source.png` | 1,594,129 | **source-only artwork shipped to production** |
| **Total runtime image transfer** | **6,293,081 (5.99 MiB)** | |

## Largest source files (lines)

| Lines | File |
| --- | --- |
| 1286 | `src/components/CanvasSurface.tsx` |
| 901 | `src/core/state.ts` |
| 877 | `src/canvas/RinkRenderer.ts` |
| 691 | `src/hooks/useAppState.tsx` |
| 601 | `src/core/state.test.ts` |
| 563 | `src/core/types.ts` |
| 533 | `src/canvas/PathRenderer.ts` |
| 518 | `src/canvas/PlayerRenderer.ts` |
| 446 | `src/sim/sampleFrame.ts` |
| 423 | `src/engine/playback.ts` |
| 13791 | (total `src` .ts/.tsx) |

## Baseline mobile shell measurement

Measured from the fixed CSS heights in `src/App.tsx` and the shell components,
before any responsive work:

| Row | Height |
| --- | --- |
| `TopBar` | 50 px |
| `PuckChainBar` | 32 px |
| `WorkflowBar` | 40 px |
| `Toolbar` | ~65 px (py-2 + 52px min tool height) |
| `Playbar` | 72 px |
| **Total fixed chrome** | **259 px** |

Usable rink height = viewport height − 259 px:

| Viewport | Usable rink height |
| --- | --- |
| 667 × 375 landscape | **116 px** |
| 844 × 390 landscape | **131 px** |
| 390 × 844 portrait | 585 px |
| 320 × 568 portrait | 309 px |

`index.html` also sets `maximum-scale=1.0, user-scalable=no` (browser zoom
disabled) and `src/styles/index.css` sets `touch-action: none` plus
`user-select: none` on `html, body` globally.

## Screenshots

Playwright was not installed at baseline time, so the viewport captures listed
in the repair prompt could not be produced from the pre-repair tree. The
measured fixed-chrome heights above are the recorded baseline for the mobile
rink-height comparison; final measurements are captured by the Playwright
viewport suite added in Phase 10 and recorded in
`docs/repair/PHICECRAFT_REPAIR_COMPLETION.md`.

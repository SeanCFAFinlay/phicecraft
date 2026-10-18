# Faceoff to finish: implementation and verification

Implemented locally on 2026-10-16. Open **Add > Watch 3D demo**, or **Edit demo**
to change the same sequence. Existing routes/actions require the normal
replacement confirmation and can be restored with Undo.

The eight-second sequence uses three attackers, one faceoff partner and a
goalie. Pickup completes at 0.75s; skating begins at 1s, 2s and 3.5s; passes
arrive at 3.1s and 5s; the shot releases at 6.2s and reaches the planned save
at 6.65s. Both catches are in stride with assistance off. The win and save
are authored teaching scenarios. This is not competitive AI gameplay.

Models have distinct action clips and a rigid, two-hand stick pose. Animation
samples absolute playhead time and contact phase, so direct seeking and
reverse scrubbing are repeatable. The models remain stylized, procedurally
animated characters rather than photorealistic or motion-captured athletes.

## Verification

- Full unit suite: 1,822 tests passed across 82 files after repairing the
  interrupted runtime migration and verifying the V3 projection merge.
- Browser checks: 39 passed, one intentionally skipped desktop-only check
  in the phone project. Includes coaching, roster/scan persistence, quick
  commands, accessibility, save flows and actual 3D mounting/playback.
- Final rebuilt models: desktop and phone demo checks both passed, including
  full playback and backward seeking to faceoff, reception and shot poses.
- TypeScript production build, ESLint and asset budgets pass.
- Each animated GLB is below 1 MiB. The original Blender source files are
  unchanged; `scripts/refine-hockey-models.py` rebuilds the shipped GLBs.

## Performance observation

The isolated Playwright run used Chromium's **ANGLE SwiftShader software
renderer**, device pixel ratio 1. Phone results emulate a viewport on this
computer; they are not measurements from a physical phone.

| Viewport | Click to actors ready | Browser rAF average | rAF p95 interval |
| --- | ---: | ---: | ---: |
| 1366 x 768 | 2.59 s | 21.8 FPS | 116.7 ms |
| 390 x 844 | 2.10 s | 18.8 FPS | 83.4 ms |

These are observed callback timings during a short replay, not GPU timer
queries or guaranteed display frame rates. Startup shader compilation,
headless software rendering and machine load affect them. A sustained 60 FPS
target has **not** been demonstrated. Test on the intended desktop GPU and
physical phones before making that claim.

Reproduce the demo check after `npm run build`:

```sh
npx playwright test --project=coaching --project=coaching-phone -g "full 3D demo" --workers=1 --output=output/playwright/showcase-final
```

Ignored artifacts under that output directory include faceoff, receive, shot
and finish screenshots plus `demo-performance.json` for each viewport.
`window.__phicecraftBoard3d` also exposes render-call duration, draw calls and
triangle counts; those CPU render-call durations do not measure GPU completion.

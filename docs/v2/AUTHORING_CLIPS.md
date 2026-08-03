# Authoring more animation clips for the 3D board

The 3D presentation currently ships with two clips — `skate` (player) and
`goalie_idle` (goalie) — and covers everything else procedurally (heading
rotation, stride speed-scaling, a frozen ready-pose below walking speed).
The pipeline is built to accept more clips whenever they are authored; this
page is the recipe.

## Where clips come from

The models live in Blender at `assets-src/models/hockey_player.blend` and
`assets-src/models/hockey_goalie.blend`. Clips are ordinary Blender actions
on the existing armature (do not add/rename bones — the runtime clones the
skinned mesh as-is). Export overwrites `public/assets/models/*.glb`.

**Export checklist (glTF 2.0 / .glb):**
- Include → Animations ON, all actions you want shipped (each becomes a
  named `AnimationClip`).
- Keep the existing material names (`jersey`, `accent`, `pants`, `skin`,
  `white`, `dark`, `steel`, `stick`) — team tinting matches on these names
  (`src/render3d/scene/tintMaterials.ts`), and `src/render3d/modelAssets.test.ts`
  pins them.
- **Rename the output file when the bytes change** (e.g.
  `hockey_player_v2.glb`) or ship it together with a code change — the
  service worker caches `/assets/*` first-forever, so a same-name re-export
  never reaches installed clients (see the note at `STATIC_ASSETS` in
  `public/sw.js`). Renaming means updating `src/render3d/modelAssets.ts`
  and the `STATIC_ASSETS` list.

## The clip list worth authoring

The simulation already computes a per-frame `action` for every skater
(`PlaybackPlayerFrame.action`, type `SkaterAction` in `src/core/types.ts:322`).
A clip named after each action slots straight into the mapping:

| Clip name (= SkaterAction) | What to author |
|---|---|
| `stride` | full skating stride loop (today's `skate` clip is this) |
| `glide` | knees bent, feet parallel, coasting |
| `turn` | crossover lean loop |
| `stop` | hockey-stop snap, authored as a loop (the sim's `action` field times the window it's shown for — see "Wiring a new clip in") |
| `receive` | stick reaches to cradle an incoming pass |
| `recover` | regather after a stumble/check |
| `pass` | sweep-pass release, authored as a loop (same timing note as `stop`) |
| `shot` | wrist/slap shot release, authored as a loop (same timing note as `stop`) |
| `idle` | subtle weight-shift standing loop |

Goalie extras (picked by role, not `SkaterAction`): `goalie_butterfly`,
`goalie_save_glove`, `goalie_save_blocker` — the current `goalie_idle`
remains the base loop.

## Wiring a new clip in

Clip selection and cross-fading are already wired up — an authored clip
activates purely by matching a `SkaterAction` name, no code change needed.
This is implemented in two files:

1. `src/render3d/scene/clipSelector.ts` — pure, mixer-free selection rules:
   - `selectClipName(kind, frame, availableClipNames)`: a goalie always gets
     `'goalie_idle'`. A skater gets `frame.action` verbatim if a clip by that
     exact name exists on the model, else the fallback chain
     `action → 'stride' → 'skate'` — `'stride'` is this doc's canonical name
     for the movement loop, `'skate'` is what today's shipped GLB actually
     calls it, and both must resolve identically. This makes selection a
     pure function of the frame: the same frame always yields the same
     clip, so scrubbing the timeline back and forth is deterministic and
     there is no "has this one-shot already fired" state to track.
   - `isMovementClip(name)`: true for `skate`/`stride`/`glide`/`turn`.
2. `src/render3d/scene/actors.ts`'s `createActor` — the mixer wiring:
   `findClip(gltf.animations, name)` fetches clips by name; each named clip
   gets its own `THREE.AnimationAction`, created once and always `.play()`-
   ing, with only `weight`/`enabled` turning it on or off. On a selection
   change, `currentAction.crossFadeTo(nextAction, CLIP_FADE_SECONDS, false)`
   (0.15 s) ramps the outgoing action's weight 1→0 and the incoming one's
   0→1, and — because that ramp is driven by the mixer's own accumulated
   time, i.e. the exact same progress-derived `dt` every other update uses —
   a paused timeline holds the blend mid-fade rather than snapping or
   racing ahead. A loop wrap/jump (`isProgressWrap`) instead snaps straight
   to the target clip (`stopFading()` + direct weight assignment): a fade
   must never linger across a loop boundary.
3. Every clip loops (`THREE.LoopRepeat`, the three.js default) — including
   `pass`/`shot`/`stop`, which AUTHORING_CLIPS.md originally suggested as
   `LoopOnce` + `clampWhenFinished`. That would need extra state ("has this
   one-shot already played for the current action window?") that breaks
   under scrubbing: scrub backward across a completed one-shot and there is
   no principled way to tell whether it should replay, hold its clamped end
   pose, or rewind. The sim's `frame.action` already times each of those
   windows frame-by-frame, so looping the clip and simply following
   `frame.action`'s selection every tick keeps the whole pipeline a pure
   function of the frame — the deliberate trade made here.
4. Speed rules, unchanged: `isMovementClip` clips (`skate`/`stride`/`glide`/
   `turn`) speed-scale via `skateTimeScale(frame.speed)` and freeze at the
   ready pose below `SKATE_FREEZE_SPEED`; every other clip
   (`pass`/`shot`/`stop`/`receive`/`recover`/`idle`) plays at a flat 1×.
5. Scrubbing must keep working: the mixer is driven by progress-derived
   deltas (`resolveMixerDelta`), never wall clock — new clip logic must not
   introduce its own timer. This is also why the crossfade above rides the
   same `dt` rather than scheduling anything itself.
6. Tests: extend the worked-example pattern in
   `src/render3d/scene/actors.dom.test.ts` (hand-built GLTF fixture with
   linear-ramp clips, mixer output read back as the observable — see
   `buildFutureGltf()` for the multi-clip variant) with one case per new
   selection rule, and add the new clip names to
   `src/render3d/modelAssets.test.ts`'s animation-name assertions.

## Verifying

`npm test` (unit), then `npx playwright test --project=board3d` and a
manual `npm run dev` → tilt into 3D → play a bundled drill. The visual
`tabletop rink` baseline captures a pre-playback pose — regenerate it only
if the resting pose changed.

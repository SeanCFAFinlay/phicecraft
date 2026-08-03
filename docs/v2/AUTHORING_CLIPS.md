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
| `stop` | hockey-stop snap (short, non-looping) |
| `receive` | stick reaches to cradle an incoming pass |
| `recover` | regather after a stumble/check |
| `pass` | sweep-pass release (short, non-looping) |
| `shot` | wrist/slap shot release (short, non-looping) |
| `idle` | subtle weight-shift standing loop |

Goalie extras (picked by role, not `SkaterAction`): `goalie_butterfly`,
`goalie_save_glove`, `goalie_save_blocker` — the current `goalie_idle`
remains the base loop.

## Wiring a new clip in

All selection happens in `src/render3d/scene/actors.ts`:

1. `findClip(gltf.animations, name)` fetches clips by name.
2. Today the choice is static: `clipName = kind === 'goalie' ? 'goalie_idle' : 'skate'`
   (`actors.ts:108`). To use per-action clips, extend `Actor.update` — it
   already receives the live `PlaybackPlayerFrame` (which carries `action`)
   — to cross-fade the mixer between `findClip(...)` results when
   `frame.action` changes (`THREE.AnimationAction.crossFadeTo`, ~0.15 s).
3. Keep the existing rules: `stride`-family clips speed-scale via
   `skateTimeScale(frame.speed)`; short clips (`pass`/`shot`/`stop`) play
   once at 1× (`THREE.LoopOnce`, `clampWhenFinished`) then fall back to the
   movement clip.
4. Scrubbing must keep working: the mixer is driven by progress-derived
   deltas (`resolveMixerDelta`), never wall clock — new clip logic must not
   introduce its own timer.
5. Tests: extend the worked-example pattern in
   `src/render3d/scene/actors.dom.test.ts` (hand-built GLTF fixture with a
   linear-ramp clip, mixer output read back as the observable) with one case
   per new selection rule, and add the new clip names to
   `src/render3d/modelAssets.test.ts`'s animation-name assertions.

## Verifying

`npm test` (unit), then `npx playwright test --project=board3d` and a
manual `npm run dev` → tilt into 3D → play a bundled drill. The visual
`tabletop rink` baseline captures a pre-playback pose — regenerate it only
if the resting pose changed.

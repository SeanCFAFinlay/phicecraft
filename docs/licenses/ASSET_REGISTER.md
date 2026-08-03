# Asset and content licence register

Required by §16 of the V2 market rebuild prompt. Every image, texture, icon,
font, sound, 3D model and piece of drill content that ships must appear here
with a provenance and a licence. **An asset that is not in this register is not
cleared to ship.**

Status: **complete.** The rows below cover what is in the repository today.
The Open Blockers list at the end is empty — every gap previously tracked
there has been resolved.

---

## Runtime images (`public/assets`)

| Asset | Origin | Licence | Status |
|---|---|---|---|
| ~~`arena-overhead.webp`~~ | Unverified — inherited from an earlier commit | **Unknown** | ✅ **Removed — replaced by the true-3D presentation (Phase 4).** The tabletop view no longer draws a photographic backdrop; Board3D (`src/render3d/`) renders a real ice/boards/glass/arena-floor scene, and the CSS stage behind it is a first-party gradient (`src/styles/index.css`). The file and its `assets-src/` source are deleted. |
| `hockey-sprite-atlas.webp` | First-party — baked from the repo's own GLB models by `scripts/bake-sprites.mjs` | Owned | ✅ Clear. `assets-src/hockey-sprite-atlas.png` (the optimizer's source) is a deterministic render of `hockey_player.glb`/`hockey_goalie.glb` (see the "3D assets" table below) — orthographic top-down captures, jersey-tinted per team, composited into the four `HOCKEY_SPRITES` regions (`src/canvas/HockeySpriteAtlas.ts`). The old unknown-provenance photographic source (`hockey-sprite-atlas-source.png`) is deleted. |
| PH logo | First-party (PhiceCraft) | Owned | ✅ Clear |

## Rink and board content

| Asset | Origin | Licence | Status |
|---|---|---|---|
| `ARENA_ADS` board panels | First-party, generic | Owned | ✅ Clear as of the commit that added this file. Previously read TOSHIBA, Coca-Cola, BAUER, ŠKODA, NIKE, Zepter, TISSOT and OMEGA — real marks hard-coded into a product intended for sale. Replaced with PhiceCraft branding and neutral placeholders. |
| `94ghad4f.jpg` (repo root) | Third-party 3D arena render | **None** | ✅ **Removed.** It carried Toshiba, Coca-Cola, Bauer, Škoda and Nike board advertising, it was committed to the default branch, and nothing in the build referenced it. |

## Icons and type

| Asset | Origin | Licence | Status |
|---|---|---|---|
| Toolbar and sheet icons | First-party SVG (`src/ui/icons.tsx`) | Owned | ✅ Clear. Previously Unicode emoji, which render differently per operating system, carry no consistent optical weight and cannot inherit the interface's own colour. |
| App icon / favicon (`public/hockey-icon.svg`) | First-party SVG, hand-authored (a rink oval, centre line and faceoff dot) | Owned | ✅ Clear. Referenced by `index.html`'s `<link rel="icon">` and both icon entries in `public/manifest.webmanifest` (`any` and `maskable`) — the same file serves the browser tab and the installed PWA icon. |
| Typography | System font stack | N/A | ✅ Clear |

## Drill content

| Asset | Origin | Licence | Status |
|---|---|---|---|
| The four bundled example drills | First-party | Owned | ✅ Clear |
| The 24-template catalogue | First-party — originally authored in `src/data/templates/` (`passing.ts`, `smallArea.ts`, `transition.ts`, registered in `registry.ts`) | Owned | ✅ Clear. Authored as original content per the rule below; validated as coherent v3 documents by `src/data/templates/registry.test.ts`. No third-party diagram, screenshot or written description was copied. |

## 3D assets

| Asset | Origin | Licence | Status |
|---|---|---|---|
| `hockey_player.glb` (skater, `skate` animation) | First-party (PhiceCraft) — authored in Blender by the project owner (sources in `assets-src/models/`) | Owned | ✅ Clear |
| `hockey_goalie.glb` (goalie, `goalie_idle` animation) | First-party (PhiceCraft) — authored in Blender by the project owner (sources in `assets-src/models/`) | Owned | ✅ Clear |

Both are rigged, single-skin glTF 2.0 binaries with eight solid-colour
materials (jersey/accent/pants/skin/white/dark/steel/stick) — no third-party
textures. Equipment and further animation clips remain to be authored; add
rows here as they land.

**Re-exporting either file in place is a cache trap.** `public/sw.js`'s
`STATIC_ASSETS` list precaches these two GLBs (and the 2D sprite atlas) with a
cache-first policy that keeps them **forever** — a build never emits a new
filename for a `public/`-verbatim asset the way a hashed Vite chunk does. A
coach with the app already installed will keep the OLD bytes at the SAME URL
indefinitely. If you re-export/re-bake either GLB (a fixed material name, a
new animation clip, a rigging change), you must ALSO either rename the file
(and update `MODEL_URLS` in `src/render3d/modelAssets.ts` to match) or bump
`sw.js`'s `VERSION`/change some other cached byte so the service worker's own
install step re-fetches it — a same-name overwrite with no code change never
reaches an already-installed client.

---

## Open blockers

**None.** Every blocker previously tracked here is resolved:

1. ~~`arena-overhead.webp` provenance is unknown.~~ Resolved: Phase 4 Task 6
   deleted the file (and its `assets-src/` source) along with the pseudo-3D
   tabletop pass it backed — the tabletop view is now the true-3D
   presentation (`src/render3d/`), which needs no photographic asset at all.
2. ~~Sprite-atlas source images have unknown provenance.~~ Resolved: Phase 4
   Task 2 replaced them with a first-party bake (`scripts/bake-sprites.mjs`)
   from the repo's own GLB models; the old source PNG is deleted and the
   register row above updated.
3. ~~No 3D asset licences.~~ Resolved: the skater and goalie GLBs are
   first-party, Blender-authored by the project owner, and recorded in the
   "3D assets" table above.
4. ~~Template content not authored.~~ Resolved: the 24-template catalogue is
   authored first-party in `src/data/templates/` and registered above.

## Rule

Adding an asset to the repository means adding a row here in the same commit.
"Unknown" is a valid status; leaving the asset out of the register is not.

# Asset and content licence register

Required by §16 of the V2 market rebuild prompt. Every image, texture, icon,
font, sound, 3D model and piece of drill content that ships must appear here
with a provenance and a licence. **An asset that is not in this register is not
cleared to ship.**

Status: **incomplete.** The rows below cover what is in the repository today.
The gaps are listed at the end and are release blockers, not paperwork.

---

## Runtime images (`public/assets`)

| Asset | Origin | Licence | Status |
|---|---|---|---|
| `arena-overhead.webp` | Unverified — inherited from an earlier commit | **Unknown** | ⛔ **Blocker, reduced.** No longer used behind the editor (§8.2) — only behind the tabletop presentation view. Provenance must still be established or the file replaced before release. |
| `hockey-sprites` atlas source images | Unverified — inherited | **Unknown** | ⛔ **Blocker.** These are photographic-looking skater/goalie crops. Phase 3 replaces them with a first-party token system, which resolves this by deletion. |
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

---

## Open blockers

1. **`arena-overhead.webp` provenance is unknown.** It is now confined to the
   tabletop presentation view rather than sitting behind every edit, but it
   still ships. Establish provenance or replace it.
2. **Sprite-atlas source images have unknown provenance.** Phase 3's renderer
   replacement should delete them; until then they ship.
3. ~~No 3D asset licences.~~ Resolved: the skater and goalie GLBs are
   first-party, Blender-authored by the project owner, and recorded in the
   "3D assets" table above.
4. ~~Template content not authored.~~ Resolved: the 24-template catalogue is
   authored first-party in `src/data/templates/` and registered above.

## Rule

Adding an asset to the repository means adding a row here in the same commit.
"Unknown" is a valid status; leaving the asset out of the register is not.

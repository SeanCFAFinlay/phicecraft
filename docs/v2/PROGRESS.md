# V2 market rebuild — progress

What is done, what is in flight, and what is blocked. Every "done" line has
tests behind it and a commit; nothing here is a plan restated as an
achievement.

Phase numbering follows `PHICECRAFT_MARKET_READINESS_REVIEW_V2.md` §18.

---

## Scale, stated plainly

The review's own roadmap estimates **3–5 days for Phase 0 and 2–8 weeks per
phase after it — roughly five to eight months of engineering**, and Phase 4
depends on licensed animated 3D hockey models, which is an art-production job
rather than a coding one.

This document exists so that progress is legible against that, rather than a
green test run being mistaken for a finished product.

---

## Phase 0 — Truthful baseline ✅ done

`docs/v2/BASELINE.md`, commit `528214a`.

- Full command set run and recorded. Everything was already green, which
  corrects the review's §15: it could not run the suite in its container and
  therefore made no claim either way.
- Every review finding re-verified against **this** tree rather than the zip the
  review read. Three were already fixed; three of the live ones had been
  introduced by the two commits immediately before this work started.
- Product-language drift catalogued and, as of `67b4ddd`, reconciled.

---

## Phase 1 — Passing and interaction ✅ done

### 1a — no pass cap, no forced shot (`528214a`)

- `MAX_PASSES_PER_DRILL` deleted, along with every counter, toast and keyboard
  announcement derived from it. A cap of four was a UI concern written into the
  domain layer; it made one-touch warm-ups, continuous passing patterns,
  regroups, breakouts, station circuits and anything that loops impossible.
- `FinishPolicy` on drill settings. Only `finish-with-shot` derives anything.
  Possession games, warm-ups, races, stickhandling stations and breakouts that
  end at a zone exit can now end the way they actually end.
- Migration reads a drill for its own answer: a file containing a derived shot
  migrates to `finish-with-shot`, so no existing play changes shape on load. An
  authored shot is deliberately *not* taken as evidence.

### 1b — one pass-target service (`d5a02fb`)

- `src/editor/passing/passTargetService.ts`. Eligibility is decided **before**
  ranking, so an opponent can never win the nearest-target race and hide a
  valid teammate behind it — the §4.5 defect.
- Uses the **drawn** position, fixing the divergence where hit-testing read
  authored coordinates while the canvas drew the scrubbed ones.
- Direct token hit beats a route hit. Candidates carry structured eligibility,
  a reason, predicted arrival and catch quality, solved against one compile of
  the drill rather than one per receiver.

### 1c — no silent failures (`d5a02fb`)

- A missed tap keeps Pass armed and says what to do. It used to call
  `cancelPendingAction()` with no message, so on a phone the control simply
  appeared not to work.
- An imprecise drag no longer becomes a dump. Aiming at a net is still a
  deliberate shot; everything else resolves the same way a tap does.
  `requestDump` survives as a command — it is just no longer what a stray
  gesture produces.

### 1d — the candidate set is visible (`67b4ddd`)

- Eligible teammates ringed, their route corridors lit, opponents dimmed, and
  the ring colour carries the catch prediction. Computed when the pass arms and
  when the drill changes, never per frame.

### 1e — one gesture, one write (this commit)

- Dragging a player is a transient preview. `MOVE_PLAYER` used to be dispatched
  on every pointer frame, rewriting `updatedAt`, allocating a new drill,
  bumping the document revision, invalidating the review and waking the save
  coordinator sixty times a second. One `MOVE_PLAYER` is now dispatched on
  release, and there is an e2e test asserting the per-sample write is gone.

### Deliberately not in Phase 1

**Pass-to-space.** The interaction recognises it as a distinct intent, but the
persisted action lands in Phase 2. Doing it against schema v2 would mean either
widening `PassEvent` for something v3 replaces outright, or reusing the dump
event and calling it a pass — the exact model workaround the review objects to
in §9.1.

---

## Phase 2 — Schema v3 ⏳ not started

Metadata, actors, equipment, phases, actor tracks with multiple movement
segments, multiple puck tracks, pass types and receive modes, pass-to-space,
and an idempotent v2→v3 migration.

Two v2 constraints this must remove, both still live:

- one route per player (`src/core/state.ts`, "One path per player")
- one linear puck chain, globally sequential

---

## Phase 3 — PixiJS 2D editor ⏳ not started

Also carries the portrait fix (§8.1: the camera always fits the full rink
horizontally, so a portrait phone gets a strip), removal of the decorative
arena background, and a real SVG icon set to replace the emoji.

---

## Phase 4 — True 3D presentation ⛔ blocked on assets

The renderer, the animation-state mapping from sampled mechanics, the quality
tiers and the 2D fallback are all codeable here. **The models are not.** The
spec requires licensed GLB skater and goalie models with hockey equipment
silhouettes and roughly thirteen animation clips. Those have to be bought,
commissioned or authored in a DCC tool; they cannot be produced from this
environment.

Recommended split: build the renderer against a placeholder rig, and treat model
procurement as a parallel track with its own budget.

---

## Phase 5 — Library and templates ⏳ not started

The 24-template catalogue is authorable here — they are documents plus metadata
and coaching text. It is a large content job and should not be estimated as a
small one.

---

## Phase 6 — PWA, packaging, commercialisation ⏳ not started

Manifest, service worker and offline cold start are codeable and testable here.

**Commercial cleanup is not blocked and should be pulled forward**: real brand
names (Toshiba, Coca-Cola, Bauer, Škoda, Nike, Tissot, Omega) are hard-coded in
`src/core/constants.ts`, and `94ghad4f.jpg` at the repo root contains
third-party marks. Both ship today.

---

## Things this environment cannot verify

Stated so no acceptance criterion is silently marked green:

- **Real-device testing** on iPhone-class, compact 320px, tablet and mid-range
  Android hardware. Playwright viewport emulation is not the same claim.
- **3D memory, load time and frame rate on actual phones.**
- **Any 3D asset production.**
- **Cloud sync**, which needs a backend that does not exist.

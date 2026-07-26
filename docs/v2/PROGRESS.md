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

## Phase 2 — Schema v3 🔶 foundation done, adoption pending

`src/domain/v3/`. 96 tests.

### Done

- **Types** (`types.ts`). Metadata, rink configuration, actors as a real union
  (skater / goalie / **coach**), equipment, groups, phases with `repeatCount`
  and `simultaneousGroup`, actor tracks holding **many** movement segments,
  **many** puck tracks, the full puck-action set including pass-to-space and
  turnover, annotations, presentation.
- **Migration** (`migrateV2ToV3.ts`). Idempotent, and tested against the four
  drills that actually ship rather than invented shapes. The coach-as-player
  workaround in `fiveManCornerRetrieval` becomes a `CoachActor` and a `coach`
  puck source — the test asserts the hack is present in the fixture first, so
  it cannot pass vacuously.
- **Projection** (`projectToV2.ts`). Flattens a v3 document into the v2 shape
  the current engine runs. All four fixtures round-trip **with zero reported
  losses**, which is what makes v3 safe to adopt as the stored format.
- **Validation** (`validation.ts`). Referential integrity across the graph,
  separating errors from warnings. Notably it refuses to give a coach a route
  or pass them the puck — the v2 workaround cannot come back in a new costume.

### Honest status

The v3 module is **not yet imported by the application**, so the production
bundle is byte-identical. This is a foundation, not a shipped feature: nothing
a coach can see has changed. What it buys is that the next steps — persisting
v3, editing a second route segment, adding equipment — are now additive rather
than blocked on a schema rewrite.

### Not done

- Persisting v3 (repository, import/export and the save coordinator still
  speak v2).
- Editing anything v2 cannot express. The model holds equipment, phases and
  multiple segments; no UI creates them yet.
- Teaching the **simulation** about phases, repeats, simultaneous groups and
  multiple pucks. Until then `projectionLosses` reports exactly what a given
  document loses when it plays.

---

## Phase 3 — 2D editor 🔶 portrait fixed, renderer not started

### Done — the portrait board (§8.1)

`calculateFitCamera` always fitted the sheet horizontally, so an upright phone
showed a strip in a large decorative stage. The board now **turns a quarter
turn** when that shows more ice, chosen by measuring both orientations rather
than guessing from an aspect-ratio threshold, with a 15% margin so a
near-square viewport does not flap.

- Fit is rotation-aware. At rotation 0 the new arithmetic is identical to what
  it replaced, which the untouched existing camera tests confirm.
- Auto-applied on resize, overridable by a new toolbar control, and **not**
  applied to the tabletop, where rotation is the orbit angle rather than a fit.
- The jersey numbers counter-rotate, so the body turns with the board but the
  digits stay screen-upright. Without this the fix made the board unreadable.
- `e2e/support.ts` learned the same rotation, so specs that address the rink by
  world coordinate still land where they aim.

Measured, per viewport: the app takes the better orientation whenever the gain
is worth it. **A full sheet is 2.35:1 and a phone is not**, so no orientation
fills an upright screen - on a 320x568 phone the ice goes from roughly a
quarter of the canvas to a little under half, and the long axis fills ~90% of
the screen. The spec's "70% of available editor area in portrait" is not
reachable for a FULL-rink drill by rotation alone; it needs the half/zone view,
which is still to do. A 768x1024 tablet deliberately stays flat, because
turning buys only 11% there.

### Done — zone views

`cameraForZone` hard-coded a zoom of 2 and centred on 38%/62% of the rink's
length, numbers unrelated to where the blue lines are, so the "zone" it framed
was not one. The camera now fits an arbitrary world rectangle and the named
views are real regions — end boards to the blue line plus a little neutral ice,
because the entry is most of the coaching. Orientation is chosen **per region**:
a full sheet turns on a phone, an end zone (435x425) does not. A cycling
Full / D zone / O zone control sits with the view controls; on a 390px phone
the zone view draws players at roughly 2.3x the size the original fit gave.

### Done — the visual system (§8.2, §8.3)

- **The arena photograph is out of the editor.** A full-screen arena photo with
  gradients, an inset shadow and a scan-line overlay made the rink read as a
  miniature inside a picture rather than as the work surface. The flat board is
  now a clean navy field; the photo is kept for the tabletop, which *is* the
  presentation view.
- **A first-party SVG icon set** (`src/ui/icons.tsx`) replaces every emoji
  control. Emoji are not an icon system: each operating system draws them
  differently, so optical weight and baseline changed per device, and none of
  them could inherit the interface's colour. The set is one 24x24 grid, one
  stroke weight, `currentColor` throughout — so active, disabled and hover
  states now apply to the icon as well as the label.

### Not started

PixiJS renderer.

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

## Phase 5 — Library and templates 🔶 catalogue and library done

### Done — 24 original templates

`src/data/templates/`. Eight passing/warm-up, eight small-area games, eight
transition/rush. All first-party, each with setup notes, coaching points,
progressions and variations.

`builder.ts` is why the catalogue could grow past four: a template written
longhand is a couple of hundred lines of ids, phase wiring and timing
arithmetic. Drills are placed against real rink landmarks (goal lines 55/945,
blue lines 375/625, faceoff dots 155/845 and y 102.5/322.5), and a test asserts
those constants still match `RINK`. A pass targets where the receiver will BE
at the end of their route, not where they started.

Every template is checked rather than trusted: it validates as a coherent v3
document, keeps every actor, route point and puck action on the ice, records
its provenance, and **plays through the engine** without a non-finite position
at eleven samples across its run.

The catalogue demonstrates two review findings in content rather than only in
unit tests: it contains drills that do **not** end with a shot, and one with
more passes than the removed four-pass cap allowed.

### Done — the library

A full-screen surface with search, sort (featured / newest / shortest / A–Z),
and filters for age band, rink area, no-goalie, no-equipment, duration and
starred. One column on a phone, two on a tablet, three on a desktop.

Filters compose the way people expect: **AND across filters, OR within one**, so
adding a second age band widens and adding a rink area narrows. Getting that
backwards makes a library feel broken in a way that is hard to articulate, and
there is a test for each direction.

Featured order is deliberate rather than arbitrary: easiest-to-run first
(beginner, less equipment, shorter), so a coach opening the library for the
first time is not met with an elite full-ice system drill.

Templates are immutable. **Use drill** projects to the runtime shape, re-issues
every id, and opens a copy — so editing a drill cannot reach the catalogue.
Two e2e tests cover that, one of which reads IndexedDB to confirm the copy has
fresh ids throughout.

Favourites persist in `localStorage`, and a browser with storage disabled gets
a library that forgets its stars rather than one that refuses to open.

The library and the catalogue are **lazy chunks** (11 KiB and 33 KiB). Splitting
them took the startup bundle from 521 KiB back to 455 KiB, so a coach who never
opens the library does not pay for it. The budget baseline was raised
deliberately, with the reason recorded in the file — the check sums every
chunk, so the total still rose even though startup did not.

### Done — generated thumbnails

Each card carries a diagram drawn from the drill itself: routes in cyan,
passes dashed gold, shots orange, players as numbered tokens.

The interesting part is the framing, which is separated from the drawing so it
can be tested without a canvas. A quarter-ice battle drawn on a full sheet is
four specks in a white rectangle and every card looks identical, so the view is
the drill's own bounding box, padded, grown to a minimum extent so two players
do not become a close-up, widened to the card's shape, and clamped back inside
the boards. 72 tests assert that every drill in the catalogue is fully
contained, stays inside the boards, and matches the card aspect.

The markings are deliberately simplified - at card size the full renderer's
hash marks and faceoff detail are noise - and players are numbered tokens
rather than sprite crops, which are a smudge at 20px.

Drawing degrades to `null` without a 2D context rather than throwing, so a
headless environment gets a card with no picture instead of a crash. Results
are cached per drill and size.

Equipment is not drawn yet: it is dropped by the v2 projection, so the tire
and cone drills show their players and passes but not their gear.

### Not done

Equipment in thumbnails, an animated preview in the details view, practice
plans, share links and PDF/print export.

## Phase 6 — PWA 🔶 offline done, packaging not started

### Done — the offline claim is now true

`index.html` advertised "Works offline" with no manifest and no service
worker. IndexedDB kept a coach's DRILLS on the device, but a cold reload with
no network could not fetch the application, so the claim failed in exactly the
situation it was for: an arena with no signal.

- A web manifest, so a browser will offer to install it.
- A hand-written service worker that precaches from **Vite's build manifest**,
  including the lazy chunks, and serves hashed assets cache-first.
- An update prompt that never applies itself.

Four e2e tests, the important one being a genuine `setOffline(true)` cold
reload asserting the app AND the saved drills come back, plus one that opens
the drill library offline — half a product appearing is worse than an honest
failure.

Three bugs this shook out, all invisible until the network was actually pulled:

1. **A worker cannot intercept the requests that loaded the page which
   registered it.** Relying on runtime caching alone left the entry bundle
   uncached after a first visit. Fixed by precaching the real build manifest.
2. **`caches.match(request)` missed where `caches.match(url)` hit.** A dynamic
   `import()` carries different headers from the `fetch()` that filled the
   cache. The symptom was baffling: the app booted offline while every lazily
   loaded screen died, with `fetch()` returning 200 for the same URL.
3. **The first install fires `controllerchange`**, so the reload-on-update
   handler reloaded the page on every first visit.

And one caught by the suite rather than by reasoning: the "saved on this
device" banner sat on top of the tool dock, covering Move, Pass, Skate, Add and
Play on a coach's first visit. It is now announced to assistive tech only, and
the update prompt lives in the chip lane clear of every control.

### Not done

Capacitor packaging, install prompts beyond the browser's own, optional cloud
sync and backup, privacy/terms/support copy, and release monitoring.

## Things this environment cannot verify

Stated so no acceptance criterion is silently marked green:

- **Real-device testing** on iPhone-class, compact 320px, tablet and mid-range
  Android hardware. Playwright viewport emulation is not the same claim.
- **3D memory, load time and frame rate on actual phones.**
- **Any 3D asset production.**
- **Cloud sync**, which needs a backend that does not exist.

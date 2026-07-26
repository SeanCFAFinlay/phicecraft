# PhiceCraft — Hockey Drill Designer

Design, animate and review hockey drills on a full-size NHL rink. Local-first:
no account, no server, and it keeps working offline.

The mechanics runtime compiles authored routes and puck actions into
deterministic skater, possession, pass/reception, loose-puck and shooting
frames. See [docs/MECHANICS_BASELINE.md](docs/MECHANICS_BASELINE.md) for the
runtime contract and diagnostics workflow.

---

## Quick start

```bash
npm ci            # install
npm run dev       # development server on :3000
npm run build     # production build
npm run preview   # serve the production build
```

### Checks

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # eslint, zero warnings allowed
npm run test             # unit and component tests
npm run test:watch       # the same, in watch mode
npm run test:coverage    # with the coverage gates
npm run test:e2e         # Playwright: flows, mobile, viewports, axe, performance
npm run test:visual      # Playwright screenshot comparison (see note below)
npm run check:budgets    # asset and bundle budgets (run after a build)
npm run assets:optimize  # regenerate runtime images from assets-src/
```

`npm run test:e2e` needs a browser once: `npx playwright install --with-deps chromium`.

---

## Using it

### On a phone

The shell is mobile-first. Five controls are always one tap away:

| Control | What it does |
| --- | --- |
| **Select** | Tap to select, drag to author. This is the tool you want most of the time. |
| **Add** | Opens Home / Away / Goalie / Coach, then tap empty ice to place. |
| **Action** | Opens Route / Pass / Shoot for the selected player or the puck carrier. Pass and Shoot are also on the rink itself — see below. |
| **Erase** | Tap a player, coach, route or puck line to remove it. |
| **Play** | Runs the drill. |

Everything else lives in a sheet: the menu (top-left), More (top-right), the
expanded playback controls (the ⤢ on the transport), and the details of whatever
is selected.

Tapping a player **selects** it and shows a compact chip with **Move**,
**Details** and **Delete**. It does not throw a panel over the rink — Details
does that, and so does tapping the same player a second time.

Whenever an action is waiting for you, a chip at the top of the rink says which
player it is for, what to do next, and offers **Cancel**. Escape cancels it too.

### Passing and shooting

**Pass** and **Shoot** sit on the rink next to the puck chip, so they are one
tap away whether or not anything is selected — they act on whoever is carrying.
They also appear on the selection chip when the selected player has the puck.

**Shoot** takes effect immediately: a team attacks exactly one net, so there is
nothing to aim. **Pass** arms the pass, and you tap the receiver.

A drill holds **four passes**. The Pass button shows how many are left and goes
dead at the cap; finish with a shot, or split the drill in two. Each pass hands
the selection to the receiver, so a four-pass chain is four taps of Pass and a
tap on each target rather than a hunt for the new carrier every time.

### Authoring

| Gesture | Result |
| --- | --- |
| Drag any player | Draws their skating route |
| Drag the puck carrier onto a teammate | A pass |
| Drag the puck carrier toward a net | A shot, starting from their final route position |
| Drag the puck carrier onto open ice | A dump; assign a receiver later from the event details |
| Drag from a point on a route | Releases the puck at that moment in the drill |
| Tap **Move**, then tap the ice | Puts that player where you tapped |
| Tap **Move**, then drag the player | Repositions with no hold first |
| Drag a handle on a selected line | Reshapes it, one point at a time |
| Tap a **+** between two handles | Adds a point there |
| Tap a handle a second time | Removes that point |
| Hold a player for 0.7 s | Repositions them (the same as pressing **Move**) |
| Pinch, or scroll | Zoom |
| Drag empty ice | Pan the rink, or orbit it in the 3D view |

### Adjusting a line afterwards

Selecting a route or a puck line puts a gold handle on each of its editable
points, with a **+** between neighbours. Drag a handle to move that one point;
the rest of the line stays where you put it. Both kinds of line can be
**Curved** (a spline that bends smoothly through every point) or **Straight**
(sharp corners), from the shape control in Details.

A drawn route is reduced to around ten editable points rather than the hundreds
of raw pointer samples, so there is something to grab.

Bending a puck line is not decoration: **the puck flies the line you drew**. A
longer line therefore takes longer to arrive, and the flight window widens in
proportion so the authored puck speed is preserved. The event details report how
far the puck actually travels.

An ordinary pass goes to a **teammate**. Dragging onto an opponent is not a pass
and is refused with an explanation, on every path — tap, drag, retarget and
dump conversion alike.

### Keyboard

| Key | Action |
| --- | --- |
| `Escape` | Cancel the pending action, or close the topmost panel |
| `Space` | Play / pause, unless you are typing |
| `Ctrl`/`⌘` + `Z` | Undo (add `Shift`, or use `Ctrl`+`Y`, to redo) |
| `Ctrl`/`⌘` + `S` | Save |
| `P` | Pass from whoever has the puck |
| `S` | Shoot from whoever has the puck |
| `R` | Draw a route for the selected player |
| `Enter` | Open the details of the current selection |
| `Tab` | Move through the controls; focus is trapped inside an open sheet or dialog |

---

## Saving and recovery

Your drills live in IndexedDB on this device. The top strip always states which
of these is true:

| Status | Meaning |
| --- | --- |
| **Saved** | Everything on screen is durable. |
| **Unsaved changes** | An edit is pending; auto-save writes it after a second of quiet. |
| **Saving…** | A write is in flight. |
| **Save failed** | It did **not** save. Stays on screen with **Retry** and **Export** until you resolve it. |

Nothing is reported as saved until the database has confirmed it, and no visible
document is replaced until its replacement is durable — so a failed *Save as a
new play* leaves you editing the original, and a failed delete leaves the play
exactly where it was.

**If something cannot be read** — a corrupt record, a broken import, a play you
deliberately replaced — the original value is kept verbatim. Menu → **Download
recovery data** writes all of it to a JSON file.

**If the app crashes**, the error screen offers to export the drill you were
working on before anything else, because that copy may only exist in the tab.
*Reset interface state* clears interface preferences only and never touches your
saved plays.

Drills from an older version of PhiceCraft are migrated automatically on first
run, in one transaction, and read back before the migration is marked complete.
The old `localStorage` data is left in place as a backup.

---

## Importing and exporting

**Export all plays (JSON)** flushes your current work first. If that flush
fails, you are asked explicitly whether to export the unsaved revision anyway;
choosing to do so labels the file, and its name, as containing unsaved work.

**Import from a file** shows a preview before writing anything. Every entry
defaults to **Import as a copy**: a drill from a file gets a fresh identity, and
its players, coaches, routes and events are all re-identified so it can never
collide with your library.

If a file shares an ID with one of your plays, the preview names your local play
and offers **Replace matching drill**. Replacement only happens when you choose
it, and a recovery copy of your version is kept either way.

Files are bounded: 10 MiB, 100 drills per import, 200 players, 500 routes and
1,000 events per drill, 5,000 points per route, 50 bend points per puck line. Anything that fails is reported
per entry and kept for recovery — the rest of the file still imports.

---

## Architecture

```
src/
├── camera/       CameraStore and the fit/zoom maths
├── canvas/       Canvas rendering (rink, players, paths, coaches)
├── commands/     THE single authoring path every view calls
├── components/   React UI: shell, sheets, inspectors, a11y primitives
├── core/         Types, constants, the state reducer
├── editor/       Input state machine, generated instructions, validation cache
├── engine/       Hockey rules: puck, playback, drill, validation
├── fixtures/     Example drills
├── persistence/  IndexedDB repository, import/export, migration, recovery
├── playback/     Frame store and the requestAnimationFrame clock
├── sim/          The deterministic simulation
├── ui/           Dialog controller, announcer, responsive, download
└── utils/        Geometry and IDs
```

**Who owns what.** The reducer owns the persisted drill and the low-frequency
editor session. The camera and the playback frame live in external stores read
through `useSyncExternalStore`, because they change on every pointer move and
every animation frame respectively. Pointer state lives outside React entirely.
Nothing that changes 60 times a second is allowed to republish application
state.

**One command path.** Views never implement hockey rules or persistence
transitions. They call `src/commands`, which owns validation, undo boundaries,
persistence status, cancellation, feedback and the exact wording of every
destructive confirmation.

**Two canvas layers.** A static rink that repaints only when the camera,
viewport or quality changes, and a dynamic game layer for everything that moves.
The rink is not repainted during camera-stable playback.

**Playback is a pure function of `(drill, progress)`.** The clock advances one
number; positions, the puck and fired events are re-derived. Nothing in playback
writes to the drill, which is what makes scrubbing backwards work and stops an
interrupted playback from persisting an animation frame as real state.

---

## Testing

```bash
npm run test:coverage   # 641 unit and component tests, with gates
npm run test:e2e        # 113 end-to-end tests across 7 viewports
npm run test:visual     # 36 screenshot comparisons
```

Coverage gates: 90 % lines and branches for `src/persistence`, 90 / 85 for
`src/commands`, 80 % lines overall for the included modules.

The end-to-end suite covers the required flows — persistence across a reload,
route semantics through a copy, ID-less and colliding imports, cross-team pass
rejection, pinch-release safety, every Play surface, the separate clears,
keyboard navigation with focus restoration, review completion — plus a viewport
matrix, axe on every dialog surface, and the performance assertions.

> **Visual tests are not run by CI.** Playwright screenshot baselines are
> per-platform bitmaps, and this repository carries the ones generated on
> Windows. Run `npm run test:visual` on that platform; after an intentional
> design change, `npm run test:visual:update`.

---

## Assets

Source artwork lives in `assets-src/`, outside `public/`, so it is never copied
into a production build. `npm run assets:optimize` regenerates the committed
runtime images with `sharp`; the outputs are committed, so a normal build does
not need it.

`npm run check:budgets` fails the build if runtime images exceed 1 MiB, the logo
exceeds 50 KiB, source-only artwork appears under `public/`, source maps are
present in `dist/`, or the bundle grows more than 15 % past the recorded
baseline.

Production source maps are off by default. Build with
`PHICECRAFT_SOURCEMAP=true npm run build` when you need them.

---

## Supported browsers

Chrome, Edge, Firefox and Safari, current and previous major versions, on
desktop, iOS and Android. The app needs IndexedDB, Canvas 2D, `ResizeObserver`,
`structuredClone` and WebP; if IndexedDB is unavailable it says so and keeps
export working rather than pretending to save.

Browser zoom is enabled. Safe-area insets are respected on notched devices.
`prefers-reduced-motion` is honoured throughout.

---

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Canvas 2D · IndexedDB (`idb`) ·
`zod` · Vitest · Playwright

## License

MIT

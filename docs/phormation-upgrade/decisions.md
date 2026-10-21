# PHormation / PHiceCraft Upgrade — Material Decisions

This record tracks material architecture, compatibility, and design choices made during the upgrade.

---

## Decision 1: Shared Invalidation Scheduler & Gesture Transactions
- **Context:** Dragging coaches, route handles, and event handles previously committed document changes on every frame, generating spurious undo states and heavy re-renders. Pointer move previews also repeatedly dispatched redundant pending-action updates. Redraws were fired directly by multiple subscribers.
- **Decision:**
  1. Introduce an `InvalidationScheduler` that coalesces redraw requests (`requestStatic()`, `requestDynamic()`) via `requestAnimationFrame` to at most once per display frame, preserving dirty flags.
  2. Implement an idempotent `setPendingAction` guard that skips dispatch if action kind and target player/coach/event ID are identical.
  3. Extend `GestureStateMachine` and `CanvasSurface` gesture handling to keep route handles, event handles, and coaches in transient local preview state during drag, committing exactly one semantic transaction and one undo entry upon release (`pointerUp`), with clean cancellation on Escape/cancellation.

## Decision 2: Frame Pacing & Quality Governor
- **Context:** Quality adaptation measured only the synchronous execution time of `drawDynamicLayer`, missing dropped frames caused by GPU bottlenecks or compositor stalls.
- **Decision:**
  - Track complete frame-to-frame delta time (`performance.now()` delta across consecutive animation frames) in addition to paint execution time.
  - Apply sustained pressure thresholds and hysteresis (e.g. 30 consecutive over-budget frames to degrade, 120 smooth frames to recover) to avoid rapid fluttering between quality tiers.

## Decision 3: Practice Storage & Canonical Revision Pinning
- **Context:** Practices lived in `localStorage` without transaction safety, re-seeded demo data if the user emptied the list, and could only reference catalog templates, not saved personal drills. Furthermore, editing a drill would unpredictably affect practices referencing it.
- **Decision:**
  - Move practice persistence into IndexedDB (`drills` / `practices` stores in `phicecraft` DB v3) behind a validated repository interface, maintaining backward compatibility with existing `localStorage` data via an idempotent migration on first startup.
  - Distinguish truly empty state from uninitialized storage. Once initialized, deleting all practices leaves an empty array (`[]`), never re-seeding presets.
  - Practices store blocks with a `pinnedRevision`: an immutable snapshot of the drill revision (`DrillDocumentV3`) at the time it was attached. If the user edits the source drill, the practice continues to use its pinned revision until the coach explicitly chooses to update it.

## Decision 4: Concurrency-Aware Practice Timing & Equipment Demand
- **Context:** ADM station blocks run concurrently (e.g. 3 stations on ice simultaneously for 10 minutes = 10 minutes total ice time, not 30). Cones and tires used in different non-overlapping blocks are reusable and do not add up.
- **Decision:**
  - Formalize practice block models to represent:
    - Sequential blocks (e.g. Warmup, System, Scrimmage).
    - Station groups with rotations (e.g. 3 stations, 2 rotations of 8 mins each + changeover).
    - Duration = `rotations * max(station_durations) + changeover_time`.
  - Calculate equipment demands distinguishing consumable items (pucks) from reusable equipment (cones, tires, barriers, mini-nets). Reusable demand is calculated as the peak concurrent reservation across overlapping stations/blocks, including retained setups.

## Decision 5: Bounded Service Worker Fallback for Unreliable Networks
- **Context:** When a coach connects at a rink with poor/spotty cellular reception, navigation requests hung indefinitely waiting for the network before falling back to cached HTML.
- **Decision:**
  - In `public/sw.js`, wrap the network navigation fetch with a 2.5-second timeout. If the network does not respond with an OK response within 2.5s or fails, serve the cached `/index.html` immediately.
  - Validate responses (`response.ok === true`) before updating the cache.

## Decision 6: Local Domain Intelligence & Recommendation System
- **Context:** Coaches need immediate feedback on drill timing (e.g., pass arrival vs. receiver arrival), missing goalies, and space conflicts, without requiring an external cloud or AI service.
- **Decision:**
  - Build a deterministic local validation engine that calculates exact pass/receiver arrival times, checks for role prerequisites (e.g., drills requiring goalies or defensemen), and identifies simultaneous equipment/station conflicts.
  - Provide actionable proposals (e.g. delay pass by X seconds, adjust receiver start) as single-click undoable transactions.
  - Implement a fully offline, transparent recommendation and ranking engine using skill tags, age/skill level, available ice footprint, and equipment constraints.

## Decision 7: Practice Bundle Export & Restoration
- **Context:** Practice plan JSON export had no import or restore mechanism, making it impossible to share or restore plans across devices.
- **Decision:**
  - Design a versioned `PracticeBundle` format (`v1`) containing metadata, practice definition, and all pinned drill snapshots.
  - Implement an `importPracticeBundle` service that validates schemas with Zod, checks for collisions, remaps IDs if requested, and provides an import preview.

## Decision 8: Grounded Assistant & Presentation Enhancements
- **Context:** AI features must not fabricate drills or hallucinatory advice, must never send sensitive keys to client bundles, and must operate cleanly with an unconfigured state when no API provider is configured.
- **Decision:**
  - Implement a provider-neutral assistant adapter interface with structured, allowlisted proposals (bounded modifications: drill search, block allocation fit, cue drafting).
  - Explicitly show an unconfigured state when no provider credentials exist, with zero fake responses.

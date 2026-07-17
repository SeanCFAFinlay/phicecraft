# PhiceCraft Drill Creator — Product and Engine Plan

## 1. Product definition

PhiceCraft should be a hockey coaching tool, not a freehand animation toy. A coach should be able to describe a real drill in the same order it happens on the ice:

1. Choose the rink area and drill duration.
2. Place players, goalies, coaches, pucks, cones, and obstacles.
3. Assign the initial puck carrier.
4. Draw each skater's route.
5. Place puck actions at exact moments on those routes.
6. Preview the complete drill, correct mistakes, and save or share it.

Every visual element must have one clear hockey meaning. Every interaction must either create, select, edit, sequence, or remove a drill object.

## 2. Non-negotiable engine rules

### Regulation geometry

- The world coordinate system remains true scale: 1 ft = 5 world units.
- The NHL sheet remains 200 × 85 ft with 28-ft corners.
- Goal lines, blue lines, neutral zone, circles, spots, creases, trapezoids, nets, boards, benches, penalty boxes, and glass use regulation dimensions.
- Objects use hockey dimensions internally, with a minimum screen size only for touch accessibility.
- Full-rink, half-rink, offensive-zone, defensive-zone, and custom-area views use the same world coordinates. Changing view never changes drill geometry.

### Possession

- An editable drill always has exactly one initial puck carrier.
- A pass transfers possession only when it reaches a receiving player.
- A shot releases possession and ends that puck sequence.
- A dump releases possession but does not necessarily end the drill. A later `pickup` event can establish the next carrier.
- A loose puck must be represented as a puck object with a world position; it must never silently disappear.
- The possession bar, player marker, puck location, and event timeline must always agree.

### Time and sequencing

- Replace evenly spaced events with explicit event times in seconds.
- Every skate path has a start time, duration, speed profile, and optional wait segments.
- Every puck event has an exact time and exact source/target points.
- A pass created from a route point automatically receives the time at which the passer reaches that point.
- A pass to a receiver route targets a route point and time, not merely the receiver's starting token.
- The engine validates that passer, receiver, and puck can physically reach their event points at the event time.
- Scrubbing, playback, and export are pure derivations of `(drill, time)`.

### Skating

- Skaters accelerate, glide, turn, coast, and decelerate; they do not slide at constant speed.
- Route length and duration determine speed in ft/s.
- Turns have a practical minimum radius and apply a speed penalty when too sharp.
- Player facing follows the path tangent.
- Backward skating, pivots, stops, and stationary waits are explicit route segment types.
- Goalies support crease movement, shuffle, butterfly/set, and recovery segments separately from normal skating.

## 3. Core data model

The next model version should be `phicecraft.drill.v2`.

### Drill

- `id`, `name`, `description`, `tags`, `ageGroup`, `skillLevel`
- `rinkMode`: full, half, offensive, defensive, custom
- `durationSeconds`
- `players`, `routes`, `objects`, `events`, `phases`
- `createdAt`, `updatedAt`, `schemaVersion`

### Player

- Stable ID, team, jersey number, role, handedness
- Starting position and facing
- Initial puck ownership
- Optional label and coaching notes

### Route

- Owner ID
- Ordered typed segments: accelerate, glide, turn, backward, pivot, stop, wait
- World-space control points
- Start time and duration
- Calculated length, average speed, and warnings

### Event

- Types: pass, saucer pass, shot, one-timer, tip, dump, pickup, drop pass, screen, check
- Exact timestamp
- Source entity and world point
- Target entity and world point when applicable
- Puck trajectory: direct, bank, rim, lifted
- Optional velocity and arrival time

### Drill object

- Types: puck, cone, tire, stick, net, mini-net, coach, obstacle, station boundary
- Position, rotation, size, label, and visibility interval

### Phase

- Named time range such as Setup, Breakout, Entry, Attack, Recovery
- Optional color and coaching notes
- Allows multi-stage drills without creating disconnected files

## 4. Primary interaction model

### Default Select tool

- Click player: select and show a compact inspector.
- Drag player: reposition only.
- Drag the route handle from a selected player: create a skating route.
- Click a route: add or select a timed route node.
- Drag from the puck marker or a puck-carrying route node: create a pass, shot, bank, or dump based on release target.
- Click empty ice: deselect.
- Drag empty ice: pan.
- Mouse wheel/pinch: zoom.

This removes the current conflict where dragging a player can mean either moving the player or drawing a route. Movement and route creation need different handles.

### Pass creation

1. Select the puck carrier or click any valid point on the carrier's route.
2. Drag the puck line.
3. Release on:
   - teammate token: pass to that player's position at the event time;
   - teammate route: pass to that exact route point;
   - boards: create a bank or rim preview;
   - open ice: create a dump/area pass and a loose puck;
   - net: create a shot.
4. Show a preview containing action type, event time, flight time, and receiver.
5. Commit on release; Escape/right-click cancels.

### Shot creation

- A shot source is the selected route point; “shoot from final position” is a one-click shortcut.
- Release anywhere inside the goal mouth to set the aim point.
- Shot type options: wrist, snap, slap, backhand, one-timer.
- A shot normally ends the puck sequence but not necessarily player movement.

### Editing

- Selecting an event highlights its source, target, time, and possession effect.
- Drag either endpoint to retarget it.
- Drag the event marker on the timeline to retime it.
- Deleting a pass recalculates all downstream possession and exposes broken events as warnings.
- Every mutation remains one undoable action.

## 5. Screen layout

### Top bar

- Drill name, save state, undo, redo, validation status, export/share.
- No drill-editing actions hidden inside a hamburger menu.

### Left tool rail

- Select
- Add player
- Add goalie
- Add objects
- Route
- Puck action
- Erase

Advanced pass and shot types live in a contextual inspector, not as permanent toolbar clutter.

### Right inspector

- Changes based on selection: player, route, event, object, or drill.
- Contains exact values and hockey-specific options.
- Includes Delete and Duplicate, but keeps destructive actions visually separated.

### Bottom timeline

- Real seconds, not normalized event slots.
- Separate lanes for players, puck, and phases.
- Event markers show pass/shot/pickup icons.
- Play, pause, step, loop, speed, and draggable playhead.

### Canvas overlays

- Active puck carrier label
- Current tool instruction
- Selected object handles
- Timing and validation warnings
- Optional speed, distance, and route-time annotations

## 6. Validation and coaching intelligence

Validation should prevent logical errors while allowing coaches to intentionally design difficult drills.

### Blocking errors

- No initial puck carrier
- More than one initial puck carrier
- Passer does not possess the puck at event time
- Pass or shot source is not on the player's location/route at event time
- Receiver does not reach the pass target at arrival time
- Event references a removed player or route
- Event occurs outside drill duration

### Warnings

- Unrealistic skating speed for selected age group
- Turn radius too sharp for current speed
- Two players occupy the same space at the same time
- Pass crosses an obstacle or exits the playing area
- Goalie movement leaves the crease unexpectedly
- Long idle time or impossible transition between phases

Warnings are explainable and dismissible. The engine should never silently rewrite a coach's drill.

## 7. Playback behavior

- Playback uses seconds as the only clock.
- Players follow route segments with physically plausible easing.
- Sticks and bodies face movement direction; pivots visibly change orientation.
- The puck follows the exact displayed trajectory and arrives at the defined time.
- Possession changes only at puck arrival, not at pass release.
- Loose pucks remain on the ice until pickup or drill end.
- Shot and pass trails can be toggled; route lines can fade during playback.
- Loop can replay the whole drill or one selected phase.
- Slow motion must preserve synchronization rather than recomputing different motion.

## 8. Drill workflow

### New drill wizard

1. Name and rink view.
2. Duration, age group, and skill level.
3. Formation template or blank rink.
4. Place/confirm initial puck carrier.
5. Enter editor with a short contextual prompt.

### Completion checklist

- Initial carrier assigned
- At least one movement or puck action
- No blocking validation errors
- Preview watched at least once (advisory only)
- Notes/objective optional but encouraged

### Save and reuse

- Autosave drafts continuously.
- Explicit Save creates a stable revision.
- Duplicate supports variations.
- Templates support common drill structures.
- Export formats: editable JSON, printable PDF, PNG, and shareable playback link.

## 9. Delivery phases

### Phase 1 — Interaction clarity

- Separate player repositioning from route drawing.
- Add selection handles and contextual inspector.
- Make carrier assignment persistent and obvious.
- Unify pass/shot/dump creation into one drag gesture.
- Add event selection, endpoint editing, and deletion.
- Add focused interaction tests for mouse and touch.

Definition of done: a new user can place players, assign possession, create routes, make a pass, take a shot, undo, and replay without opening instructions.

### Phase 2 — Time-based engine

- Add schema v2 and migration from current drills.
- Replace normalized progress/event spacing with seconds.
- Add route start time and duration.
- Calculate event time from route nodes.
- Add receiver arrival validation.
- Keep all playback derivation pure and deterministic.

Definition of done: moving the playhead to any time always produces the same player positions, puck position, and possession state.

### Phase 3 — Hockey movement model

- Add typed skating segments and realistic speed profiles.
- Add pivots, backward skating, stops, and waits.
- Add goalie movement types.
- Add distance, speed, turn-radius, and collision warnings.

Definition of done: routes read like hockey movement and the same drill remains synchronized at every playback speed.

### Phase 4 — Complete coaching board

- Add coaches, cones, obstacles, extra pucks, mini-nets, and station boundaries.
- Add annotations, numbered steps, phase colors, and drill notes.
- Add formation and drill templates.
- Add full/half/zone printable layouts.

Definition of done: a coach can replace a paper coaching board for common practice planning.

### Phase 5 — Sharing and practice use

- Drill library with search, tags, favorites, and revisions.
- PDF/PNG print export.
- Shareable read-only playback.
- Practice-plan builder containing multiple drills and time blocks.
- Tablet-first presentation mode for use at the rink.

Definition of done: a coach can create a full practice, share it with staff, and present it to players.

## 10. Testing strategy

- Pure engine unit tests: time, position, possession, event validity, migration.
- Reducer tests: every edit, undo/redo, deletion, and reassignment.
- Geometry tests: regulation markings and inside-rink constraints.
- Interaction tests: mouse, pen, and touch gestures.
- Browser tests: create a complete drill from blank, edit it, replay it, save it, reload it.
- Visual regression captures: full rink, zone views, playback, print export.
- Performance target: smooth 60 fps playback with 30 players, 50 objects, and 100 events on a modern tablet.

## 11. Immediate next build

The next implementation should be Phase 1, in this order:

1. Stop overloading player drag; add a dedicated route handle.
2. Create the contextual right inspector.
3. Make event lines selectable and editable.
4. Unify pass/shot/dump creation from the puck or a carrier route node.
5. Add clear invalid-state messages on the canvas.
6. Add browser interaction coverage for the full authoring loop.

Only after that interaction model is stable should the persisted schema move to time-based v2. Otherwise the project risks encoding another temporary UI model into the engine.

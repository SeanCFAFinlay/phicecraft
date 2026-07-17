# PhiceCraft — Hockey Drill Game Mechanics Blueprint

## 1. Product goal

PhiceCraft should let a coach create a simple hockey drill that behaves like hockey when it plays:

1. Players start in formation.
2. One player owns the puck.
3. Players skate assigned routes.
4. The carrier passes, carries, dumps, or shoots.
5. A receiver catches the puck if the pass is reachable.
6. If it is not caught, the puck becomes loose and players chase it.
7. Possession can be recovered and the drill continues.
8. A shot can be saved, miss, rebound, or score.

The product is primarily a deterministic coaching tool. It may look and feel like a game, but the same drill must replay the same way unless the coach explicitly enables a variation or defensive reaction.

## 2. Why the current mechanic fails

The present engine treats player routes and puck lines as related drawings rather than one synchronized simulation. Predicting the receiver's position is not sufficient by itself. The receiving player can still skate through the visual puck because there is no authoritative catch state shared by the puck and player.

The corrected system needs these invariants:

- A pass has one release time and one arrival time.
- The receiver has one catch point and one catch window.
- The receiver's route must place the player inside that window.
- At catch time, puck position and receiver stick position are identical.
- Possession changes exactly once, at the catch.
- After the catch, the puck is attached to the receiver until another release.
- A failed catch creates a visible loose puck instead of silently transferring possession.

## 3. Simulation clock

All mechanics must use a single drill clock measured in seconds.

- Drill duration: for example, 12.0 seconds.
- Player routes: start time, segment times, and end time.
- Puck actions: release time, flight duration, arrival time.
- Catch windows: earliest and latest valid catch time.
- Shots, rebounds, and pickups: exact event times.
- Playback speeds only scale presentation time; they do not change simulation results.

Normalized `0–1` progress may still be used by the UI, but engine calculations must convert it to seconds before evaluating mechanics.

## 4. Puck state machine

The puck is a first-class simulation entity, not an icon derived from the last event.

### States

#### Possessed

- `carrierId` is required.
- Puck position is attached to the carrier's stick socket.
- Puck velocity is inherited from the player.
- Only the carrier can initiate a pass, shot, dump, or drop.

#### In flight

- Records the source, target, trajectory, release time, arrival time, and intended receiver.
- Puck position is evaluated along the authoritative trajectory.
- The puck has no carrier during flight.
- The intended receiver prepares for the catch.

#### Catchable

- Begins shortly before arrival and ends shortly after it.
- The receiver's catch volume and puck position are tested.
- A successful catch transitions to `possessed` by the receiver.
- A miss transitions to `loose`.

#### Loose

- Puck has position, velocity, friction, and optional board rebounds.
- Nearby eligible players can pursue it.
- The first player whose pickup volume reaches it gains possession.
- Loose-puck behavior remains deterministic by default.

#### Shot

- Specialized in-flight state aimed at a net target.
- On arrival, resolves to goal, save, rebound, post, wide, or blocked.
- A goal ends the scoring sequence.
- Save/rebound/wide outcomes create goalie possession or a loose puck.

#### Dead

- Used only when the drill explicitly ends, a goal is scored, or the coach inserts a whistle.

## 5. Player state machine

Each player needs an intention state and a movement state.

### Intention states

- `waiting`: hold position until a cue.
- `skating_route`: follow the authored route.
- `carrying`: follow route while controlling puck.
- `preparing_receive`: face puck, present stick, and adjust speed toward catch point.
- `receiving`: lock puck and stick together during the catch animation.
- `chasing_loose_puck`: temporarily leave or bend the route toward a loose puck.
- `shooting`: plant, load, release, and recover.
- `screening`: hold or adjust position near the crease.
- `defending`: optional reaction behavior for future phases.
- `finished`: completed assigned action and waiting.

### Movement states

- accelerate
- forward stride
- glide
- crossover turn
- backward skate
- pivot
- stop
- stationary
- goalie shuffle
- goalie set/butterfly/recovery

The player renderer uses movement state and route tangent to choose facing, stride animation, lean, stick position, and skate marks.

## 6. Pass and receive mechanic

### Authoring a pass

1. Coach selects or drags from the current carrier.
2. Coach chooses a release point on the carrier's route.
3. Coach drags to a teammate or a point on the teammate's route.
4. Engine calculates:
   - carrier arrival at release point;
   - puck flight duration;
   - receiver arrival at candidate catch point;
   - catch timing error;
   - required receiver speed adjustment.
5. Preview shows `GOOD`, `LATE`, `EARLY`, or `UNREACHABLE` before commit.
6. Coach can accept the pass, move the catch point, or use `Auto-sync receiver`.

### Successful catch rule

A catch succeeds only when all are true:

- The intended receiver is within the catch radius.
- The receiver is inside the catch-time window.
- The receiver is facing within an allowed angle toward the puck or has time to turn.
- Puck speed is below the allowed reception threshold for the selected pass type.
- No obstacle or player blocks the path when collision rules are enabled.

### Catch assistance

For a deterministic coaching drill, default assistance should be enabled:

- Receiver adjusts the final portion of the route toward the catch point.
- Receiver can speed up or slow down within realistic limits.
- Receiver rotates shoulders and stick toward the incoming puck.
- A catch animation magnetizes only the final small distance, never the entire pass.
- The inspector displays how much correction was applied.

### Failed pass

When the coach disables assistance or creates an unreachable pass:

- The puck continues through the target point.
- Receiver does not gain possession.
- Puck becomes loose with remaining velocity.
- Nearest assigned player can chase automatically or the coach can author the recovery.
- Timeline displays a red `MISS` marker.

### Pass types

- Direct pass: straight ice-level trajectory.
- Lead pass: targets a future route point.
- Saucer pass: lifted arc; ignores low obstacles.
- Bank pass: reflects from a selected board point.
- Rim: follows the boards around the end zone with board friction.
- Drop pass: puck is released at low speed for a trailing player.
- Area pass/dump: no guaranteed receiver; creates a loose puck.

## 7. Loose puck and chase mechanic

The drill cannot feel like hockey without loose-puck recovery.

### Recovery policy

Every loose-puck event has one of three modes:

- `authored`: coach selects which player retrieves it and draws the recovery route.
- `nearest teammate`: closest eligible teammate reacts automatically.
- `competitive`: nearest player from either team reacts based on distance, facing, acceleration, and role.

### Chasing behavior

- Player turns toward the predicted puck position, not its current position.
- Player accelerates along a temporary pursuit curve.
- Original route pauses, bends, resumes, or ends according to the event setting.
- Pickup happens at the stick, not the player center.
- Possession indicator changes only when pickup completes.

### Boards

- Loose puck reflects from board normals.
- Speed decreases according to board and ice friction.
- Corner rebounds follow the curved board geometry.
- The displayed loose-puck trail matches the simulation path.

## 8. Carrying and stick position

The puck should not render in the middle of the player token.

- Every player pose exposes a stick-blade socket.
- Possessed puck follows the blade socket.
- During forward skating, the stick alternates between forehand control positions.
- Approaching a pass release, the carrier draws the puck toward the release side.
- During reception, the receiver's blade moves toward the catch point.
- During a shot, the puck separates at the release frame.
- Left/right handedness changes stick side and shooting animation.

## 9. Shooting and scoring

### Shot authoring

1. Select the carrier or a point on their route.
2. Drag into the goal mouth.
3. Choose shot type or accept automatic type.
4. Engine displays release time, distance, angle, and traffic.
5. Shot result is deterministic and editable.

### Shot results

- Goal
- Goalie save and freeze
- Goalie save and controlled rebound
- Rebound into a chosen zone
- Post/crossbar
- Wide
- Blocked by defender

### Goalie

- Goalies are not normal skater tokens.
- They track puck angle, shuffle within crease, set for shot, and react.
- Coach can author goalie movement or enable basic automatic tracking.
- Save result can be fixed by coach to keep drill playback deterministic.

## 10. Interactive authoring workflow

The editor should use four clear steps. A coach can return to any step without losing work.

### Step 1 — Setup

- Choose full rink, half rink, or zone.
- Set drill length, age group, and skill level.
- Place players, goalies, coaches, cones, and pucks.
- Assign exactly one initial puck carrier.
- UI checklist prevents moving forward with no carrier.

### Step 2 — Movement

- Select a player.
- Drag player to set starting position.
- Drag dedicated skate handle to create route.
- Inspector shows route length, duration, average speed, and warnings.
- Add waits, pivots, stops, and backward sections from route-node controls.

### Step 3 — Puck actions

- Puck-action handle appears only on the active carrier or their route.
- Drag to teammate, teammate route, boards, open ice, or net.
- Preview pass quality and catch time before commit.
- On commit, possession chain updates and the next carrier becomes available.
- A failed/loose puck prompts `Who retrieves this puck?`.

### Step 4 — Review

- Play, pause, step event-by-event, scrub, and loop.
- Timeline shows player routes, puck actions, catches, loose pucks, and shots.
- Validation panel lists blocking errors and realistic warnings.
- Click any problem to focus the relevant player/event.
- Save, duplicate, print, or share.

## 11. UI layout

### Top workflow bar

- Four steps: Setup, Movement, Puck Actions, Review.
- Active step is obvious.
- Completion check appears on each finished step.
- Drill name, save status, undo, and redo remain visible.

### Left rail

- Contextual tools only for the active step.
- Setup: player, goalie, coach, cone, puck, obstacle.
- Movement: route, wait, pivot, stop, erase.
- Puck actions: pass, bank, dump, shot, pickup.
- Review: validation filters and display options.

### Right inspector

- Player: role, number, team, handedness, route, speed, possession.
- Route node: time, speed, movement type, facing.
- Pass: release, arrival, distance, speed, receiver, catch quality.
- Loose puck: recovery policy and retrieving player.
- Shot: type, release, target, result, rebound.

### Timeline

- Real seconds.
- One lane per active player plus a puck lane.
- Pass bar spans release to catch.
- Catch, pickup, shot, save, rebound, and goal have distinct markers.
- Dragging a marker retimes the event and reruns validation.

### Canvas feedback

- Green receiver ring: catch is synchronized.
- Yellow receiver ring: assisted catch required.
- Red receiver ring: pass will be missed.
- Animated puck preview when hovering a pass target.
- Stick-side catch marker instead of center-of-token marker.
- Clear carrier label and possession chain.

## 12. Graphics plan

### Rink

- Keep regulation 200 × 85-ft geometry.
- Improve ice with subtle skate cuts, resurfacing bands, snow buildup, reflections, and crease wear.
- Add board thickness, kick plate, cap rail, glass panels, stanchions, gates, benches, penalty boxes, and net depth.
- Preserve clean markings and high diagram readability.

### Players

- Replace generic circles during playback with high-quality top-down skater sprites or procedural silhouettes.
- Keep numbered coaching tokens in edit mode for clarity.
- Playback mode adds torso orientation, shoulders, stick, blade, skates, shadow, stride cycle, crossover lean, stop spray, and shooting pose.
- Home/away sweaters remain unmistakable.
- Goalies receive unique equipment silhouette and crease animations.

### Puck

- Increase visibility with a small contact shadow, ice reflection, and optional glow outline.
- Use a trailing streak only while moving quickly.
- Show a catch pulse, stick contact, board impact spark/snow, and goal-net reaction.
- Never use a large puck that destroys scale; visibility assistance should be mostly contrast and motion.

### Camera and presentation

- Edit camera remains clean top-down.
- Playback can optionally use a slight broadcast tilt while retaining rink geometry.
- Smoothly follow the puck or keep full-rink tactical view.
- Provide reduced-effects mode for tablets.

## 13. Data model changes

Introduce `phicecraft.drill.v2` with migration for saved drills.

### Player route

- `startTimeSeconds`
- typed segments
- control points
- duration per segment
- speed limits
- facing mode

### Puck entity

- state
- position
- velocity
- carrier ID
- intended receiver ID
- active trajectory ID

### Puck action

- release time
- arrival time
- release point/stick socket
- target point/stick socket
- pass type
- trajectory points
- expected result
- catch tolerance
- assistance mode

### Catch event

- intended receiver
- catch point
- catch time
- catch result
- timing error
- position error

### Loose-puck event

- initial position and velocity
- friction/board settings
- recovery policy
- eventual pickup event

## 14. Engine architecture

Keep the engine deterministic and pure.

```text
Drill definition + simulation time
        ↓
Evaluate authored player intentions
        ↓
Evaluate player poses and stick sockets
        ↓
Evaluate puck state/trajectory
        ↓
Resolve catches, misses, pickups, shots
        ↓
Return immutable simulation frame
        ↓
Canvas renders that frame
```

The renderer must never decide possession. React components must never calculate pass physics. All results come from the simulation frame.

## 15. Validation rules

### Blocking errors

- No initial carrier or multiple initial carriers.
- Passer does not own puck at release.
- Receiver does not exist.
- Catch occurs before pass release.
- Two possession owners at the same time.
- Puck trajectory has no valid terminal state.
- Shot has no valid net target.

### Warnings

- Receiver needs unrealistic speed adjustment.
- Pass speed unsuitable for age group.
- Receiver faces away from pass.
- Catch point lies outside rink.
- Player collision at catch point.
- Route is too sharp for speed.
- Loose puck has no recovery assignment.

## 16. Example drill behavior

### Two-player give-and-go

1. #11 begins as carrier.
2. #11 and #13 accelerate on authored routes.
3. At 1.8s, #11 releases a lead pass.
4. Engine calculates #13's reachable catch point at 2.2s.
5. #13 adjusts stick and final route segment.
6. At 2.2s, puck and stick meet; #13 becomes carrier.
7. #11 continues toward net.
8. At 3.4s, #13 passes to #11's return route.
9. #11 receives at 3.8s and shoots at 4.4s.
10. Goalie reacts; result is configured as goal or save/rebound.

At every step, the player marker, stick, puck, possession bar, event inspector, and timeline show the same state.

## 17. Delivery plan

### Phase A — Fix reception completely

- Create authoritative puck entity and possession state.
- Add explicit catch event and catch window.
- Add stick socket to player pose.
- Make receiver catch animation lock puck to stick.
- Add pass-quality preview.
- Add miss-to-loose transition.

Definition of done: a moving receiver either visibly catches the puck at the line endpoint or clearly misses it; the puck never passes through a player while possession changes invisibly.

### Phase B — Loose puck and recovery

- Add loose puck motion and ice friction.
- Add board collisions and curved-corner rebounds.
- Add pickup volumes.
- Add authored, nearest-teammate, and competitive recovery modes.
- Resume or replace player route after recovery.

Definition of done: every missed pass, dump, rebound, and wide shot produces a puck that can be chased and recovered.

### Phase C — Time-based authoring UI

- Add four-step workflow bar.
- Replace event-slot timing with seconds everywhere.
- Add player and puck timeline lanes.
- Add drag-to-retime.
- Add catch-quality feedback and auto-sync.

Definition of done: a coach understands who moves, who owns the puck, when each action happens, and whether the pass can be completed before pressing Play.

### Phase D — Shooting, goalie, scoring

- Add shot types and net target zones.
- Add goalie tracking and authored saves.
- Add goals, freezes, rebounds, posts, blocks, and misses.
- Add net animation and scoring feedback.

Definition of done: a drill can progress through passes and recoveries to a meaningful shot result.

### Phase E — Graphics and presentation

- Add edit/play visual modes.
- Add detailed top-down skater and goalie rendering.
- Add stride, crossover, reception, shooting, stop, and goalie animations.
- Add enhanced puck, ice, boards, glass, nets, snow, and lighting.
- Add camera-follow and tactical playback modes.

Definition of done: the drill remains readable as a coaching diagram and becomes visually convincing in playback.

### Phase F — Coaching objects and practice plans

- Cones, coaches, obstacles, extra pucks, station zones, and mini-nets.
- Notes, objectives, teaching points, and age/skill metadata.
- Templates and practice-plan builder.
- PDF, PNG, JSON, and shareable playback export.

## 18. Test plan

### Engine tests

- Puck stays attached to carrier stick before release.
- Pass release occurs at exact authored time.
- Puck and receiver stick positions match at successful catch.
- Possession changes once at catch.
- Failed catch does not transfer possession.
- Failed catch creates a loose puck with correct velocity.
- Pickup changes possession once.
- Board reflections preserve correct normal direction and reduce speed.
- Shot result creates goal, save, or loose rebound correctly.
- Scrubbing backward and forward returns identical frames.

### Interaction tests

- Complete four-step drill from blank rink.
- Create reachable moving-player pass.
- Create unreachable pass and use auto-sync.
- Create deliberate miss and assign recovery.
- Pass twice and shoot.
- Edit catch point and verify downstream timing updates.
- Undo/redo each action.
- Repeat with mouse, pen, and touch.

### Visual tests

- Carrier marker and puck align.
- Pass line endpoint aligns with receiver stick.
- Catch/miss colors are legible.
- Player orientation follows route.
- Puck remains visible on light ice.
- Full-rink and zone views preserve regulation layout.

## 19. Recommended immediate implementation order

1. Add player stick sockets to simulation poses.
2. Replace derived puck icon with a persisted simulation puck state.
3. Add explicit `catch` result to passes.
4. Evaluate catch radius and timing at every pass arrival.
5. Attach puck to receiver only after successful catch.
6. Create loose puck after a miss.
7. Add `Auto-sync receiver` and catch-quality preview.
8. Add pickup events and chase behavior.
9. Build the four-step authoring workflow.
10. Upgrade playback graphics after the mechanics are stable.

Graphics should follow the mechanic work, because animation needs authoritative states such as preparing, catching, missing, chasing, shooting, saving, and scoring. Building visuals before those states exist will recreate the current mismatch in a more attractive form.

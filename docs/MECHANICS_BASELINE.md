# PHICECRAFT Mechanics Baseline

The drill creator uses one authored `Drill` document and one deterministic simulation compiled from it. Editor gestures mutate authored players, routes, and puck events. Playback never writes simulation positions back into the drill.

## Runtime contract

- World scale: five Canvas units equal one foot.
- Regulation surface: 200 by 85 feet with 28-foot rounded corners.
- Simulation sampling: deterministic fixed-step puck integration at 120 Hz.
- Skaters: accelerate, cruise, turn, brake, and stop independently according to route length.
- Puck ownership: zero or one carrier. A release clears ownership; a catch or pickup assigns it once.
- Pass: release point to moving receiver blade, followed by a single arrival-time catch evaluation.
- Loose puck: independent velocity, friction, rounded-board rebounds, and optional nearest-teammate collection.
- Shot: one release ending as goal, save, rebound, wide, or post.
- Lifecycle: ready, active, success/failure, then retained review frame until reset.

## Regression story

The fixture in `src/fixtures/giveAndGo.v1.ts` represents #11 passing to moving #13, who receives at the blade and shoots. It is the minimum end-to-end flow for mechanics changes.

## Diagnostics

The **HUD** control in the playbar reveals simulation time, lifecycle state, moving-player speed and route progress, puck state, and puck speed. Diagnostics are presentation-only and never change drill state.

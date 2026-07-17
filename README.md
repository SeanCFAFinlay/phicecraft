# PhiceCraft - Hockey Drill Designer

The mechanics runtime compiles authored routes and puck actions into deterministic skater, possession, pass/reception, loose-puck, and shooting frames. See [docs/MECHANICS_BASELINE.md](docs/MECHANICS_BASELINE.md) for the runtime contract and diagnostics workflow.

A hockey drill design platform built with React, TypeScript, and Canvas rendering.

## Features

- **Visual Rink Editor**: Full hockey rink with zones, lines, nets, and creases
- **Player Management**: Add/remove home, away, and goalie players
- **Puck Possession Logic**: Deterministic puck chain tracking
- **Pass System**: Two-tap or drag-to-pass with validation
- **Shot System**: Drag-to-shoot toward either net
- **Skate Paths**: Draw smooth skating routes for any player
- **Timeline Playback**: Animated drill playback with scrubbing and speed control
- **Drill Persistence**: Auto-save to localStorage, plus JSON export/import
- **Pan & Zoom**: Mouse wheel, pinch, and drag-to-pan
- **Undo/Redo**: Full history for every edit

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Core Data Model (`src/core/types.ts`)

- **Player**: Hockey player with position, team, number, role
- **SkatePath**: Smooth path of points for player movement
- **DrillEvent**: Pass, shot, or dump events
- **PuckChain**: Derived sequence of puck possession

### Engine Logic (`src/engine/`)

- **puck.ts**: Puck possession, pass validation, shot validation
- **playback.ts**: Timeline animation, player interpolation, puck flight
- **drill.ts**: Drill creation, validation, export/import

Everything in the engine is a pure function, and everything in it is covered by
tests. If you're adding drill rules, they belong here rather than in a component.

### Canvas Rendering (`src/canvas/`)

- **RinkRenderer.ts**: Hockey rink with all markings
- **PlayerRenderer.ts**: Player circles with team colors
- **PathRenderer.ts**: Skate paths, pass lines, shot lines

### State Management (`src/core/state.ts`)

- Reducer-based state management
- Deterministic state transitions
- Undo/redo, recorded automatically for drill-mutating actions

### Storage (`src/storage/`)

- localStorage persistence
- Auto-save 1s after the drill stops changing
- Export/import as JSON

## How It Works

### Puck Chain Logic

1. One player starts with `hasPuck: true`
2. Pass events transfer possession to the receiver
3. Shot and dump events terminate the chain
4. The current holder is derived by walking the event list

### Pass Validation

- Only the current puck holder can pass
- Cannot pass to self
- Cannot add passes after a shot

### Playback Engine

Playback is a **pure function of `(drill, progress)`**. The animation loop only
advances a single `progress` number; player positions, the puck, and which
events have fired are all re-derived from it.

Nothing in playback ever writes to the drill. That's what makes scrubbing
backwards work, and it means an interrupted playback can't persist an animation
frame as the drill's real state. If you're adding to playback, keep it derived —
don't be tempted to store animated positions on the players.

Events are spaced evenly across the timeline: with `n` events, event `i` fires at
`(i + 0.5) / n`. The puck then flies to its target over `PUCK_FLIGHT_FRACTION` of
that slot and rests on the receiver until the next event.

## Tools

| Tool | Description |
|------|-------------|
| Select | Tap player for actions, drag for skate path |
| Skate | Draw skating routes |
| Pass | Tap passer then receiver, or drag |
| Shoot | Drag toward net, or tap to shoot at your own target net |
| Home | Place home team player |
| Away | Place away team player |
| Goalie | Place goalie (team is chosen by which end you place them in) |
| Erase | Remove players or paths |

## Navigation

- **Zoom**: mouse wheel, or pinch with two fingers
- **Pan**: drag on empty ice
- **Hold player (0.7s)**: reposition them
- **Menu → View**: jump to full rink, offensive zone, or defensive zone

The camera fits the rink on first load and is left alone after that, so resizing
the window won't throw away your zoom.

## Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # coverage for engine, state, and utils
```

Tests cover the puck engine, playback engine, geometry helpers, and the state
reducer — the pure logic where correctness bugs actually hide. The canvas
renderers are verified by eye.

## Project Structure

```
src/
├── components/     # React UI components
├── canvas/         # Canvas rendering functions
├── core/           # Types, constants, state reducer
├── engine/         # Game logic (puck, playback, drill)
├── hooks/          # React hooks
├── storage/        # Persistence layer
├── styles/         # Global CSS
├── utils/          # Utility functions
├── App.tsx         # Main app component
└── main.tsx        # Entry point
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Vitest** - Testing
- **Tailwind CSS** - Styling
- **Canvas 2D** - Rendering
- **localStorage** - Persistence

## License

MIT

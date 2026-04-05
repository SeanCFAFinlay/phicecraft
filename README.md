# PhiceCraft - Hockey Drill Designer

A professional hockey drill design platform built with React, TypeScript, and Canvas rendering.

## Features

- **Visual Rink Editor**: Full hockey rink with zones, lines, nets, and creases
- **Player Management**: Add/remove home, away, and goalie players
- **Puck Possession Logic**: Deterministic puck chain tracking
- **Pass System**: Two-tap or drag-to-pass with validation
- **Shot System**: Drag-to-shoot toward either net
- **Skate Paths**: Draw smooth skating routes for any player
- **Timeline Playback**: Animated drill playback with speed control
- **Drill Persistence**: Auto-save to localStorage
- **Mobile-Friendly**: Touch gestures including pinch-zoom and hold-to-move
- **Undo Support**: Full undo history

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

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
- **playback.ts**: Timeline animation, player interpolation
- **drill.ts**: Drill creation, validation, export/import

### Canvas Rendering (`src/canvas/`)

- **RinkRenderer.ts**: Hockey rink with all markings
- **PlayerRenderer.ts**: Player circles with team colors
- **PathRenderer.ts**: Skate paths, pass lines, shot lines

### State Management (`src/core/state.ts`)

- Reducer-based state management
- Deterministic state transitions
- Undo/redo support

### Storage (`src/storage/`)

- localStorage persistence
- Auto-save on changes
- Export/import as JSON

## How It Works

### Puck Chain Logic

1. One player starts with `hasPuck: true`
2. Pass events transfer possession to receiver
3. Shot events terminate the chain (puck is "in the net")
4. Current holder is derived from walking events backwards

### Pass Validation

- Only the current puck holder can pass
- Cannot pass to self
- Cannot add passes after a shot

### Playback Engine

1. Save start positions as snapshot
2. Animate players along their skate paths
3. Fire pass/shot events at timeline positions
4. Animate puck between positions
5. Reset to snapshot when complete

## Tools

| Tool | Description |
|------|-------------|
| Select | Tap player for actions, drag for skate path |
| Skate | Draw skating routes |
| Pass | Tap passer then receiver, or drag |
| Shoot | Drag toward net |
| Home | Place home team player |
| Away | Place away team player |
| Goalie | Place goalie |
| Erase | Remove players or paths |

## Keyboard Shortcuts

- Touch: Hold player (0.8s) to reposition
- Touch: Pinch to zoom
- Touch: Drag on empty space to pan (coming soon)

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
- **Tailwind CSS** - Styling
- **Canvas 2D** - Rendering
- **localStorage** - Persistence

## License

MIT

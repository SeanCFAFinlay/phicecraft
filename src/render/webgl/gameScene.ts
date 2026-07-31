// ============================================================================
// GAME SCENE — WebGL dynamic layer
//
// Builds a Pixi scene graph ONCE (`buildGameScene`) and updates it in place
// every frame (`updateGameScene`), mirroring `Canvas2D`'s `drawDynamicLayer`
// (`src/components/canvas/renderDynamic.ts`) group by group and in the SAME
// paint order, so a coach sees the same z-stacking either pipeline draws.
// This file is the thin orchestrator - assembly (`buildGameScene`) and the
// per-frame call order (`updateGameScene`); each group's own drawing logic
// lives in `gameSceneOverlays.ts` (kept out of this file so it does not
// become a ~700-line monolith), the pooling primitives in `gameScenePool.ts`,
// and the player-specific atlas/vector-fallback rendering in
// `gameScenePlayers.ts`.
//
// Every group is drawn from the SAME `DynamicLayerInput` the Canvas2D path
// reads - no new state, and positions/handle geometry are read from (or
// reuse the pure functions of) the exact same source Canvas2D does:
// `expandCurve`, `eventFlightLine`, `deriveSkaterPose`/`getSkaterPalette`
// (via gameScenePlayers.ts), `CONTROL_HANDLE_RADIUS`/`ADD_HANDLE_RADIUS`.
//
// Per-frame allocation discipline: every repeating group (skate paths,
// events, pass candidates, players, edit handles, ghost trails, coaches) is
// backed by a keyed pool that reuses its Graphics/Container across frames -
// `.clear()` and redraw, never destroy/recreate (Task 3's ghost-trail fix,
// extended here to the rest of the dynamic layer). Skate paths additionally
// carry their own dirty-key cache (`gameSceneOverlays.ts`'s
// `SkatePathCache`), since content only changes on an author edit but this
// group used to fully re-tessellate every frame regardless.
//
// Coaches: drawn as the FIRST group (`coachesContainer`), matching
// `renderDynamic.ts`'s paint order (`drawCoachTopDown` runs before ghost
// trails/skate paths/everything else) - the flat board is never missing a
// coach marker under `?renderer=webgl`. The TABLETOP camera range still
// covers coaches through the Canvas2D pass-through (`WebGLRenderer`'s
// `canvasFallback` branch); this scene never runs for that range at all.
// ============================================================================

import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import type { DrillEvent, Player } from '@/core/types';
import { jerseyColor } from '@/core/types';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';
import { RINK } from '@/core/constants';
import { compileDrill } from '@/sim/compileDrill';
import { getCompiledEventEndpoints } from '@/sim/sampleFrame';
import { getCurrentPuckHolder } from '@/engine/puck';
import { getPlayerHeadingAtProgress } from '@/engine/playback';
import { createPlayerToken, updatePlayerToken, type PlayerToken, type PlayerVisualOptions } from './gameScenePlayers';
import { GraphicsKeyedPool, TokenPool } from './gameScenePool';
import {
  createCoachToken,
  createEventToken,
  createSkatePathCache,
  updateAnimatedPuck,
  updateCoaches,
  updateDiagnostics,
  updateDimmedPlayers,
  updateDragPreview,
  updateEditHandles,
  updateEvents,
  updateGhostTrails,
  updateGlow,
  updatePassCandidates,
  updatePassFromHighlight,
  updateSkatePaths,
  updateTransientRoute,
  type CoachToken,
  type EventToken,
  type SkatePathCache,
} from './gameSceneOverlays';

// ----------------------------------------------------------------------------
// Assembly
// ----------------------------------------------------------------------------

export interface GameScene {
  readonly root: Container;
}

interface InternalGameScene extends GameScene {
  coachesContainer: Container;
  coachesPool: TokenPool<CoachToken>;
  ghostTrailsContainer: Container;
  ghostTrailsPool: GraphicsKeyedPool;
  skatePathsContainer: Container;
  skatePathsPool: GraphicsKeyedPool;
  skatePathCache: SkatePathCache;
  transientRoute: Graphics;
  eventsContainer: Container;
  eventsPool: TokenPool<EventToken>;
  dragPreview: Graphics;
  dragPreviewLabel: Text;
  passFromHighlight: Graphics;
  dimmedPlayers: Graphics;
  playersContainer: Container;
  playersPool: TokenPool<PlayerToken>;
  passCandidatesContainer: Container;
  passCandidatesPool: GraphicsKeyedPool;
  editHandlesContainer: Container;
  editHandlesPool: GraphicsKeyedPool;
  animatedPuck: Graphics;
  diagnostics: Graphics;
  glowContainer: Container;
  glow: Graphics;
  glowFilter: BlurFilter;
  compiledCacheKey: unknown;
  compiledCacheValue: ReturnType<typeof compileDrill> | null;
}

/** Builds the dynamic scene graph ONCE. `updateGameScene` mutates it every frame. */
export function buildGameScene(): GameScene {
  const root = new Container({ label: 'game-scene' });

  const coachesContainer = new Container({ label: 'coaches' });
  const ghostTrailsContainer = new Container({ label: 'ghost-trails' });
  const skatePathsContainer = new Container({ label: 'skate-paths' });
  const transientRoute = new Graphics({ label: 'transient-route' });
  const eventsContainer = new Container({ label: 'events' });
  const dragPreview = new Graphics({ label: 'drag-preview' });
  const dragPreviewLabel = new Text({ text: '', resolution: 2, style: { fontSize: 11, fontWeight: '700', fontFamily: 'Arial' } });
  dragPreviewLabel.anchor.set(0.5);
  dragPreviewLabel.visible = false;
  const passFromHighlight = new Graphics({ label: 'pass-from-highlight' });
  const dimmedPlayers = new Graphics({ label: 'dimmed-players' });
  const playersContainer = new Container({ label: 'players' });
  const passCandidatesContainer = new Container({ label: 'pass-candidates' });
  const editHandlesContainer = new Container({ label: 'edit-handles' });
  const animatedPuck = new Graphics({ label: 'animated-puck' });
  const diagnostics = new Graphics({ label: 'diagnostics' });
  const glowContainer = new Container({ label: 'glow' });
  const glow = new Graphics();
  const glowFilter = new BlurFilter({ strength: 6, quality: 2 });
  glowContainer.addChild(glow);

  root.addChild(
    coachesContainer,
    ghostTrailsContainer,
    skatePathsContainer,
    transientRoute,
    eventsContainer,
    dragPreview,
    dragPreviewLabel,
    passFromHighlight,
    dimmedPlayers,
    playersContainer,
    passCandidatesContainer,
    editHandlesContainer,
    animatedPuck,
    diagnostics,
    glowContainer
  );

  const scene: InternalGameScene = {
    root,
    coachesContainer,
    coachesPool: new TokenPool(coachesContainer, createCoachToken),
    ghostTrailsContainer,
    ghostTrailsPool: new GraphicsKeyedPool(ghostTrailsContainer),
    skatePathsContainer,
    skatePathsPool: new GraphicsKeyedPool(skatePathsContainer),
    skatePathCache: createSkatePathCache(),
    transientRoute,
    eventsContainer,
    eventsPool: new TokenPool(eventsContainer, createEventToken),
    dragPreview,
    dragPreviewLabel,
    passFromHighlight,
    dimmedPlayers,
    playersContainer,
    playersPool: new TokenPool(playersContainer, createPlayerToken),
    passCandidatesContainer,
    passCandidatesPool: new GraphicsKeyedPool(passCandidatesContainer),
    editHandlesContainer,
    editHandlesPool: new GraphicsKeyedPool(editHandlesContainer),
    animatedPuck,
    diagnostics,
    glowContainer,
    glow,
    glowFilter,
    compiledCacheKey: null,
    compiledCacheValue: null,
  };
  return scene;
}

function compiledFor(scene: InternalGameScene, drill: DynamicLayerInput['drill']): ReturnType<typeof compileDrill> {
  if (scene.compiledCacheKey === drill && scene.compiledCacheValue) return scene.compiledCacheValue;
  scene.compiledCacheKey = drill;
  scene.compiledCacheValue = compileDrill(drill);
  return scene.compiledCacheValue;
}

/** The same scrub/drag position overlay `renderDynamic.ts`'s Canvas2D path applies - never re-derived differently. */
function resolvePlayers(input: DynamicLayerInput): Player[] {
  const scrubbing = Object.keys(input.positions).length > 0;
  const scrubbed = scrubbing
    ? input.drill.players.map(player => {
        const position = input.positions[player.id];
        return position ? { ...player, x: position.x, y: position.y } : player;
      })
    : input.drill.players;

  const dragged = input.draggedPlayer;
  return dragged
    ? scrubbed.map(player => (player.id === dragged.id ? { ...player, x: dragged.point.x, y: dragged.point.y } : player))
    : scrubbed;
}

/** Updates every group from the SAME `DynamicLayerInput` the Canvas2D path reads. Call once per frame. */
export function updateGameScene(scene: GameScene, input: DynamicLayerInput): void {
  const s = scene as InternalGameScene;
  const { drill } = input;
  const players = resolvePlayers(input);
  const scrubbing = Object.keys(input.positions).length > 0;

  updateCoaches(s.coachesPool, drill.coaches ?? []);
  updateGhostTrails(s.ghostTrailsPool, input, players);
  updateSkatePaths(s.skatePathsPool, s.skatePathCache, drill.skatePaths, input.quality);
  updateTransientRoute(s.transientRoute, input.transientRoute, drill.players);

  const compiled = compiledFor(s, drill);
  const renderedEvents: DrillEvent[] = compiled.events.map(compiledEvent => {
    const endpoints = getCompiledEventEndpoints(compiled, compiledEvent);
    return { ...compiledEvent.source, fromPoint: endpoints.from, toPoint: endpoints.to };
  });
  updateEvents(s.eventsPool, renderedEvents, input.selectedEventId);

  updateDragPreview(s.dragPreview, s.dragPreviewLabel, input.dragPreview);

  const passFrom = input.passFromPlayerId ? players.find(p => p.id === input.passFromPlayerId) : undefined;
  updatePassFromHighlight(s.passFromHighlight, passFrom);

  const passCandidates = input.passCandidates;
  s.dimmedPlayers.clear();
  if (passCandidates) {
    updateDimmedPlayers(
      s.dimmedPlayers,
      players,
      new Set(passCandidates.candidates.map(candidate => candidate.actorId)),
      passCandidates.passerId
    );
  }

  const jerseys = { home: jerseyColor('home', drill.settings), away: jerseyColor('away', drill.settings) };
  const currentHolder = getCurrentPuckHolder(drill.players, drill.events);

  s.playersPool.begin();
  for (const player of players) {
    const token = s.playersPool.get(player.id);
    const hasRoute = drill.skatePaths.some(path => path.ownerId === player.id);
    const playbackProgress = scrubbing || input.isPlaying ? input.progress : 0;
    const routeHeading = hasRoute
      ? getPlayerHeadingAtProgress(player, drill.skatePaths, playbackProgress)
      : player.role === 'G'
        ? player.x < RINK.centerX
          ? 0
          : Math.PI
        : player.team === 'home'
          ? 0
          : Math.PI;
    const isPuckHolder = currentHolder?.id === player.id;

    const options: PlayerVisualOptions = {
      isSelected: player.id === input.selectedPlayerId,
      isDragging: false,
      isMoving: input.movingPlayerId === player.id,
      isPassFrom: player.id === input.passFromPlayerId,
      isPuckHolder: !input.puck && isPuckHolder && drill.events.length > 0,
      showInitialPuck: !input.puck && player.hasPuck && drill.events.length === 0,
      heading: routeHeading,
      showRouteHandle: player.id === input.selectedPlayerId && !scrubbing && !input.isPlaying,
      isPreparingReceive: input.puck?.state === 'in_flight' && input.puck.intendedReceiverId === player.id,
      playbackFrame: scrubbing || input.isPlaying ? input.playerFrames[player.id] : undefined,
      trackedPuck: input.puck,
      jersey: player.team === 'home' ? jerseys.home : jerseys.away,
      screenRotation: input.camera.rotation ?? 0,
    };
    updatePlayerToken(token, { player, options, quality: input.quality });
  }
  s.playersPool.end();

  updatePassCandidates(s.passCandidatesPool, passCandidates, players, drill.skatePaths);
  updateEditHandles(s.editHandlesPool, input);
  updateAnimatedPuck(s.animatedPuck, input.puck);
  updateDiagnostics(s.diagnostics, players, input.playerFrames, input.puck, input.showDiagnostics);

  const high = input.quality === 'high';
  s.glowContainer.visible = high;
  if (high) {
    s.glowContainer.filters = [s.glowFilter];
    updateGlow(s.glow, input, players, passCandidates);
  }
}

export function destroyGameScene(scene: GameScene): void {
  scene.root.destroy({ children: true });
}

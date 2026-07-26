// ============================================================================
// DYNAMIC GAME LAYER
//
// Players, puck, routes, events, handles, previews, trails, effects and
// diagnostics. Redrawn for an authoring change or a playback frame; the rink
// underneath is untouched.
// ============================================================================

import type {
  AnimatedPuck,
  Camera,
  CoachMarker,
  Drill,
  DrillEvent,
  ID,
  PlaybackPlayerFrame,
  Player,
  Point,
} from '@/core/types';
import { jerseyColor } from '@/core/types';
import { RINK, TABLETOP_MIN_TILT } from '@/core/constants';
import { drawArenaWalls } from '@/canvas/RinkRenderer';
import { drawArenaPlayers, drawPlayers } from '@/canvas/PlayerRenderer';
import { drawArenaCoaches, drawCoachTopDown } from '@/canvas/CoachRenderer';
import { drawMechanicsDiagnostics } from '@/canvas/DiagnosticsRenderer';
import {
  drawAnimatedPuck,
  drawDragPreview,
  drawEventEditHandles,
  drawEvents,
  drawGhostTrails,
  drawPassFromHighlight,
  drawRawSkate,
  drawRouteEditHandles,
  drawSkatePaths,
} from '@/canvas/PathRenderer';
import { drawDimmedPlayers, drawPassCandidates, type PassCandidateView } from '@/canvas/PassOverlay';
import { cameraMatrix } from '@/utils/geometry';
import { compileDrill } from '@/sim/compileDrill';
import { getCompiledEventEndpoints } from '@/sim/sampleFrame';

export interface DragPreview {
  kind: 'pass' | 'shoot';
  from: Point;
  to: Point;
  receiver: Player | null;
}

export interface DynamicLayerInput {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  drill: Drill;
  /** Interpolated positions while playing or scrubbing; empty when at rest. */
  positions: Record<ID, Point>;
  playerFrames: Record<ID, PlaybackPlayerFrame>;
  puck: AnimatedPuck | null;
  ghostTrails: [ID, Point[]][];
  isPlaying: boolean;
  progress: number;
  selectedPlayerId: ID | null;
  selectedEventId: ID | null;
  passFromPlayerId: ID | null;
  movingPlayerId: ID | null;
  /** The route being drawn right now, straight from the gesture machine. */
  transientRoute: { ownerId: ID; points: Point[] } | null;
  /**
   * Where a player being dragged currently is.
   *
   * This is TRANSIENT: it is not in the document and never reaches the
   * reducer. Moving a player used to dispatch `MOVE_PLAYER` on every pointer
   * frame, which rewrote `updatedAt`, allocated a new drill, bumped the
   * document revision, invalidated the review and woke the save coordinator -
   * sixty times a second, for a gesture that should be one edit.
   */
  draggedPlayer: { id: ID; point: Point } | null;
  dragPreview: DragPreview | null;
  /**
   * While a pass is armed: who can receive it, and how well. Computed once
   * when the pass is armed rather than per frame, because scoring a receiver
   * means solving an interception against a compiled drill.
   */
  passCandidates: { passerId: ID; candidates: PassCandidateView[] } | null;
  showDiagnostics: boolean;
  reducedEffects: boolean;
}

/**
 * A compiled-drill cache keyed by document identity. Compiling on every frame
 * was one of the biggest per-frame costs; the drill object only changes when
 * the document does.
 */
let compiledCacheKey: Drill | null = null;
let compiledCacheValue: ReturnType<typeof compileDrill> | null = null;

function compiledFor(drill: Drill): ReturnType<typeof compileDrill> {
  if (compiledCacheKey === drill && compiledCacheValue) return compiledCacheValue;
  compiledCacheKey = drill;
  compiledCacheValue = compileDrill(drill);
  return compiledCacheValue;
}

export function drawDynamicLayer(ctx: CanvasRenderingContext2D, input: DynamicLayerInput): void {
  const { camera, width, height, dpr, drill } = input;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const tabletop = (camera.tilt ?? 0) > TABLETOP_MIN_TILT;
  const matrix = cameraMatrix(camera);
  const coaches: CoachMarker[] = drill.coaches ?? [];

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);

  // Coaches sit on the ice under the play. In the tabletop view they stand up
  // as pieces (drawn later, in screen space); here they are the flat marker.
  if (!tabletop) {
    for (const coach of coaches) drawCoachTopDown(ctx, coach, false);
  }

  // While playing or scrubbing, players render at their interpolated
  // positions. The drill itself is never touched.
  const scrubbing = Object.keys(input.positions).length > 0;
  const scrubbed = scrubbing
    ? drill.players.map(player => {
        const position = input.positions[player.id];
        return position ? { ...player, x: position.x, y: position.y } : player;
      })
    : drill.players;

  const dragged = input.draggedPlayer;
  const players = dragged
    ? scrubbed.map(player =>
        player.id === dragged.id ? { ...player, x: dragged.point.x, y: dragged.point.y } : player
      )
    : scrubbed;

  if (input.isPlaying && input.ghostTrails.length > 0) {
    drawGhostTrails(ctx, new Map(input.ghostTrails), players);
  }

  drawSkatePaths(ctx, drill.skatePaths);

  if (input.transientRoute && input.transientRoute.points.length >= 2) {
    const owner = drill.players.find(player => player.id === input.transientRoute!.ownerId);
    drawRawSkate(ctx, input.transientRoute.points, owner?.team ?? 'home');
  }

  const compiled = compiledFor(drill);
  const renderedEvents: DrillEvent[] = compiled.events.map(compiledEvent => {
    const endpoints = getCompiledEventEndpoints(compiled, compiledEvent);
    return { ...compiledEvent.source, fromPoint: endpoints.from, toPoint: endpoints.to };
  });
  drawEvents(ctx, renderedEvents, input.selectedEventId);

  if (input.dragPreview) {
    drawDragPreview(
      ctx,
      input.dragPreview.kind,
      input.dragPreview.from,
      input.dragPreview.receiver
        ? { x: input.dragPreview.receiver.x, y: input.dragPreview.receiver.y }
        : input.dragPreview.to,
      input.dragPreview.receiver,
      RINK.height
    );
  }

  if (input.passFromPlayerId) {
    const passFrom = players.find(player => player.id === input.passFromPlayerId);
    if (passFrom) drawPassFromHighlight(ctx, passFrom);
  }

  const playerOptions = {
    selectedPlayerId: input.selectedPlayerId,
    passFromPlayerId: input.passFromPlayerId,
    dragFromPlayer: null,
    movingPlayer: input.movingPlayerId
      ? players.find(player => player.id === input.movingPlayerId) ?? null
      : null,
    nodeActiveOwnerId: null,
    // Whenever the animated puck is on screen it is the single source of truth
    // for where the puck is - don't draw a second one on a player.
    showPuckIndicator: !input.puck,
    skatePaths: drill.skatePaths,
    playbackProgress: scrubbing || input.isPlaying ? input.progress : undefined,
    receivingPlayerId: input.puck?.state === 'in_flight' ? input.puck.intendedReceiverId : undefined,
    playerFrames: scrubbing || input.isPlaying ? input.playerFrames : undefined,
    reducedEffects: input.reducedEffects,
    trackedPuck: input.puck,
    jerseys: {
      home: jerseyColor('home', drill.settings),
      away: jerseyColor('away', drill.settings),
    },
    // The board turns to fit an upright phone; the numbers must not turn with
    // it. In the tabletop the pieces are drawn in screen space anyway.
    screenRotation: tabletop ? 0 : camera.rotation ?? 0,
  };

  // Dim before the players are drawn, light after, so the ring sits on top of
  // the token rather than under the fade.
  const passCandidates = input.passCandidates;
  if (!tabletop && passCandidates) {
    drawDimmedPlayers(
      ctx,
      players,
      new Set(passCandidates.candidates.map(candidate => candidate.actorId)),
      passCandidates.passerId
    );
  }

  if (!tabletop) {
    drawPlayers(ctx, players, drill.events, playerOptions);
  }

  if (!tabletop && passCandidates) {
    drawPassCandidates(
      ctx,
      passCandidates.candidates,
      id => players.find(player => player.id === id) ?? { x: 0, y: 0 },
      drill.skatePaths
    );
  }

  // Edit handles: reshape the selected player's route or bend/re-aim the
  // selected puck line. Hidden during playback.
  if (!input.isPlaying) {
    if (input.selectedPlayerId) {
      const route = drill.skatePaths.find(path => path.ownerId === input.selectedPlayerId);
      if (route && route.points.length >= 2) drawRouteEditHandles(ctx, route.points);
    }
    if (input.selectedEventId) {
      const event = drill.events.find(item => item.id === input.selectedEventId);
      if (event) drawEventEditHandles(ctx, event);
    }
  }

  if (input.puck?.visible) {
    drawAnimatedPuck(ctx, input.puck.x, input.puck.y, input.puck.state);
  }

  if (input.showDiagnostics) {
    drawMechanicsDiagnostics(ctx, players, input.playerFrames, input.puck);
  }

  ctx.restore();

  if (tabletop) {
    const jerseys = {
      home: jerseyColor('home', drill.settings),
      away: jerseyColor('away', drill.settings),
    };
    drawArenaPlayers(ctx, { camera, dpr }, players, drill.events, playerOptions, jerseys);
    drawArenaCoaches(ctx, { camera, dpr }, coaches, null);
    // Near boards/glass sit in front of the skaters closest to the camera.
    drawArenaWalls(ctx, { camera, dpr }, 'near');
  }

  void width;
  void height;
}

/** Drop the compiled-drill cache, e.g. when a test wants a clean slate. */
export function resetCompiledCache(): void {
  compiledCacheKey = null;
  compiledCacheValue = null;
}

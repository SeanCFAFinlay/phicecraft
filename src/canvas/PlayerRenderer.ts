// ============================================================================
// PLAYER RENDERER - Player circle drawing
// ============================================================================

import type { Player, ID, DrillEvent, SkatePath, PlaybackPlayerFrame, AnimatedPuck } from '@/core/types';
import { PLAYER_RADIUS, GOALIE_RING_OFFSET, ROUTE_HANDLE_OFFSET, ROUTE_HANDLE_RADIUS, COLORS, RINK } from '@/core/constants';
import { getCurrentPuckHolder } from '@/engine/puck';
import { getPlayerHeadingAtProgress } from '@/engine/playback';
import { drawDetailedSkater } from './skater/SkaterRenderer';
import { drawDetailedGoalie } from './skater/GoalieRenderer';
import { getBladePosition } from '@/sim/skaterMotor';

interface PlayerRenderOptions {
  isSelected: boolean;
  isDragging: boolean;
  isMoving: boolean;
  isPassFrom: boolean;
  isNodeActive: boolean;
  isPuckHolder: boolean;
  showInitialPuck: boolean;
  heading?: number;
  showRouteHandle?: boolean;
  isPreparingReceive?: boolean;
  playbackFrame?: PlaybackPlayerFrame;
  reducedEffects?: boolean;
  trackedPuck?: AnimatedPuck | null;
  jersey?: string;
  /** How far the board is turned on screen. Keeps numbers readable. */
  screenRotation?: number;
}

function createDesignFrame(player: Player, heading: number): PlaybackPlayerFrame {
  const position = { x: player.x, y: player.y };
  return {
    id: player.id,
    position,
    velocity: { x: 0, y: 0 },
    heading,
    angularVelocity: 0,
    speed: 0,
    routeProgress: 0,
    stridePhase: 0.12,
    action: 'idle',
    bladePosition: getBladePosition(player, position, heading),
  };
}

/**
 * Draw a single player
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  options: PlayerRenderOptions
): void {
  const { isSelected, isDragging, isMoving, isPassFrom, isNodeActive, isPuckHolder, showInitialPuck, heading = 0, showRouteHandle = false, isPreparingReceive = false, playbackFrame, reducedEffects = false, trackedPuck, jersey, screenRotation = 0 } = options;
  const pr = PLAYER_RADIUS;
  const isHighlighted = isDragging || isNodeActive || isPassFrom;

  // Selection ring (dashed)
  if (isSelected) {
    const color = player.team === 'home'
      ? 'rgba(215, 48, 58, 0.38)'
      : 'rgba(48, 128, 255, 0.38)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, pr + 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Highlight ring (solid gold)
  if (isHighlighted) {
    ctx.strokeStyle = 'rgba(255, 210, 10, 0.88)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, pr + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Moving ring (dashed gold)
  if (isMoving) {
    ctx.strokeStyle = 'rgba(255, 210, 10, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, pr + 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const frame = playbackFrame ?? createDesignFrame(player, heading);
  if (player.role === 'G') {
    drawDetailedGoalie(ctx, player, frame, isPuckHolder || showInitialPuck, trackedPuck, jersey, screenRotation);

    ctx.strokeStyle = 'rgba(255, 202, 0, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, pr + GOALIE_RING_OFFSET, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawDetailedSkater(ctx, player, frame, {
      isSelected,
      isHighlighted,
      isPuckHolder: isPuckHolder || showInitialPuck,
      isPreparingReceive,
      reducedEffects,
      jersey,
      screenRotation,
    });
  }

  if (showRouteHandle) {
    const hx = player.x + ROUTE_HANDLE_OFFSET;
    const hy = player.y;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 200, 240, 0.65)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(5, 24, 35, 0.96)';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, ROUTE_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#dff9ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 4);
    ctx.quadraticCurveTo(hx + 1, hy + 7, hx + 7, hy + 1);
    ctx.moveTo(hx - 4, hy - 4);
    ctx.lineTo(hx + 5, hy + 2);
    ctx.stroke();
    ctx.restore();
  }
}

export interface DrawPlayersOptions {
  selectedPlayerId?: ID | null;
  passFromPlayerId?: ID | null;
  dragFromPlayer?: Player | null;
  movingPlayer?: Player | null;
  nodeActiveOwnerId?: ID | null;
  /**
   * Whether to mark the puck carrier with a puck. False during playback, where
   * the animated puck is the single source of truth for where the puck is.
   */
  showPuckIndicator?: boolean;
  skatePaths?: SkatePath[];
  playbackProgress?: number;
  receivingPlayerId?: ID;
  playerFrames?: Record<ID, PlaybackPlayerFrame>;
  reducedEffects?: boolean;
  trackedPuck?: AnimatedPuck | null;
  jerseys?: { home: string; away: string };
  /** How far the board is turned on screen. */
  screenRotation?: number;
}

/**
 * Draw all players
 */
export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  events: DrillEvent[],
  options: DrawPlayersOptions = {}
): void {
  const {
    selectedPlayerId = null,
    passFromPlayerId = null,
    dragFromPlayer = null,
    movingPlayer = null,
    nodeActiveOwnerId = null,
    showPuckIndicator = true,
    skatePaths = [],
    playbackProgress,
    receivingPlayerId,
    playerFrames = {},
    reducedEffects = false,
    trackedPuck = null,
    jerseys,
    screenRotation = 0,
  } = options;

  const currentHolder = getCurrentPuckHolder(players, events);

  players.forEach(player => {
    const isPuckHolder = currentHolder?.id === player.id;
    const hasRoute = skatePaths.some(path => path.ownerId === player.id);
    const routeHeading = hasRoute
      ? getPlayerHeadingAtProgress(player, skatePaths, playbackProgress ?? 0)
      : player.role === 'G'
        ? player.x < RINK.centerX ? 0 : Math.PI
        : player.team === 'home' ? 0 : Math.PI;

    drawPlayer(ctx, player, {
      isSelected: player.id === selectedPlayerId,
      isDragging: dragFromPlayer?.id === player.id,
      isMoving: movingPlayer?.id === player.id,
      isPassFrom: player.id === passFromPlayerId,
      isNodeActive: player.id === nodeActiveOwnerId,
      isPuckHolder: showPuckIndicator && isPuckHolder && events.length > 0,
      showInitialPuck: showPuckIndicator && player.hasPuck && events.length === 0,
      heading: routeHeading,
      showRouteHandle: player.id === selectedPlayerId && playbackProgress === undefined,
      isPreparingReceive: player.id === receivingPlayerId,
      playbackFrame: playerFrames[player.id],
      reducedEffects,
      trackedPuck,
      jersey: jerseys ? (player.team === 'home' ? jerseys.home : jerseys.away) : undefined,
      screenRotation,
    });
  });
}

// ============================================================================
// PLAYER RENDERER - Player circle drawing
// ============================================================================

import type { Player, ID, DrillEvent, SkatePath, PlaybackPlayerFrame, AnimatedPuck, Camera } from '@/core/types';
import { PLAYER_RADIUS, GOALIE_RING_OFFSET, ROUTE_HANDLE_OFFSET, ROUTE_HANDLE_RADIUS, COLORS, RINK } from '@/core/constants';
import { getCurrentPuckHolder } from '@/engine/puck';
import { getPlayerHeadingAtProgress } from '@/engine/playback';
import { drawDetailedSkater } from './skater/SkaterRenderer';
import { drawDetailedGoalie } from './skater/GoalieRenderer';
import { getBladePosition } from '@/sim/skaterMotor';
import { cameraMatrix, applyAffine } from '@/utils/geometry';

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
  const { isSelected, isDragging, isMoving, isPassFrom, isNodeActive, isPuckHolder, showInitialPuck, heading = 0, showRouteHandle = false, isPreparingReceive = false, playbackFrame, reducedEffects = false, trackedPuck } = options;
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
    drawDetailedGoalie(ctx, player, frame, isPuckHolder || showInitialPuck, trackedPuck);

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
    });
  });
}

// ============================================================================
// TABLETOP PLAYERS
//
// In the tilted arena the skaters are rebuilt as upright, camera-facing tokens
// that stand off the ice - the same extruded, "table hockey model" language as
// the raised boards - each with a foreshortened contact shadow so it reads as a
// physical piece sitting on the sheet rather than a decal painted onto it.
// ============================================================================

function shadeColor(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(m[1], 16) + amount);
  const g = clamp(parseInt(m[2], 16) + amount);
  const b = clamp(parseInt(m[3], 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
}

/**
 * A single standing player piece, drawn in screen space at its projected ground
 * point `g`, rising by `height`.
 */
function drawStandingPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  g: { x: number; y: number },
  z: number,
  k: number,
  height: number,
  flags: { isSelected: boolean; isHighlighted: boolean; hasPuck: boolean }
): void {
  const isGoalie = player.role === 'G';
  const teamCol = player.team === 'home' ? COLORS.home.primary : COLORS.away.primary;
  const bodyR = PLAYER_RADIUS * z * (isGoalie ? 1.02 : 0.86);
  const baseRx = bodyR;
  const baseRy = Math.max(bodyR * 0.34, bodyR * k);
  const topY = g.y - height;
  const headR = bodyR * (isGoalie ? 0.62 : 0.66);

  // Contact shadow on the ice.
  ctx.save();
  ellipse(ctx, g.x, g.y + baseRy * 0.15, baseRx * 1.18, baseRy * 1.18);
  ctx.fillStyle = 'rgba(6, 16, 26, 0.32)';
  ctx.fill();
  ctx.restore();

  // Selection / highlight ring drawn flat on the ice around the base.
  if (flags.isHighlighted || flags.isSelected) {
    ctx.save();
    ctx.setLineDash(flags.isHighlighted ? [] : [baseRx * 0.35, baseRx * 0.28]);
    ctx.lineWidth = Math.max(2, bodyR * 0.22);
    ctx.strokeStyle = flags.isHighlighted
      ? 'rgba(255, 210, 10, 0.95)'
      : player.team === 'home'
        ? 'rgba(255, 120, 130, 0.9)'
        : 'rgba(120, 180, 255, 0.9)';
    ellipse(ctx, g.x, g.y + baseRy * 0.15, baseRx * 1.42, baseRy * 1.42);
    ctx.stroke();
    ctx.restore();
  }

  // Body: an upright capsule with a rounded (elliptical) base and top so it
  // reads as a cylinder catching the overhead light.
  const bodyGrad = ctx.createLinearGradient(0, topY, 0, g.y);
  bodyGrad.addColorStop(0, shadeColor(teamCol, 46));
  bodyGrad.addColorStop(0.5, teamCol);
  bodyGrad.addColorStop(1, shadeColor(teamCol, -46));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.x - baseRx, topY);
  ctx.lineTo(g.x - baseRx, g.y);
  ctx.ellipse(g.x, g.y, baseRx, baseRy, 0, Math.PI, 0, true);
  ctx.lineTo(g.x + baseRx, topY);
  ctx.ellipse(g.x, topY, baseRx, baseRy, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, bodyR * 0.09);
  ctx.strokeStyle = 'rgba(4, 12, 20, 0.55)';
  ctx.stroke();

  // Top cap highlight.
  ellipse(ctx, g.x, topY, baseRx, baseRy);
  ctx.fillStyle = shadeColor(teamCol, 60);
  ctx.fill();

  // Head sitting on the shoulders.
  const headCy = topY - headR * 0.65;
  const headGrad = ctx.createRadialGradient(
    g.x - headR * 0.3,
    headCy - headR * 0.3,
    headR * 0.2,
    g.x,
    headCy,
    headR
  );
  headGrad.addColorStop(0, isGoalie ? '#eef3f7' : shadeColor(teamCol, 70));
  headGrad.addColorStop(1, isGoalie ? '#9fb1c0' : shadeColor(teamCol, -20));
  ctx.beginPath();
  ctx.arc(g.x, headCy, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, bodyR * 0.07);
  ctx.strokeStyle = 'rgba(4, 12, 20, 0.5)';
  ctx.stroke();

  if (isGoalie) {
    // Mask bar hint across the face.
    ctx.strokeStyle = 'rgba(30, 44, 58, 0.7)';
    ctx.lineWidth = Math.max(0.8, headR * 0.16);
    ctx.beginPath();
    ctx.moveTo(g.x - headR * 0.7, headCy);
    ctx.lineTo(g.x + headR * 0.7, headCy);
    ctx.stroke();
  }

  // Jersey number on the body, facing the camera.
  const fs = Math.max(7, bodyR * 0.95);
  ctx.font = `800 ${fs}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(4, 12, 20, 0.55)';
  ctx.lineWidth = Math.max(1, fs * 0.14);
  const numY = topY + (g.y - topY) * 0.5;
  ctx.strokeText(String(player.number), g.x, numY);
  ctx.fillText(String(player.number), g.x, numY);
  ctx.restore();

  // Puck resting at the piece's feet.
  if (flags.hasPuck) {
    ctx.save();
    const pr = PLAYER_RADIUS * z * 0.24;
    ellipse(ctx, g.x + baseRx * 0.75, g.y + baseRy * 0.55, pr, Math.max(pr * 0.42, pr * k));
    ctx.fillStyle = '#0b0b0b';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw every player as an upright tabletop piece, sorted back-to-front so the
 * near skaters overlap the far ones the way solid models would.
 */
export function drawArenaPlayers(
  ctx: CanvasRenderingContext2D,
  view: { camera: Camera; dpr: number },
  players: Player[],
  events: DrillEvent[],
  options: DrawPlayersOptions = {}
): void {
  const { camera, dpr } = view;
  const {
    selectedPlayerId = null,
    passFromPlayerId = null,
    dragFromPlayer = null,
    movingPlayer = null,
    nodeActiveOwnerId = null,
    showPuckIndicator = true,
  } = options;

  const tilt = camera.tilt ?? 0;
  const z = camera.zoom;
  const k = Math.cos(tilt);
  const s = Math.sin(tilt);
  const m = cameraMatrix(camera);
  const currentHolder = getCurrentPuckHolder(players, events);

  // Height the pieces stand, growing as the sheet leans further back.
  const height = PLAYER_RADIUS * z * (1.5 + 1.9 * s);

  const projected = players
    .map(player => ({ player, g: applyAffine(m, player.x, player.y) }))
    .sort((a, b) => a.g.y - b.g.y); // far (higher on screen) first

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const { player, g } of projected) {
    const isHighlighted =
      dragFromPlayer?.id === player.id ||
      player.id === nodeActiveOwnerId ||
      player.id === passFromPlayerId ||
      movingPlayer?.id === player.id;
    const isPuckHolder = currentHolder?.id === player.id;
    const hasPuck =
      showPuckIndicator &&
      ((isPuckHolder && events.length > 0) || (player.hasPuck && events.length === 0));

    drawStandingPlayer(ctx, player, g, z, k, height, {
      isSelected: player.id === selectedPlayerId,
      isHighlighted,
      hasPuck,
    });
  }

  ctx.restore();
}

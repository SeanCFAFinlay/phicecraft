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
import { drawPuckMarker } from './puckMarker';

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
  const { isSelected, isDragging, isMoving, isPassFrom, isNodeActive, isPuckHolder, showInitialPuck, heading = 0, showRouteHandle = false, isPreparingReceive = false, playbackFrame, reducedEffects = false, trackedPuck, jersey } = options;
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
    drawDetailedGoalie(ctx, player, frame, isPuckHolder || showInitialPuck, trackedPuck, jersey);

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
  flags: { isSelected: boolean; isHighlighted: boolean; hasPuck: boolean },
  jersey: string
): void {
  const isGoalie = player.role === 'G';
  const bodyR = PLAYER_RADIUS * z * (isGoalie ? 1.05 : 0.86);
  const baseRy = Math.max(bodyR * 0.32, bodyR * k);
  const H = height;

  const jLight = shadeColor(jersey, 52);
  const jDark = shadeColor(jersey, -52);
  const pants = '#182432';
  const skin = '#e9b58c';
  const cx = g.x;

  // Vertical anatomy, feet at g.y and helmet crown at g.y - H.
  const skateY = g.y;
  const hipY = g.y - H * 0.30;
  const shoulderY = hipY - H * 0.42;
  const headR = bodyR * 0.72;
  const headCy = shoulderY - headR * 0.9;
  const shoulderHalf = bodyR * 1.12;
  const hipHalf = bodyR * 0.72;

  ctx.save();

  // Contact shadow.
  ellipse(ctx, cx, g.y + baseRy * 0.15, bodyR * 1.25, baseRy * 1.2);
  ctx.fillStyle = 'rgba(6, 16, 26, 0.34)';
  ctx.fill();

  // Selection / highlight ring on the ice.
  if (flags.isHighlighted || flags.isSelected) {
    ctx.save();
    ctx.setLineDash(flags.isHighlighted ? [] : [bodyR * 0.35, bodyR * 0.28]);
    ctx.lineWidth = Math.max(2, bodyR * 0.22);
    ctx.strokeStyle = flags.isHighlighted ? 'rgba(255, 210, 10, 0.95)' : shadeColor(jersey, 70);
    ellipse(ctx, cx, g.y + baseRy * 0.15, bodyR * 1.5, baseRy * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  const outline = 'rgba(4, 12, 20, 0.55)';
  const lw = Math.max(0.8, bodyR * 0.08);

  // Stick angled down to the ice (drawn behind the body).
  const bladeX = cx + (player.team === 'home' ? bodyR * 1.5 : bodyR * 1.5);
  ctx.strokeStyle = '#c9a24b';
  ctx.lineWidth = Math.max(1.2, bodyR * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + bodyR * 0.5, hipY - H * 0.05);
  ctx.lineTo(bladeX, g.y - baseRy * 0.1);
  ctx.stroke();
  ctx.strokeStyle = '#2a2f36';
  ctx.lineWidth = Math.max(1.4, bodyR * 0.2);
  ctx.beginPath();
  ctx.moveTo(bladeX - bodyR * 0.1, g.y - baseRy * 0.1);
  ctx.lineTo(bladeX + bodyR * 0.5, g.y + baseRy * 0.05);
  ctx.stroke();

  // Legs + skates.
  const legHalf = bodyR * 0.34;
  for (const sx of [-1, 1]) {
    const lx = cx + sx * hipHalf * 0.5;
    ctx.fillStyle = pants;
    roundedBar(ctx, lx, hipY, skateY - baseRy * 0.5, legHalf);
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
    // Skate blade.
    ctx.fillStyle = '#dfe6ec';
    ellipse(ctx, lx, skateY - baseRy * 0.15, legHalf * 1.5, Math.max(1.5, baseRy * 0.5));
    ctx.fill();
    ctx.fillStyle = '#0f1620';
    ctx.fillRect(lx - legHalf * 1.3, skateY - baseRy * 0.05, legHalf * 2.6, Math.max(1, bodyR * 0.08));
  }

  // Torso jersey: shoulders wider than hips.
  const bodyGrad = ctx.createLinearGradient(cx - shoulderHalf, 0, cx + shoulderHalf, 0);
  bodyGrad.addColorStop(0, jDark);
  bodyGrad.addColorStop(0.5, jersey);
  bodyGrad.addColorStop(1, jLight);
  ctx.beginPath();
  ctx.moveTo(cx - hipHalf, hipY);
  ctx.lineTo(cx - shoulderHalf, shoulderY + bodyR * 0.2);
  ctx.quadraticCurveTo(cx - shoulderHalf, shoulderY - bodyR * 0.15, cx - shoulderHalf * 0.55, shoulderY - bodyR * 0.2);
  ctx.quadraticCurveTo(cx, shoulderY - bodyR * 0.4, cx + shoulderHalf * 0.55, shoulderY - bodyR * 0.2);
  ctx.quadraticCurveTo(cx + shoulderHalf, shoulderY - bodyR * 0.15, cx + shoulderHalf, shoulderY + bodyR * 0.2);
  ctx.lineTo(cx + hipHalf, hipY);
  ctx.quadraticCurveTo(cx, hipY + bodyR * 0.32, cx - hipHalf, hipY);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Sleeve cuffs / trim stripe near the hem.
  ctx.strokeStyle = shadeColor(jersey, 80);
  ctx.lineWidth = Math.max(1, bodyR * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - hipHalf * 0.9, hipY - bodyR * 0.08);
  ctx.quadraticCurveTo(cx, hipY + bodyR * 0.16, cx + hipHalf * 0.9, hipY - bodyR * 0.08);
  ctx.stroke();

  // Number on the chest.
  const fs = Math.max(7, bodyR * 0.92);
  ctx.font = `800 ${fs}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const numY = (shoulderY + hipY) / 2;
  ctx.lineWidth = Math.max(1, fs * 0.16);
  ctx.strokeStyle = 'rgba(4, 12, 20, 0.6)';
  ctx.fillStyle = pickReadableText(jersey);
  ctx.strokeText(String(player.number), cx, numY);
  ctx.fillText(String(player.number), cx, numY);

  // Neck.
  ctx.fillStyle = skin;
  ctx.fillRect(cx - headR * 0.35, headCy + headR * 0.5, headR * 0.7, headR * 0.7);

  // Head: helmet dome + face + visor.
  const helmet = isGoalie ? shadeColor(jersey, -10) : jersey;
  // Face.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, headCy + headR * 0.15, headR * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(0.7, bodyR * 0.05);
  ctx.stroke();
  // Helmet dome (upper portion).
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (isGoalie) {
    // Cage bars on the mask.
    ctx.strokeStyle = 'rgba(30, 40, 52, 0.75)';
    ctx.lineWidth = Math.max(0.6, headR * 0.1);
    for (const oy of [-0.2, 0.1, 0.4]) {
      ctx.beginPath();
      ctx.moveTo(cx - headR * 0.7, headCy + headR * oy);
      ctx.lineTo(cx + headR * 0.7, headCy + headR * oy);
      ctx.stroke();
    }
  } else {
    // Visor band.
    ctx.fillStyle = 'rgba(150, 205, 235, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, headCy + headR * 0.12, headR * 0.7, headR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Puck at the stick blade, the same object the flat view draws. `z` is the
  // depth scale the whole piece is already drawn at, so the puck shrinks with
  // distance along with everything else.
  if (flags.hasPuck) {
    drawPuckMarker(ctx, bladeX + bodyR * 0.35, g.y + baseRy * 0.05, 0, z);
  }

  ctx.restore();
}

/** A vertical rounded bar (limb) from yTop to yBottom, centred at x. */
function roundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
  half: number
): void {
  ctx.beginPath();
  ctx.moveTo(x - half, yTop);
  ctx.lineTo(x - half, yBottom);
  ctx.arc(x, yBottom, half, Math.PI, 0, true);
  ctx.lineTo(x + half, yTop);
  ctx.arc(x, yTop, half, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
}

/** Pick black or white text for contrast against a jersey colour. */
function pickReadableText(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const lum = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
  return lum > 150 ? '#111820' : '#ffffff';
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
  options: DrawPlayersOptions = {},
  jerseys: { home: string; away: string } = { home: COLORS.home.primary, away: COLORS.away.primary }
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

    drawStandingPlayer(
      ctx,
      player,
      g,
      z,
      k,
      height,
      {
        isSelected: player.id === selectedPlayerId,
        isHighlighted,
        hasPuck,
      },
      player.team === 'home' ? jerseys.home : jerseys.away
    );
  }

  ctx.restore();
}

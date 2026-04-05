// ============================================================================
// PLAYER RENDERER - Player circle drawing
// ============================================================================

import type { Player, ID, DrillEvent } from '@/core/types';
import { PLAYER_RADIUS, GOALIE_RING_OFFSET, COLORS, RINK } from '@/core/constants';
import { getCurrentPuckHolder } from '@/engine/puck';

interface PlayerRenderOptions {
  isSelected: boolean;
  isDragging: boolean;
  isMoving: boolean;
  isPassFrom: boolean;
  isNodeActive: boolean;
  isPuckHolder: boolean;
  showInitialPuck: boolean;
}

/**
 * Draw a single player
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  options: PlayerRenderOptions
): void {
  const { isSelected, isDragging, isMoving, isPassFrom, isNodeActive, isPuckHolder, showInitialPuck } = options;
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

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.beginPath();
  ctx.ellipse(player.x + 1, player.y + 4, pr, pr * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body gradient
  const gradient = ctx.createRadialGradient(
    player.x - pr * 0.3,
    player.y - pr * 0.3,
    0,
    player.x,
    player.y,
    pr
  );

  if (player.team === 'home') {
    gradient.addColorStop(0, COLORS.home.light);
    gradient.addColorStop(1, COLORS.home.dark);
  } else if (player.team === 'away') {
    gradient.addColorStop(0, COLORS.away.light);
    gradient.addColorStop(1, COLORS.away.dark);
  } else {
    gradient.addColorStop(0, '#ccc');
    gradient.addColorStop(1, '#555');
  }

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(player.x, player.y, pr, 0, Math.PI * 2);
  ctx.fill();

  // Shine highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.beginPath();
  ctx.arc(player.x - pr * 0.28, player.y - pr * 0.28, pr * 0.43, 0, Math.PI * 2);
  ctx.fill();

  // Border
  let borderColor: string;
  let borderWidth: number;

  if (isHighlighted) {
    borderColor = COLORS.gold;
    borderWidth = 2.5;
  } else if (isSelected) {
    borderColor = player.team === 'home' ? COLORS.home.light : COLORS.away.light;
    borderWidth = 2.5;
  } else {
    borderColor = 'rgba(255, 255, 255, 0.36)';
    borderWidth = 1.5;
  }

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(player.x, player.y, pr, 0, Math.PI * 2);
  ctx.stroke();

  // Goalie ring
  if (player.role === 'G') {
    ctx.strokeStyle = 'rgba(255, 202, 0, 0.88)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, pr + GOALIE_RING_OFFSET, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Number
  const fontSize = Math.max(8, Math.round(pr * 0.82));
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.number, player.x, player.y + 1);

  // Puck indicator
  if (showInitialPuck || isPuckHolder) {
    ctx.fillStyle = COLORS.puck.fill;
    ctx.strokeStyle = COLORS.puck.stroke;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      player.x + pr * 0.72,
      player.y + pr * 0.72,
      6.5,
      4.5,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draw all players
 */
export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  events: DrillEvent[],
  selectedPlayerId: ID | null,
  passFromPlayerId: ID | null,
  dragFromPlayer: Player | null,
  movingPlayer: Player | null,
  nodeActiveOwnerId: ID | null
): void {
  const currentHolder = getCurrentPuckHolder(players, events);

  players.forEach(player => {
    const isPuckHolder = currentHolder?.id === player.id;
    const showInitialPuck = player.hasPuck && events.length === 0;

    drawPlayer(ctx, player, {
      isSelected: player.id === selectedPlayerId,
      isDragging: dragFromPlayer?.id === player.id,
      isMoving: movingPlayer?.id === player.id,
      isPassFrom: player.id === passFromPlayerId,
      isNodeActive: player.id === nodeActiveOwnerId,
      isPuckHolder: isPuckHolder && events.length > 0,
      showInitialPuck,
    });
  });
}

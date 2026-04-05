// ============================================================================
// PATH RENDERER - Skate paths, passes, shots visualization
// ============================================================================

import type { Point, SkatePath, DrillEvent, Player, ID } from '@/core/types';
import { COLORS, RINK } from '@/core/constants';
import { generateArcPoints, pointAtParameter } from '@/utils/geometry';

/**
 * Draw an arrow head at the end of a line
 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  size: number = 11
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - 0.38), y2 - size * Math.sin(angle - 0.38));
  ctx.lineTo(x2 - size * Math.cos(angle + 0.38), y2 - size * Math.sin(angle + 0.38));
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a curved line with arrow
 */
function drawCurvedLine(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  dashed: boolean,
  lineWidth: number = 2.5
): void {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashed ? [9, 6] : []);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }

  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head
  const n = points.length;
  drawArrowHead(
    ctx,
    points[n - 2].x,
    points[n - 2].y,
    points[n - 1].x,
    points[n - 1].y,
    color,
    12
  );

  ctx.restore();
}

/**
 * Draw a small badge with a number
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string
): void {
  // Background
  ctx.fillStyle = 'rgba(4, 10, 18, 0.92)';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.stroke();

  // Text
  ctx.fillStyle = color;
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5);
}

/**
 * Draw a puck dot indicator
 */
function drawPuckDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw a skate path
 */
export function drawSkatePath(
  ctx: CanvasRenderingContext2D,
  path: SkatePath
): void {
  const color = path.team === 'home'
    ? 'rgba(215, 48, 58, 0.82)'
    : 'rgba(48, 128, 255, 0.82)';

  // Glow effect
  ctx.save();
  ctx.strokeStyle = color.replace('0.82', '0.07');
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  path.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();

  // Main line (dashed)
  drawCurvedLine(ctx, path.points, color, true, 2.6);

  // Diamond markers at 25%, 50%, 75%
  [0.25, 0.5, 0.75].forEach(t => {
    const pt = pointAtParameter(path.points, t);
    const r = 4;
    ctx.fillStyle = color.replace('0.82', '0.42');
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y - r);
    ctx.lineTo(pt.x + r, pt.y);
    ctx.lineTo(pt.x, pt.y + r);
    ctx.lineTo(pt.x - r, pt.y);
    ctx.closePath();
    ctx.fill();
  });
}

/**
 * Draw all skate paths
 */
export function drawSkatePaths(
  ctx: CanvasRenderingContext2D,
  paths: SkatePath[]
): void {
  paths.forEach(path => drawSkatePath(ctx, path));
}

/**
 * Draw a raw skate path being drawn
 */
export function drawRawSkate(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  team: 'home' | 'away'
): void {
  if (points.length < 2) return;

  const color = team === 'home'
    ? 'rgba(215, 48, 58, 0.28)'
    : 'rgba(48, 128, 255, 0.28)';

  drawCurvedLine(ctx, points, color, true, 2);
}

/**
 * Draw pass event
 */
export function drawPassEvent(
  ctx: CanvasRenderingContext2D,
  event: DrillEvent & { type: 'pass' },
  eventNumber: number
): void {
  const color = event.team === 'home'
    ? COLORS.pass.home
    : COLORS.pass.away;

  const arcPoints = generateArcPoints(
    event.fromPoint.x,
    event.fromPoint.y,
    event.toPoint.x,
    event.toPoint.y,
    0.18
  );

  drawCurvedLine(ctx, arcPoints, color, false, 2.8);

  // Puck dots at start and end
  drawPuckDot(ctx, event.fromPoint.x, event.fromPoint.y, color);
  drawPuckDot(ctx, event.toPoint.x, event.toPoint.y, color);

  // Badge at midpoint
  const mp = arcPoints[Math.floor(arcPoints.length / 2)];
  const dx = event.toPoint.x - event.fromPoint.x;
  const dy = event.toPoint.y - event.fromPoint.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  drawBadge(ctx, mp.x - (dy / len) * 14, mp.y + (dx / len) * 14, String(eventNumber), color);
}

/**
 * Draw shot event
 */
export function drawShotEvent(
  ctx: CanvasRenderingContext2D,
  event: DrillEvent & { type: 'shot' | 'dump' },
  eventNumber: number
): void {
  const color = COLORS.shot;

  const arcPoints = generateArcPoints(
    event.fromPoint.x,
    event.fromPoint.y,
    event.toPoint.x,
    event.toPoint.y,
    0.06
  );

  drawCurvedLine(ctx, arcPoints, color, false, 3);

  // Target flash ring at net
  ctx.strokeStyle = 'rgba(255, 107, 15, 0.32)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(event.toPoint.x, event.toPoint.y, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Badge
  const mp = arcPoints[Math.floor(arcPoints.length / 2)];
  drawBadge(ctx, mp.x, mp.y - 16, String(eventNumber), color);
}

/**
 * Draw all drill events
 */
export function drawEvents(
  ctx: CanvasRenderingContext2D,
  events: DrillEvent[]
): void {
  events.forEach((event, index) => {
    const eventNumber = index + 1;

    if (event.type === 'pass') {
      drawPassEvent(ctx, event, eventNumber);
    } else if (event.type === 'shot' || event.type === 'dump') {
      drawShotEvent(ctx, event, eventNumber);
    }
  });
}

/**
 * Draw drag preview (pass or shot being dragged)
 */
export function drawDragPreview(
  ctx: CanvasRenderingContext2D,
  dragType: 'pass' | 'shoot',
  fromPoint: Point,
  toPoint: Point,
  targetPlayer: Player | null,
  rinkHeight: number
): void {
  const color = dragType === 'pass'
    ? 'rgba(255, 210, 10, 0.7)'
    : 'rgba(255, 107, 15, 0.7)';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(fromPoint.x, fromPoint.y);
  ctx.lineTo(toPoint.x, toPoint.y);
  ctx.stroke();

  ctx.setLineDash([]);
  drawArrowHead(ctx, fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, color, 13);

  // Highlight target player for pass
  if (dragType === 'pass' && targetPlayer) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(targetPlayer.x, targetPlayer.y, rinkHeight * 0.055, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PASS -> #${targetPlayer.number}`, targetPlayer.x, targetPlayer.y - rinkHeight * 0.058 - 12);
  }

  // Highlight nets for shot
  if (dragType === 'shoot') {
    const netL = { x: RINK.netLeftX, y: RINK.netLeftY };
    const netR = { x: RINK.netRightX, y: RINK.netRightY };

    const distL = Math.sqrt((toPoint.x - netL.x) ** 2 + (toPoint.y - netL.y) ** 2);
    const distR = Math.sqrt((toPoint.x - netR.x) ** 2 + (toPoint.y - netR.y) ** 2);
    const nearerNet = distL < distR ? netL : netR;

    [netL, netR].forEach(net => {
      const isNear = net === nearerNet;
      ctx.strokeStyle = isNear ? 'rgba(255, 107, 15, 0.7)' : 'rgba(255, 107, 15, 0.25)';
      ctx.lineWidth = isNear ? 2.5 : 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(net.x, net.y, 26, 0, Math.PI * 2);
      ctx.stroke();

      if (isNear) {
        ctx.fillStyle = 'rgba(255, 107, 15, 0.65)';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SHOOT', net.x, net.y);
      }
    });
  }

  ctx.restore();
}

/**
 * Draw ghost trails during playback
 */
export function drawGhostTrails(
  ctx: CanvasRenderingContext2D,
  trails: Map<ID, Point[]>,
  players: Player[]
): void {
  trails.forEach((trail, playerId) => {
    if (!trail || trail.length < 2) return;

    const player = players.find(p => p.id === playerId);
    const rgb = player
      ? player.team === 'home' ? '220, 57, 70' : '58, 134, 255'
      : '180, 180, 180';

    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.26;
      const width = Math.max(1, (i / trail.length) * 5);

      ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }

    ctx.restore();
  });
}

/**
 * Draw animated puck
 */
export function drawAnimatedPuck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
): void {
  ctx.fillStyle = '#111';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw pass-from selection highlight
 */
export function drawPassFromHighlight(
  ctx: CanvasRenderingContext2D,
  player: Player
): void {
  ctx.strokeStyle = 'rgba(255, 210, 10, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(player.x, player.y, RINK.height * 0.044 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================================================
// COACH RENDERER
//
// The big bearded coach standing on the ice, rendered top-down in the flat
// diagram: a heavy dark disc with a toque band, a beard arc and a little
// clipboard, so it never reads as a skater.
// ============================================================================

import type { CoachMarker } from '@/core/types';
import { PLAYER_RADIUS } from '@/core/constants';

const COACH_RADIUS = PLAYER_RADIUS * 1.28;

const JACKET_LIGHT = '#33475f';
const JACKET_DARK = '#141d28';
const SKIN = '#e7b48c';
const BEARD = '#6f4a2c';
const TOQUE = '#b5313b';

function ellipsePath(
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
 * Top-down coach marker for the flat diagram: a heavy dark disc with a toque
 * band, a beard arc and a little clipboard so it never reads as a skater.
 */
export function drawCoachTopDown(
  ctx: CanvasRenderingContext2D,
  coach: CoachMarker,
  isSelected: boolean
): void {
  const { x, y } = coach;
  const r = COACH_RADIUS;

  if (isSelected) {
    ctx.strokeStyle = 'rgba(255, 210, 10, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ellipsePath(ctx, x, y, r + 10, r + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Jacket / body disc.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, JACKET_LIGHT);
  g.addColorStop(1, JACKET_DARK);
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // Toque band across the top of the head.
  ctx.fillStyle = TOQUE;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.12, r * 0.62, r * 0.5, 0, Math.PI, 0);
  ctx.fill();

  // Face.
  ctx.fillStyle = SKIN;
  ellipsePath(ctx, x, y + r * 0.06, r * 0.52, r * 0.5);
  ctx.fill();

  // Beard covering the lower face.
  ctx.fillStyle = BEARD;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.52, r * 0.42, 0, 0, Math.PI);
  ctx.fill();

  // Clipboard tucked to the side.
  ctx.fillStyle = '#d9c38a';
  ctx.strokeStyle = JACKET_DARK;
  ctx.lineWidth = 1;
  ctx.fillRect(x + r * 0.5, y - r * 0.2, r * 0.5, r * 0.66);
  ctx.strokeRect(x + r * 0.5, y - r * 0.2, r * 0.5, r * 0.66);

  // Label.
  ctx.fillStyle = 'rgba(230, 240, 248, 0.9)';
  ctx.font = `700 ${Math.max(6, r * 0.42)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('COACH', x, y + r + 2);
}

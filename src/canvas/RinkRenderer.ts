// ============================================================================
// RINK RENDERER - Hockey rink drawing
// ============================================================================

import { RINK, COLORS } from '@/core/constants';

/**
 * Draw a rounded rectangle path
 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Draw goal crease
 */
function drawCrease(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  depth: number,
  height: number,
  left: boolean
): void {
  ctx.fillStyle = COLORS.crease.fill;
  ctx.strokeStyle = COLORS.crease.stroke;
  ctx.lineWidth = 1.8;

  ctx.beginPath();
  if (left) {
    ctx.moveTo(cx, cy - height / 2);
    ctx.lineTo(cx + depth, cy - height / 2);
    ctx.arc(cx + depth, cy, height / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx, cy + height / 2);
  } else {
    ctx.moveTo(cx, cy - height / 2);
    ctx.lineTo(cx - depth, cy - height / 2);
    ctx.arc(cx - depth, cy, height / 2, Math.PI * 1.5, Math.PI / 2, true);
    ctx.lineTo(cx, cy + height / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw net
 */
function drawNet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  left: boolean
): void {
  const netWidth = size * 0.58;
  const netHeight = size * 1.28;
  const sx = left ? cx : cx - netWidth;

  // Frame
  ctx.strokeStyle = 'rgba(230, 70, 70, 0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.strokeRect(sx, cy - netHeight / 2, netWidth, netHeight);

  // Net mesh
  ctx.strokeStyle = 'rgba(200, 200, 200, 0.18)';
  ctx.lineWidth = 0.8;

  for (let i = 1; i < 3; i++) {
    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(sx, cy - netHeight / 2 + (netHeight / 3) * i);
    ctx.lineTo(sx + netWidth, cy - netHeight / 2 + (netHeight / 3) * i);
    ctx.stroke();

    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(sx + (netWidth / 3) * i, cy - netHeight / 2);
    ctx.lineTo(sx + (netWidth / 3) * i, cy + netHeight / 2);
    ctx.stroke();
  }
}

/**
 * Draw the complete hockey rink
 */
export function drawRink(ctx: CanvasRenderingContext2D): void {
  const rx = RINK.x;
  const ry = RINK.y;
  const rw = RINK.width;
  const rh = RINK.height;
  const cr = RINK.cornerRadius;

  // Clip to rink shape
  roundedRectPath(ctx, rx, ry, rw, rh, cr);
  ctx.save();
  ctx.clip();

  // Ice gradient
  const iceGradient = ctx.createLinearGradient(rx, ry, rx, ry + rh);
  iceGradient.addColorStop(0, COLORS.ice.light);
  iceGradient.addColorStop(0.5, COLORS.ice.mid);
  iceGradient.addColorStop(1, COLORS.ice.dark);
  ctx.fillStyle = iceGradient;
  ctx.fillRect(rx, ry, rw, rh);

  // Red center line
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = 4;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, ry + 2);
  ctx.lineTo(rx + rw / 2, ry + rh - 2);
  ctx.stroke();

  // Blue lines
  const blueLineX = rw * RINK.blueLineOffset;
  ctx.strokeStyle = COLORS.blueLine;
  ctx.lineWidth = 6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(rx + blueLineX, ry + 2);
  ctx.lineTo(rx + blueLineX, ry + rh - 2);
  ctx.moveTo(rx + rw - blueLineX, ry + 2);
  ctx.lineTo(rx + rw - blueLineX, ry + rh - 2);
  ctx.stroke();

  // Center circle
  ctx.strokeStyle = 'rgba(190, 12, 12, 0.25)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(rx + rw / 2, ry + rh / 2, rh * 0.22, 0, Math.PI * 2);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = 'rgba(190, 12, 12, 0.7)';
  ctx.beginPath();
  ctx.arc(rx + rw / 2, ry + rh / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Goal lines
  const goalLineX = rw * RINK.goalLineOffset;
  ctx.strokeStyle = 'rgba(190, 12, 12, 0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rx + goalLineX, ry + rh * 0.1);
  ctx.lineTo(rx + goalLineX, ry + rh * 0.9);
  ctx.moveTo(rx + rw - goalLineX, ry + rh * 0.1);
  ctx.lineTo(rx + rw - goalLineX, ry + rh * 0.9);
  ctx.stroke();

  // Creases
  const creaseDepth = rh * 0.09;
  const creaseHeight = rh * 0.16;
  drawCrease(ctx, rx + goalLineX, ry + rh / 2, creaseDepth, creaseHeight, true);
  drawCrease(ctx, rx + rw - goalLineX, ry + rh / 2, creaseDepth, creaseHeight, false);

  // Faceoff circles
  const faceoffCircles = [
    [rx + blueLineX * 0.62, ry + rh * 0.27],
    [rx + blueLineX * 0.62, ry + rh * 0.73],
    [rx + rw - blueLineX * 0.62, ry + rh * 0.27],
    [rx + rw - blueLineX * 0.62, ry + rh * 0.73],
  ];

  faceoffCircles.forEach(([fx, fy]) => {
    // Circle
    ctx.strokeStyle = 'rgba(190, 12, 12, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, rh * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    // Dot
    ctx.fillStyle = 'rgba(190, 12, 12, 0.7)';
    ctx.beginPath();
    ctx.arc(fx, fy, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(85, 155, 210, 0.65)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, rx, ry, rw, rh, cr);
  ctx.stroke();

  // Nets (outside clip)
  const netSize = rh * 0.065;
  drawNet(ctx, rx + rw * 0.019, ry + rh / 2, netSize, true);
  drawNet(ctx, rx + rw * 0.981, ry + rh / 2, netSize, false);
}

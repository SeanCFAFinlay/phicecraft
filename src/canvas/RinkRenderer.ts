// ============================================================================
// RINK RENDERER - Professional NHL Hockey Rink
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
 * Draw faceoff dot
 */
function drawFaceoffDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number = 6
): void {
  ctx.fillStyle = '#c41e3a';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw faceoff circle with hashmarks
 */
function drawFaceoffCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  isEndZone: boolean = true
): void {
  // Circle
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Center dot
  drawFaceoffDot(ctx, cx, cy);

  if (isEndZone) {
    // Hashmarks - 4 sets around the circle
    const hashLength = 18;
    const hashOffset = 6;
    const angles = [
      -Math.PI / 4,      // Top-right
      Math.PI / 4,       // Bottom-right
      Math.PI * 3 / 4,   // Bottom-left
      -Math.PI * 3 / 4   // Top-left
    ];

    ctx.strokeStyle = '#c41e3a';
    ctx.lineWidth = 2;

    angles.forEach(angle => {
      // Outer hashmark
      const outerX = cx + Math.cos(angle) * (radius + hashOffset);
      const outerY = cy + Math.sin(angle) * (radius + hashOffset);

      // Perpendicular direction
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);

      ctx.beginPath();
      ctx.moveTo(outerX - perpX * hashLength / 2, outerY - perpY * hashLength / 2);
      ctx.lineTo(outerX + perpX * hashLength / 2, outerY + perpY * hashLength / 2);
      ctx.stroke();
    });

    // L-shaped marks inside circle at top and bottom
    const lOffset = radius * 0.65;
    const lWidth = 12;
    const lHeight = 20;

    ctx.lineWidth = 2;

    // Top L marks
    [-1, 1].forEach(side => {
      ctx.beginPath();
      // Vertical part
      ctx.moveTo(cx + side * lOffset, cy - lWidth);
      ctx.lineTo(cx + side * lOffset, cy - lWidth - lHeight);
      // Horizontal part
      ctx.lineTo(cx + side * (lOffset - side * 8), cy - lWidth - lHeight);
      ctx.stroke();
    });

    // Bottom L marks
    [-1, 1].forEach(side => {
      ctx.beginPath();
      // Vertical part
      ctx.moveTo(cx + side * lOffset, cy + lWidth);
      ctx.lineTo(cx + side * lOffset, cy + lWidth + lHeight);
      // Horizontal part
      ctx.lineTo(cx + side * (lOffset - side * 8), cy + lWidth + lHeight);
      ctx.stroke();
    });
  }
}

/**
 * Draw goal crease (blue paint)
 */
function drawCrease(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  isLeft: boolean
): void {
  const creaseWidth = 48;
  const creaseDepth = 24;
  const creaseRadius = 36;

  ctx.fillStyle = 'rgba(30, 80, 180, 0.25)';
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(cx, cy - creaseWidth / 2);
    ctx.lineTo(cx + creaseDepth, cy - creaseWidth / 2);
    ctx.arc(cx + creaseDepth, cy, creaseRadius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx, cy + creaseWidth / 2);
    ctx.closePath();
  } else {
    ctx.moveTo(cx, cy - creaseWidth / 2);
    ctx.lineTo(cx - creaseDepth, cy - creaseWidth / 2);
    ctx.arc(cx - creaseDepth, cy, creaseRadius, Math.PI * 1.5, Math.PI / 2, true);
    ctx.lineTo(cx, cy + creaseWidth / 2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw trapezoid behind net
 */
function drawTrapezoid(
  ctx: CanvasRenderingContext2D,
  goalLineX: number,
  rinkY: number,
  rinkHeight: number,
  isLeft: boolean
): void {
  const trapTop = 56;      // Width at goal line
  const trapBottom = 88;   // Width at boards
  const trapDepth = 34;    // Distance from goal line to boards

  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2;

  const cy = rinkY + rinkHeight / 2;

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(goalLineX, cy - trapTop / 2);
    ctx.lineTo(goalLineX - trapDepth, cy - trapBottom / 2);
    ctx.moveTo(goalLineX, cy + trapTop / 2);
    ctx.lineTo(goalLineX - trapDepth, cy + trapBottom / 2);
  } else {
    ctx.moveTo(goalLineX, cy - trapTop / 2);
    ctx.lineTo(goalLineX + trapDepth, cy - trapBottom / 2);
    ctx.moveTo(goalLineX, cy + trapTop / 2);
    ctx.lineTo(goalLineX + trapDepth, cy + trapBottom / 2);
  }
  ctx.stroke();
}

/**
 * Draw the goal/net
 */
function drawNet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  isLeft: boolean
): void {
  const netWidth = 24;
  const netHeight = 48;

  // Net frame (red posts)
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 4;

  const nx = isLeft ? cx - netWidth : cx;

  ctx.beginPath();
  ctx.moveTo(nx, cy - netHeight / 2);
  ctx.lineTo(nx, cy + netHeight / 2);
  ctx.moveTo(nx + netWidth, cy - netHeight / 2);
  ctx.lineTo(nx + netWidth, cy + netHeight / 2);
  // Back of net
  if (isLeft) {
    ctx.moveTo(nx, cy - netHeight / 2);
    ctx.lineTo(nx, cy + netHeight / 2);
  } else {
    ctx.moveTo(nx + netWidth, cy - netHeight / 2);
    ctx.lineTo(nx + netWidth, cy + netHeight / 2);
  }
  ctx.stroke();

  // Net mesh
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.5;

  const meshSpacing = 8;
  for (let i = 1; i < netHeight / meshSpacing; i++) {
    ctx.beginPath();
    ctx.moveTo(nx, cy - netHeight / 2 + i * meshSpacing);
    ctx.lineTo(nx + netWidth, cy - netHeight / 2 + i * meshSpacing);
    ctx.stroke();
  }
  for (let i = 1; i < netWidth / meshSpacing; i++) {
    ctx.beginPath();
    ctx.moveTo(nx + i * meshSpacing, cy - netHeight / 2);
    ctx.lineTo(nx + i * meshSpacing, cy + netHeight / 2);
    ctx.stroke();
  }
}

/**
 * Draw center ice logo area
 */
function drawCenterIce(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  // Center circle
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Center dot
  drawFaceoffDot(ctx, cx, cy, 8);

  // Inner decorative circle (optional team logo area)
  ctx.strokeStyle = 'rgba(196, 30, 58, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();
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

  // Ice surface - clean white with subtle gradient
  const iceGradient = ctx.createLinearGradient(rx, ry, rx, ry + rh);
  iceGradient.addColorStop(0, '#ffffff');
  iceGradient.addColorStop(0.5, '#f8fafc');
  iceGradient.addColorStop(1, '#f1f5f9');
  ctx.fillStyle = iceGradient;
  ctx.fillRect(rx, ry, rw, rh);

  // Add subtle ice texture
  ctx.fillStyle = 'rgba(200, 220, 240, 0.08)';
  for (let i = 0; i < 50; i++) {
    const tx = rx + Math.random() * rw;
    const ty = ry + Math.random() * rh;
    ctx.beginPath();
    ctx.arc(tx, ty, Math.random() * 15 + 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Goal lines
  const goalLineX = rw * RINK.goalLineOffset;
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx + goalLineX, ry);
  ctx.lineTo(rx + goalLineX, ry + rh);
  ctx.moveTo(rx + rw - goalLineX, ry);
  ctx.lineTo(rx + rw - goalLineX, ry + rh);
  ctx.stroke();

  // Blue lines
  const blueLineX = rw * RINK.blueLineOffset;
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(rx + blueLineX, ry);
  ctx.lineTo(rx + blueLineX, ry + rh);
  ctx.moveTo(rx + rw - blueLineX, ry);
  ctx.lineTo(rx + rw - blueLineX, ry + rh);
  ctx.stroke();

  // Center red line (dashed)
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 12;
  ctx.setLineDash([20, 20]);
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, ry);
  ctx.lineTo(rx + rw / 2, ry + rh);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center ice circle
  const centerRadius = rh * 0.3;
  drawCenterIce(ctx, rx + rw / 2, ry + rh / 2, centerRadius);

  // End zone faceoff circles (4 total)
  const faceoffRadius = rh * 0.28;
  const faceoffY1 = ry + rh * 0.28;
  const faceoffY2 = ry + rh * 0.72;
  const faceoffXLeft = rx + blueLineX * 0.5;
  const faceoffXRight = rx + rw - blueLineX * 0.5;

  drawFaceoffCircle(ctx, faceoffXLeft, faceoffY1, faceoffRadius, true);
  drawFaceoffCircle(ctx, faceoffXLeft, faceoffY2, faceoffRadius, true);
  drawFaceoffCircle(ctx, faceoffXRight, faceoffY1, faceoffRadius, true);
  drawFaceoffCircle(ctx, faceoffXRight, faceoffY2, faceoffRadius, true);

  // Neutral zone faceoff dots (4 total)
  const neutralDotOffset = 28;
  drawFaceoffDot(ctx, rx + blueLineX + neutralDotOffset, faceoffY1, 5);
  drawFaceoffDot(ctx, rx + blueLineX + neutralDotOffset, faceoffY2, 5);
  drawFaceoffDot(ctx, rx + rw - blueLineX - neutralDotOffset, faceoffY1, 5);
  drawFaceoffDot(ctx, rx + rw - blueLineX - neutralDotOffset, faceoffY2, 5);

  // Creases
  drawCrease(ctx, rx + goalLineX, ry + rh / 2, true);
  drawCrease(ctx, rx + rw - goalLineX, ry + rh / 2, false);

  // Trapezoids
  drawTrapezoid(ctx, rx + goalLineX, ry, rh, true);
  drawTrapezoid(ctx, rx + rw - goalLineX, ry, rh, false);

  // Referee crease (half circle at center ice)
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rx + rw / 2, ry + rh, 20, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore();

  // Boards (thick dark border)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  roundedRectPath(ctx, rx, ry, rw, rh, cr);
  ctx.stroke();

  // Glass reflection effect on boards
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  roundedRectPath(ctx, rx + 3, ry + 3, rw - 6, rh - 6, cr - 3);
  ctx.stroke();

  // Nets
  drawNet(ctx, rx + goalLineX - 4, ry + rh / 2, true);
  drawNet(ctx, rx + rw - goalLineX + 4, ry + rh / 2, false);
}

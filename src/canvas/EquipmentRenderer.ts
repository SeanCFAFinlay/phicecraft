// ============================================================================
// EQUIPMENT RENDERER
//
// Top-down visual representations of training equipment placed on the ice:
// cones, tires, mini-nets, divider pads / bumpers, and puck piles.
// Rendered on the dynamic 2D canvas and in thumbnails.
// ============================================================================

import type { EquipmentItem, Point } from '@/core/types';

export function drawCone(ctx: CanvasRenderingContext2D, point: Point): void {
  ctx.save();
  ctx.translate(point.x, point.y);

  // Soft contact shadow on ice
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Orange cone base
  ctx.fillStyle = '#f97316'; // safety orange
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  // Outer border ring
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // White reflective stripe ring
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Cone tip center
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawTire(ctx: CanvasRenderingContext2D, point: Point): void {
  ctx.save();
  ctx.translate(point.x, point.y);

  // Soft shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.arc(1, 2, 13, 0, Math.PI * 2);
  ctx.fill();

  // Outer rubber
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  // Tread highlight ring
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.stroke();

  // Inner rim / hollow
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawMiniNet(ctx: CanvasRenderingContext2D, point: Point, rotation = 0): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  if (rotation) ctx.rotate(rotation);

  const w = 28;
  const d = 16;
  const halfW = w / 2;

  // Netting interior
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-halfW, 0);
  ctx.lineTo(-halfW * 0.7, d);
  ctx.lineTo(halfW * 0.7, d);
  ctx.lineTo(halfW, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cross mesh lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.5, 0);
  ctx.lineTo(-halfW * 0.35, d);
  ctx.moveTo(halfW * 0.5, 0);
  ctx.lineTo(halfW * 0.35, d);
  ctx.moveTo(-halfW * 0.85, d * 0.5);
  ctx.lineTo(halfW * 0.85, d * 0.5);
  ctx.stroke();

  // Goal frame: red posts and crossbar
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-halfW, d);
  ctx.lineTo(-halfW, 0);
  ctx.lineTo(halfW, 0);
  ctx.lineTo(halfW, d);
  ctx.stroke();

  ctx.restore();
}

export function drawBarrier(
  ctx: CanvasRenderingContext2D,
  point: Point,
  size?: { width: number; height: number },
  rotation = 0
): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  if (rotation) ctx.rotate(rotation);

  const w = size?.width ?? 64;
  const h = size?.height ?? 16;
  const r = h / 2;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 1, -h / 2 + 2, w, h, r);
  ctx.fill();

  // Padded divider body (foam bumper blue)
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();

  // Accent stripe / edge piping
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawPuckPile(ctx: CanvasRenderingContext2D, point: Point, count = 5): void {
  ctx.save();
  ctx.translate(point.x, point.y);

  const offsets = [
    { x: -5, y: -3 },
    { x: 4, y: -4 },
    { x: -3, y: 4 },
    { x: 5, y: 3 },
    { x: 0, y: 0 },
  ];

  const n = Math.min(count, offsets.length);
  for (let i = 0; i < n; i++) {
    const { x, y } = offsets[i];
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawEquipmentItem(ctx: CanvasRenderingContext2D, item: EquipmentItem): void {
  switch (item.kind) {
    case 'cone':
      drawCone(ctx, item.position);
      break;
    case 'tire':
      drawTire(ctx, item.position);
      break;
    case 'mini-net':
      drawMiniNet(ctx, item.position, item.rotation);
      break;
    case 'barrier':
    case 'gate':
      drawBarrier(ctx, item.position, item.size, item.rotation);
      break;
    case 'puck-pile':
      drawPuckPile(ctx, item.position, item.count ?? 5);
      break;
    default:
      drawCone(ctx, item.position);
      break;
  }
}

export function drawEquipment(ctx: CanvasRenderingContext2D, items: EquipmentItem[]): void {
  for (const item of items) {
    drawEquipmentItem(ctx, item);
  }
}

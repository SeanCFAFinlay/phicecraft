// ============================================================================
// EQUIPMENT RENDERER
//
// High-fidelity top-down visual representations of training equipment:
// - Pylons / cones (weighted square base, radial conical shading, reflective collar)
// - Heavy rubber training tires (perimeter tread blocks, inner bead, hollow center)
// - Mini-nets / target nets (regulation red tubular frame, diamond nylon mesh, ice shadow)
// - Passing gates (dual cone pylons with cross-hurdle rail and chevron stripes)
// - Divider pads / bumpers (heavy vinyl casing, edge piping, end handles)
// - Puck piles (knurled vulcanized rubber pucks with specular highlights)
// ============================================================================

import type { EquipmentItem, Point } from '@/core/types';

/**
 * Draw a realistic hockey training pylon / cone with weighted base and reflective collar.
 */
export function drawCone(ctx: CanvasRenderingContext2D, point: Point): void {
  ctx.save();
  ctx.translate(point.x, point.y);

  // Soft directional ice shadow
  ctx.fillStyle = 'rgba(0, 15, 30, 0.28)';
  ctx.beginPath();
  ctx.ellipse(1.5, 3.5, 12, 7.5, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Weighted square rubber base with rounded corners
  const baseSize = 18;
  const halfBase = baseSize / 2;
  ctx.fillStyle = '#9a3412';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-halfBase, -halfBase, baseSize, baseSize, 3.5);
  } else if (ctx.rect) {
    ctx.rect(-halfBase, -halfBase, baseSize, baseSize);
  } else {
    ctx.arc(0, 0, halfBase, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Conical body with 3D radial gradient
  const coneRadius = 7.8;
  ctx.beginPath();
  ctx.arc(0, 0, coneRadius, 0, Math.PI * 2);
  if (ctx.createRadialGradient) {
    const grad = ctx.createRadialGradient(-1.5, -2, 1, 0, 0, coneRadius);
    grad.addColorStop(0, '#ff7a1a');
    grad.addColorStop(0.65, '#ea580c');
    grad.addColorStop(1, '#c2410c');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#ea580c';
  }
  ctx.fill();

  // Concentric reflective white vinyl collar
  const bandRadius = 4.8;
  ctx.beginPath();
  ctx.arc(0, 0, bandRadius, 0, Math.PI * 2);
  if (ctx.createRadialGradient) {
    const whiteGrad = ctx.createRadialGradient(-1, -1.2, 0.5, 0, 0, bandRadius);
    whiteGrad.addColorStop(0, '#ffffff');
    whiteGrad.addColorStop(0.85, '#f1f5f9');
    whiteGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = whiteGrad;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fill();

  ctx.strokeStyle = 'rgba(194, 65, 12, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Cone tip aperture hole
  ctx.fillStyle = '#431407';
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a heavy rubber training tire with perimeter tread blocks and inner rim.
 */
export function drawTire(ctx: CanvasRenderingContext2D, point: Point): void {
  ctx.save();
  ctx.translate(point.x, point.y);

  const outerR = 13.5;
  const innerR = 5.5;

  // Ice contact drop shadow
  ctx.fillStyle = 'rgba(0, 12, 24, 0.35)';
  ctx.beginPath();
  ctx.arc(2, 3, outerR + 1, 0, Math.PI * 2);
  ctx.fill();

  // Outer tire casing
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  if (ctx.createRadialGradient) {
    const tireGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, outerR);
    tireGrad.addColorStop(0, '#334155');
    tireGrad.addColorStop(0.5, '#1e293b');
    tireGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = tireGrad;
  } else {
    ctx.fillStyle = '#1e293b';
  }
  ctx.fill();

  // Outer rubber tread blocks (12 radial notches)
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const x1 = Math.cos(angle) * (outerR - 2.8);
    const y1 = Math.sin(angle) * (outerR - 2.8);
    const x2 = Math.cos(angle) * outerR;
    const y2 = Math.sin(angle) * outerR;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Sidewall groove ring
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, outerR - 3.5, 0, Math.PI * 2);
  ctx.stroke();

  // Inner tire bead rim
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, innerR + 1.2, 0, Math.PI * 2);
  ctx.stroke();

  // Inner hollow cavity
  ctx.fillStyle = '#050811';
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a mini target net with regulation tubular steel frame and realistic mesh netting.
 */
export function drawMiniNet(ctx: CanvasRenderingContext2D, point: Point, rotation = 0): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  if (rotation) ctx.rotate(rotation);

  const w = 32;
  const d = 19;
  const halfW = w / 2;

  // Ice shadow beneath net
  ctx.fillStyle = 'rgba(0, 15, 30, 0.28)';
  ctx.beginPath();
  ctx.moveTo(-halfW - 2, 2);
  ctx.lineTo(-halfW * 0.72 - 1, d + 3);
  ctx.lineTo(halfW * 0.72 + 3, d + 3);
  ctx.lineTo(halfW + 2, 2);
  ctx.closePath();
  ctx.fill();

  // Netting backdrop
  ctx.fillStyle = 'rgba(240, 248, 255, 0.52)';
  ctx.beginPath();
  ctx.moveTo(-halfW, 0);
  ctx.lineTo(-halfW * 0.72, d);
  ctx.lineTo(halfW * 0.72, d);
  ctx.lineTo(halfW, 0);
  ctx.closePath();
  ctx.fill();

  // Diamond nylon mesh lines
  ctx.strokeStyle = 'rgba(100, 125, 145, 0.5)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  // Diagonal lines left-to-right
  ctx.moveTo(-halfW * 0.7, 0);
  ctx.lineTo(halfW * 0.45, d);
  ctx.moveTo(-halfW * 0.2, 0);
  ctx.lineTo(halfW * 0.7, d * 0.7);
  ctx.moveTo(-halfW * 0.9, d * 0.35);
  ctx.lineTo(0, d);

  // Diagonal lines right-to-left
  ctx.moveTo(halfW * 0.7, 0);
  ctx.lineTo(-halfW * 0.45, d);
  ctx.moveTo(halfW * 0.2, 0);
  ctx.lineTo(-halfW * 0.7, d * 0.7);
  ctx.moveTo(halfW * 0.9, d * 0.35);
  ctx.lineTo(0, d);
  ctx.stroke();

  // Rear bottom skirt
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.72, d);
  ctx.lineTo(halfW * 0.72, d);
  ctx.stroke();

  // Red tubular steel frame (mouth, side posts, back curve)
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-halfW, d);
  ctx.lineTo(-halfW, 0);
  ctx.lineTo(halfW, 0);
  ctx.lineTo(halfW, d);
  ctx.stroke();

  // Gloss highlight on crossbar
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-halfW + 3, -0.6);
  ctx.lineTo(halfW - 3, -0.6);
  ctx.stroke();

  // Post caps
  ctx.fillStyle = '#b91c1c';
  for (const x of [-halfW, halfW]) {
    ctx.beginPath();
    ctx.arc(x, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a passing gate: two training cones with an elevated crossbar hurdle.
 */
export function drawPassingGate(
  ctx: CanvasRenderingContext2D,
  point: Point,
  size?: { width: number; height: number },
  rotation = 0
): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  if (rotation) ctx.rotate(rotation);

  const span = size?.width ?? 52;
  const halfSpan = span / 2;

  // Ice shadow beneath hurdle
  ctx.fillStyle = 'rgba(0, 15, 30, 0.25)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-halfSpan - 4, 3, span + 8, 5, 2.5);
  } else if (ctx.rect) {
    ctx.rect(-halfSpan - 4, 3, span + 8, 5);
  } else {
    ctx.arc(0, 5.5, halfSpan, 0, Math.PI * 2);
  }
  ctx.fill();

  // High-visibility PVC hurdle rail
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-halfSpan, -2.5, span, 5, 2.5);
  } else if (ctx.rect) {
    ctx.rect(-halfSpan, -2.5, span, 5);
  } else {
    ctx.arc(0, 0, halfSpan, 0, Math.PI * 2);
  }
  ctx.fill();

  // Caution diagonal stripes along the hurdle rail
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.2;
  for (let x = -halfSpan + 6; x < halfSpan - 6; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x - 2, -2);
    ctx.lineTo(x + 2, 2);
    ctx.stroke();
  }

  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Left and right support cones
  drawCone(ctx, { x: -halfSpan, y: 0 });
  drawCone(ctx, { x: halfSpan, y: 0 });

  ctx.restore();
}

/**
 * Draw a heavy vinyl foam divider pad / bumper barrier with edge piping and handles.
 */
export function drawBarrier(
  ctx: CanvasRenderingContext2D,
  point: Point,
  size?: { width: number; height: number },
  rotation = 0
): void {
  ctx.save();
  ctx.translate(point.x, point.y);
  if (rotation) ctx.rotate(rotation);

  const w = size?.width ?? 68;
  const h = size?.height ?? 17;
  const r = h / 2;

  // Deep ice shadow
  ctx.fillStyle = 'rgba(0, 15, 30, 0.32)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-w / 2 + 1.5, -h / 2 + 3.5, w, h, r);
  } else if (ctx.rect) {
    ctx.rect(-w / 2 + 1.5, -h / 2 + 3.5, w, h);
  } else {
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
  }
  ctx.fill();

  // High-density foam vinyl casing (deep royal blue)
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
  } else if (ctx.rect) {
    ctx.rect(-w / 2, -h / 2, w, h);
  } else {
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
  }
  if (ctx.createLinearGradient) {
    const padGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    padGrad.addColorStop(0, '#0284c7');
    padGrad.addColorStop(0.4, '#0369a1');
    padGrad.addColorStop(1, '#075985');
    ctx.fillStyle = padGrad;
  } else {
    ctx.fillStyle = '#0284c7';
  }
  ctx.fill();

  // Accent edge piping
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Vinyl seam line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, 0);
  ctx.lineTo(w / 2 - r, 0);
  ctx.stroke();

  // End-cap velcro link tabs
  ctx.fillStyle = '#0f172a';
  for (const x of [-w / 2 + 2, w / 2 - 5]) {
    ctx.beginPath();
    if (ctx.rect) {
      ctx.rect(x, -3, 3, 6);
    } else {
      ctx.moveTo(x, -3);
      ctx.lineTo(x + 3, -3);
      ctx.lineTo(x + 3, 3);
      ctx.lineTo(x, 3);
      ctx.closePath();
    }
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a cluster / pile of vulcanized rubber hockey pucks.
 */
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

  // Group shadow
  ctx.fillStyle = 'rgba(0, 15, 30, 0.26)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < n; i++) {
    const { x, y } = offsets[i];
    const puckR = 6;

    // Puck body
    ctx.beginPath();
    ctx.arc(x, y, puckR, 0, Math.PI * 2);
    if (ctx.createRadialGradient) {
      const pGrad = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.8, x, y, puckR);
      pGrad.addColorStop(0, '#262626');
      pGrad.addColorStop(0.7, '#171717');
      pGrad.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = pGrad;
    } else {
      ctx.fillStyle = '#171717';
    }
    ctx.fill();

    // Knurled perimeter rim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top surface inner bevel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, puckR - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Render any training equipment item according to its kind.
 */
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
    case 'gate':
      drawPassingGate(ctx, item.position, item.size, item.rotation);
      break;
    case 'barrier':
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

/**
 * Render a list of equipment items.
 */
export function drawEquipment(ctx: CanvasRenderingContext2D, items: EquipmentItem[]): void {
  for (const item of items) {
    drawEquipmentItem(ctx, item);
  }
}

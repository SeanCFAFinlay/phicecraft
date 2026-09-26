// ============================================================================
// EXPORT DRILL IMAGE
//
// High-resolution diagram export for coaches. Renders the drill diagram to a
// canvas at print/retina resolution, with optional title header and metadata,
// and downloads it as a PNG or JPEG.
// ============================================================================

import type { Drill, Point } from '@/core/types';
import { RINK, RINK_MARKS as M, COLORS } from '@/core/constants';
import { expandCurve } from '@/utils/curves';
import { downloadDataUrl } from './download';

export interface ExportImageOptions {
  /** Output format: 'png' or 'jpeg'. Defaults to 'png'. */
  format?: 'png' | 'jpeg';
  /** DPR / resolution multiplier. Defaults to 2.5 for crisp print and sharing. */
  scale?: number;
  /** Width in logical pixels. Defaults to 1200. */
  width?: number;
  /** Height in logical pixels. Defaults to 510 (NHL rink 200x85 aspect ~ 2.35:1). */
  height?: number;
  /** Whether to render title and metadata header banner. Defaults to true. */
  includeHeader?: boolean;
}

function drawLine(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  size: number
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - 0.42), to.y - size * Math.sin(angle - 0.42));
  ctx.lineTo(to.x - size * Math.cos(angle + 0.42), to.y - size * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a full high-resolution drill diagram to a canvas and returns a PNG DataURL.
 */
export function renderDrillDiagram(drill: Drill, options: ExportImageOptions = {}): string | null {
  if (typeof document === 'undefined') return null;

  const {
    format = 'png',
    scale = 2.5,
    width = 1200,
    height = 510,
    includeHeader = true,
  } = options;

  const headerHeight = includeHeader ? 54 : 0;
  const totalWidth = width;
  const totalHeight = height + headerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalWidth * scale);
  canvas.height = Math.round(totalHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // Background
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Header Banner
  if (includeHeader) {
    ctx.fillStyle = '#06101a';
    ctx.fillRect(0, 0, totalWidth, headerHeight);

    // Subtle bottom border
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(totalWidth, headerHeight);
    ctx.stroke();

    // Brand and Title
    ctx.fillStyle = '#22d3ee';
    ctx.font = '800 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PHICECRAFT · HOCKEY DRILL DESIGNER', 18, 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(drill.name || 'Untitled Drill', 18, 38);

    // Player and Event Count
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    const skaterCount = drill.players.length;
    const passCount = drill.events.filter(e => e.type === 'pass').length;
    const shotCount = drill.events.filter(e => e.type === 'shot').length;
    ctx.fillText(
      `${skaterCount} Players · ${passCount} Passes · ${shotCount} Shots`,
      totalWidth - 18,
      28
    );
  }

  // Draw Rink Surface
  ctx.save();
  ctx.translate(0, headerHeight);

  const rinkAspect = RINK.width / RINK.height;
  const canvasRinkAspect = width / height;
  let zoom: number;
  let offsetX = 0;
  let offsetY = 0;

  if (canvasRinkAspect > rinkAspect) {
    zoom = height / RINK.height;
    offsetX = (width - RINK.width * zoom) / 2;
  } else {
    zoom = width / RINK.width;
    offsetY = (height - RINK.height * zoom) / 2;
  }

  ctx.translate(offsetX, offsetY);
  ctx.scale(zoom, zoom);

  // Rink Ice Background
  ctx.fillStyle = '#f4f8fb';
  ctx.beginPath();
  const rx = RINK.x, ry = RINK.y, rw = RINK.width, rh = RINK.height, cr = RINK.cornerRadius;
  ctx.moveTo(rx + cr, ry);
  ctx.lineTo(rx + rw - cr, ry);
  ctx.arcTo(rx + rw, ry, rx + rw, ry + cr, cr);
  ctx.lineTo(rx + rw, ry + rh - cr);
  ctx.arcTo(rx + rw, ry + rh, rx + rw - cr, ry + rh, cr);
  ctx.lineTo(rx + cr, ry + rh);
  ctx.arcTo(rx, ry + rh, rx, ry + rh - cr, cr);
  ctx.lineTo(rx, ry + cr);
  ctx.arcTo(rx, ry, rx + cr, ry, cr);
  ctx.closePath();
  ctx.fill();

  // Ice sheen
  const iceGrad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
  iceGrad.addColorStop(0, 'rgba(235, 246, 252, 0.9)');
  iceGrad.addColorStop(0.5, 'rgba(248, 252, 255, 0.95)');
  iceGrad.addColorStop(1, 'rgba(230, 243, 250, 0.9)');
  ctx.fillStyle = iceGrad;
  ctx.fill();

  // Boards
  ctx.strokeStyle = '#182838';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.strokeStyle = '#f2c94c';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Goal Lines (red)
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor;
  for (const gx of [RINK.goalLineLeftX, RINK.goalLineRightX]) {
    drawLine(ctx, [{ x: gx, y: ry }, { x: gx, y: ry + rh }]);
  }

  // Blue Lines
  ctx.strokeStyle = COLORS.blueLine;
  ctx.lineWidth = M.lineWidthMajor;
  for (const bx of [RINK.blueLineLeftX, RINK.blueLineRightX]) {
    drawLine(ctx, [{ x: bx, y: ry }, { x: bx, y: ry + rh }]);
  }

  // Centre Red Line
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMajor;
  ctx.setLineDash([12, 8]);
  drawLine(ctx, [{ x: RINK.centerX, y: ry }, { x: RINK.centerX, y: ry + rh }]);
  ctx.setLineDash([]);

  // Faceoff Circles and Spots
  ctx.lineWidth = 2.2;
  for (const [cx, cy] of [
    [155, 102.5],
    [155, 322.5],
    [845, 102.5],
    [845, 322.5],
  ] as const) {
    ctx.strokeStyle = COLORS.redLine;
    ctx.beginPath();
    ctx.arc(cx, cy, M.faceoffCircleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = COLORS.redLine;
    ctx.beginPath();
    ctx.arc(cx, cy, M.faceoffSpotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center Circle
  ctx.strokeStyle = COLORS.blueLine;
  ctx.beginPath();
  ctx.arc(RINK.centerX, RINK.centerY, M.faceoffCircleRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLORS.blueLine;
  ctx.beginPath();
  ctx.arc(RINK.centerX, RINK.centerY, M.centerSpotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Goal Creases
  const hw = M.creaseHalfWidth;
  const crRadius = M.creaseRadius;
  const a = Math.asin(hw / crRadius);

  // Left crease
  ctx.fillStyle = COLORS.crease.fill;
  ctx.strokeStyle = COLORS.crease.stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(RINK.goalLineLeftX, RINK.centerY - hw);
  ctx.lineTo(RINK.goalLineLeftX + Math.cos(a) * crRadius, RINK.centerY - hw);
  ctx.arc(RINK.goalLineLeftX, RINK.centerY, crRadius, -a, a);
  ctx.lineTo(RINK.goalLineLeftX, RINK.centerY + hw);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right crease
  ctx.beginPath();
  ctx.moveTo(RINK.goalLineRightX, RINK.centerY - hw);
  ctx.lineTo(RINK.goalLineRightX - Math.cos(a) * crRadius, RINK.centerY - hw);
  ctx.arc(RINK.goalLineRightX, RINK.centerY, crRadius, Math.PI + a, Math.PI - a, true);
  ctx.lineTo(RINK.goalLineRightX, RINK.centerY + hw);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw Goals
  const goalDepth = M.goalDepth;
  for (const [glX, dir] of [[RINK.goalLineLeftX, 1], [RINK.goalLineRightX, -1]] as const) {
    ctx.fillStyle = 'rgba(230, 240, 245, 0.7)';
    ctx.strokeStyle = COLORS.goalPost;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(glX, RINK.centerY - hw);
    ctx.lineTo(glX - dir * goalDepth, RINK.centerY - hw * 0.72);
    ctx.quadraticCurveTo(glX - dir * (goalDepth + 2), RINK.centerY, glX - dir * goalDepth, RINK.centerY + hw * 0.72);
    ctx.lineTo(glX, RINK.centerY + hw);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw Skate Paths (Solid line with arrowheads per coaching convention)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of drill.skatePaths) {
    if (!path.points || path.points.length < 2) continue;
    const color = path.team === 'home' ? '#dc2626' : '#2563eb';
    const points = expandCurve(path.points, path.shape ?? 'spline');
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.6;
    ctx.setLineDash(path.mode === 'backward' ? [8, 6] : []);
    drawLine(ctx, points);
    ctx.setLineDash([]);

    if (points.length >= 2) {
      drawArrowHead(ctx, points[points.length - 2], points[points.length - 1], color, 14);
    }
  }

  // Draw Puck Events (Passes dashed in gold, shots solid in orange)
  for (let i = 0; i < drill.events.length; i++) {
    const event = drill.events[i];
    const isShot = event.type === 'shot' || event.type === 'dump';
    const color = isShot ? '#f97316' : '#eab308';
    const points = expandCurve([event.fromPoint, ...(event.waypoints ?? []), event.toPoint], event.shape ?? 'spline');

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.setLineDash(isShot ? [] : [10, 7]);
    drawLine(ctx, points);
    ctx.setLineDash([]);

    if (points.length >= 2) {
      drawArrowHead(ctx, points[points.length - 2], points[points.length - 1], color, 14);
    }

    // Number Badge at midpoint
    const midIdx = Math.floor(points.length / 2);
    const midPt = points[midIdx];
    ctx.fillStyle = '#06101a';
    ctx.beginPath();
    ctx.arc(midPt.x, midPt.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), midPt.x, midPt.y + 0.5);
  }

  // Draw Initial / Loose Puck
  if (drill.initialPuck) {
    ctx.fillStyle = '#111820';
    ctx.beginPath();
    ctx.arc(drill.initialPuck.x, drill.initialPuck.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw Players (Numbered tokens with bold high-contrast jersey colors)
  const tokenRadius = 18;
  for (const player of drill.players) {
    const isHome = player.team === 'home';
    const fillColor = isHome ? (drill.settings?.jerseys?.home ?? '#e63946') : (drill.settings?.jerseys?.away ?? '#2f80ed');

    // Carrier gold glow
    if (player.hasPuck) {
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, tokenRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(player.x, player.y, tokenRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = player.role === 'G' ? '#f59e0b' : '#ffffff';
    ctx.lineWidth = player.role === 'G' ? 3.5 : 2.5;
    ctx.stroke();

    // Player Number
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.number || 'P', player.x, player.y + 0.5);

    // Role sub-badge
    if (player.role === 'G') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(player.x + 12, player.y - 12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = '900 8px sans-serif';
      ctx.fillText('G', player.x + 12, player.y - 11.5);
    }
  }

  // Draw Coaches
  for (const coach of drill.coaches ?? []) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(coach.x, coach.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', coach.x, coach.y + 0.5);
  }

  ctx.restore();

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return canvas.toDataURL(mimeType, 0.95);
}

/**
 * Exports the drill diagram directly to the user's downloads folder.
 */
export function exportDrillImageFile(drill: Drill, options: ExportImageOptions = {}): boolean {
  const dataUrl = renderDrillDiagram(drill, options);
  if (!dataUrl) return false;

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = (drill.name || 'drill')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');
  const ext = options.format === 'jpeg' ? 'jpg' : 'png';
  const filename = `${safeName}-${stamp}.${ext}`;

  return downloadDataUrl(filename, dataUrl);
}

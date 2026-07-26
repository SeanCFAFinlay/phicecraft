// ============================================================================
// A PICTURE OF THE DRILL
//
// Library cards described drills in words. A coach scanning twenty-four of
// them decides from the shape of the thing far faster than from a sentence, so
// each card gets a small rink diagram drawn from the drill itself.
//
// Two parts, deliberately separated:
//
//   `drillBounds`     WHICH patch of ice to draw. Pure geometry, so the
//                     framing is testable without a canvas.
//   `renderThumbnail` the drawing. Needs a real 2D context and returns null
//                     without one, so a headless test environment gets no
//                     image rather than an exception.
//
// Framing matters more than it sounds. A quarter-ice battle drawn on a full
// sheet is four specks in a white rectangle - every card would look the same.
// The view is the drill's own bounding box, padded, then widened to the card
// shape and clamped back inside the boards.
// ============================================================================

import type { Drill, Point } from '@/core/types';
import { RINK } from '@/core/constants';
import { expandCurve } from '@/utils/curves';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Breathing room around the action, in world units. */
const PADDING = 45;
/** Never zoom in past this, or two players fill the whole card. */
const MIN_EXTENT = 320;

function allPoints(drill: Drill): Point[] {
  const points: Point[] = drill.players.map(player => ({ x: player.x, y: player.y }));

  for (const path of drill.skatePaths) {
    for (const point of path.points ?? []) points.push(point);
  }
  for (const event of drill.events) {
    points.push(event.fromPoint, event.toPoint);
    for (const point of event.waypoints ?? []) points.push(point);
  }
  for (const coach of drill.coaches ?? []) points.push({ x: coach.x, y: coach.y });

  return points;
}

/**
 * The patch of ice worth drawing, shaped to `aspect` (width / height).
 */
export function drillBounds(drill: Drill, aspect: number): WorldRect {
  const points = allPoints(drill);
  const full: WorldRect = { x: RINK.x, y: RINK.y, width: RINK.width, height: RINK.height };
  if (points.length === 0) return full;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return full;

  minX -= PADDING;
  maxX += PADDING;
  minY -= PADDING;
  maxY += PADDING;

  // Grow to the minimum extent about the centre, so a two-player battle does
  // not become a close-up of two dots.
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  let width = Math.max(maxX - minX, MIN_EXTENT);
  let height = Math.max(maxY - minY, MIN_EXTENT / aspect);

  // Match the card's shape, growing the short side rather than cropping.
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  // Never draw beyond the boards; if the drill needs more than the rink has,
  // fall back to the whole sheet.
  if (width > RINK.width || height > RINK.height) {
    const fullAspect = RINK.width / RINK.height;
    return fullAspect > aspect
      ? { x: RINK.x, y: RINK.centerY - RINK.width / aspect / 2, width: RINK.width, height: RINK.width / aspect }
      : { x: RINK.centerX - (RINK.height * aspect) / 2, y: RINK.y, width: RINK.height * aspect, height: RINK.height };
  }

  const x = Math.min(Math.max(centreX - width / 2, RINK.x), RINK.x + RINK.width - width);
  const y = Math.min(Math.max(centreY - height / 2, RINK.y), RINK.y + RINK.height - height);
  return { x, y, width, height };
}

// ----------------------------------------------------------------------------
// Drawing
// ----------------------------------------------------------------------------

const ROUTE_COLOR = 'rgba(34, 211, 238, 0.95)';
const PASS_COLOR = 'rgba(255, 214, 10, 0.95)';
const SHOT_COLOR = 'rgba(255, 107, 15, 0.95)';
const HOME_COLOR = '#e63946';
const AWAY_COLOR = '#2f80ed';

function line(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.stroke();
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  /** Device pixel ratio, capped by the caller. */
  scale?: number;
}

/**
 * Draw the drill and return a PNG data URL, or null when there is no canvas.
 */
export function renderThumbnail(drill: Drill, options: ThumbnailOptions): string | null {
  const { width, height, scale = 2 } = options;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  // jsdom returns null here, and a library card without a picture is a great
  // deal better than a test suite that throws.
  if (!ctx) return null;

  const view = drillBounds(drill, width / height);
  const zoom = Math.min(width / view.width, height / view.height);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#f6fafd';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(-view.x * zoom, -view.y * zoom);
  ctx.scale(zoom, zoom);

  // Rink markings, simplified: at card size the full renderer's hash marks and
  // faceoff detail turn into noise.
  ctx.lineWidth = 2 / zoom;
  ctx.strokeStyle = 'rgba(214, 40, 57, 0.55)';
  for (const x of [RINK.goalLineLeftX, RINK.goalLineRightX]) {
    line(ctx, [
      { x, y: RINK.y },
      { x, y: RINK.y + RINK.height },
    ]);
  }
  ctx.strokeStyle = 'rgba(214, 40, 57, 0.75)';
  ctx.setLineDash([10 / zoom, 8 / zoom]);
  line(ctx, [
    { x: RINK.centerX, y: RINK.y },
    { x: RINK.centerX, y: RINK.y + RINK.height },
  ]);
  ctx.setLineDash([]);

  ctx.lineWidth = 5 / zoom;
  ctx.strokeStyle = 'rgba(0, 51, 160, 0.65)';
  for (const x of [RINK.blueLineLeftX, RINK.blueLineRightX]) {
    line(ctx, [
      { x, y: RINK.y },
      { x, y: RINK.y + RINK.height },
    ]);
  }

  ctx.lineWidth = 2.5 / zoom;
  ctx.strokeStyle = 'rgba(214, 40, 57, 0.5)';
  for (const [cx, cy] of [
    [155, 102.5],
    [155, 322.5],
    [845, 102.5],
    [845, 322.5],
    [RINK.centerX, RINK.centerY],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 75, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Equipment is not in the v2 projection, so nothing to draw here yet.

  // Routes.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6 / zoom;
  ctx.strokeStyle = ROUTE_COLOR;
  for (const path of drill.skatePaths) {
    if ((path.points?.length ?? 0) < 2) continue;
    line(ctx, expandCurve(path.points, path.shape ?? 'spline'));
  }

  // Puck actions.
  for (const event of drill.events) {
    ctx.strokeStyle = event.type === 'shot' ? SHOT_COLOR : PASS_COLOR;
    ctx.lineWidth = 5 / zoom;
    ctx.setLineDash(event.type === 'shot' ? [] : [14 / zoom, 9 / zoom]);
    line(ctx, [event.fromPoint, ...(event.waypoints ?? []), event.toPoint]);
  }
  ctx.setLineDash([]);

  // Players, as tokens rather than sprites: at this size a photographic crop
  // is a smudge, and a numbered dot is legible.
  const radius = 20;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const player of drill.players) {
    ctx.fillStyle = player.team === 'home' ? HOME_COLOR : AWAY_COLOR;
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${radius * 1.1}px system-ui, sans-serif`;
    ctx.fillText(player.number.slice(0, 2), player.x, player.y + 1);
  }

  for (const coach of drill.coaches ?? []) {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.beginPath();
    ctx.arc(coach.x, coach.y, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${radius * 0.95}px system-ui, sans-serif`;
    ctx.fillText('C', coach.x, coach.y + 1);
  }

  ctx.restore();
  return canvas.toDataURL('image/png');
}

// ----------------------------------------------------------------------------
// Caching
//
// A thumbnail is deterministic for a given drill and size, and drawing
// twenty-four of them on every filter change would be wasted work.
// ----------------------------------------------------------------------------

const cache = new Map<string, string | null>();

export function cachedThumbnail(
  key: string,
  drill: Drill,
  options: ThumbnailOptions
): string | null {
  const cacheKey = `${key}@${options.width}x${options.height}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const image = renderThumbnail(drill, options);
  cache.set(cacheKey, image);
  return image;
}

/** Test seam. */
export function __clearThumbnailCache(): void {
  cache.clear();
}

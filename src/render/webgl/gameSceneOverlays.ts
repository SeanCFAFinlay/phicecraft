// ============================================================================
// GAME SCENE — overlay groups
//
// One `update*` function per port-order group (ghost trails, skate paths +
// transient route, events + flight lines, drag preview, pass-from highlight,
// dimmed players + pass candidates, edit handles, animated puck, diagnostics,
// glow), split out of `gameScene.ts` to keep that file a thin orchestrator
// (assembly + per-frame call order) rather than a ~700-line monolith.
//
// Every function here is drawn from the SAME `DynamicLayerInput` fields the
// Canvas2D path reads, reusing its pure geometry functions (`expandCurve`,
// `eventFlightLine`, `CONTROL_HANDLE_RADIUS`/`ADD_HANDLE_RADIUS`) rather than
// re-deriving them - see gameScene.ts's file header for the fuller rationale.
// ============================================================================

import { Container, FillGradient, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import type { AnimatedPuck, CoachMarker, DrillEvent, EquipmentItem, ID, Player, PlaybackPlayerFrame, Point, SkatePath } from '@/core/types';
import type { DragPreview, DynamicLayerInput } from '@/components/canvas/renderDynamic';
import type { PassCandidateView } from '@/canvas/PassOverlay';
import type { CatchQuality } from '@/editor/passing/passTargetService';
import { PLAYER_RADIUS, RINK, SIMULATION } from '@/core/constants';
import { expandCurve, controlMidpoints } from '@/utils/curves';
import { pointAtParameter } from '@/utils/geometry';
import { flightControls } from '@/sim/flightPath';
import { getCurrentPuckHolder } from '@/engine/puck';
import { CONTROL_HANDLE_RADIUS, eventFlightLine } from '@/canvas/PathRenderer';
import type { RenderQuality } from '@/render/quality';
import { polylineOf, type DashPattern } from './dashedLine';
import type { GraphicsKeyedPool, TokenPool } from './gameScenePool';

// ----------------------------------------------------------------------------
// Small drawing helpers shared across groups
// ----------------------------------------------------------------------------

function rgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function strokeSolidLine(g: Graphics, points: Point[], color: number, alpha: number, width: number): void {
  if (points.length < 2) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.stroke({ color, alpha, width, cap: 'round', join: 'round' });
}

function strokeDashedLine(g: Graphics, points: Point[], pattern: DashPattern, color: number, alpha: number, width: number): void {
  for (const segment of polylineOf(points, pattern)) {
    strokeSolidLine(g, segment, color, alpha, width);
  }
}

function drawArrowHead(g: Graphics, from: Point, to: Point, color: number, alpha: number, size = 11): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const p1 = { x: to.x - size * Math.cos(angle - 0.38), y: to.y - size * Math.sin(angle - 0.38) };
  const p2 = { x: to.x - size * Math.cos(angle + 0.38), y: to.y - size * Math.sin(angle + 0.38) };
  g.moveTo(to.x, to.y).lineTo(p1.x, p1.y).lineTo(p2.x, p2.y).closePath().fill({ color, alpha });
}

const BADGE_STYLE: TextStyleOptions = {
  fontSize: 10,
  fontWeight: '700',
  fontFamily: 'Arial, sans-serif',
  fill: '#ffffff',
};

function drawBadge(g: Graphics, label: Text, x: number, y: number, text: string, color: number): void {
  g.circle(x, y, 10).fill({ color: 0x040a12, alpha: 0.92 }).stroke({ color, width: 1.5 });
  label.text = text;
  label.position.set(x, y + 0.5);
  label.style.fill = color;
}

/** `'low'` sheds glow/shadow effects entirely (the audit's effect-shedding tier). */
function effectsEnabled(quality: RenderQuality): boolean {
  return quality !== 'low';
}

// ----------------------------------------------------------------------------
// Coaches — the FIRST flat-board group, matching Canvas's paint position
// (renderDynamic.ts draws `drawCoachTopDown` before ghost trails/skate
// paths/everything else, so the play always draws over a coach marker, not
// under it). Only the pure `PLAYER_RADIUS` constant `CoachRenderer.ts` itself
// builds on is reused - `drawCoachTopDown` has no other pure helper to share
// (it is a self-contained Canvas 2D painter, same as `drawArenaCoaches`'s
// tabletop counterpart, which stays covered by the Canvas2D pass-through).
//
// SIMPLIFICATION (documented, same spirit as the player vector fallback):
// a jacket disc, a toque band, a face, a beard blob and a clipboard tab -
// not a hand-port of `CoachRenderer.ts`'s exact bezier beard/moustache/eye
// shapes or its drop-shadow (no BlurFilter outside the dedicated glow
// container, per the brief's rule). The flat view never marks a coach
// selected (`renderDynamic.ts` always passes `isSelected: false`), so no
// selection ring is ported either - there is nothing to port, not a gap.
// ----------------------------------------------------------------------------

const COACH_RADIUS = PLAYER_RADIUS * 1.28;

export interface CoachToken {
  container: Container;
  body: Graphics;
  selectionRing: Graphics;
  label: Text;
}

const COACH_LABEL_STYLE: TextStyleOptions = {
  fontSize: Math.max(6, COACH_RADIUS * 0.42),
  fontWeight: '700',
  fontFamily: 'Arial, sans-serif',
  fill: 'rgba(230, 240, 248, 0.9)',
};

export function createCoachToken(): CoachToken {
  const container = new Container({ label: 'coach' });
  const selectionRing = new Graphics();
  const body = new Graphics();
  const label = new Text({ text: 'COACH', resolution: 2, style: COACH_LABEL_STYLE });
  label.anchor.set(0.5, 0);
  label.position.set(0, COACH_RADIUS + 2);
  container.addChild(selectionRing, body, label);
  return { container, body, selectionRing, label };
}

function drawCoachBody(g: Graphics): void {
  const r = COACH_RADIUS;
  g.clear();

  const jacket = new FillGradient({
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#33475f' },
      { offset: 1, color: '#141d28' },
    ],
  });
  g.circle(0, 0, r).fill(jacket);

  // Toque band across the top of the head.
  g.roundRect(-r * 0.62, -r * 0.62, r * 1.24, r * 0.5, r * 0.22).fill('#b5313b');
  // Face.
  g.ellipse(0, r * 0.06, r * 0.52, r * 0.5).fill('#e7b48c');
  // Beard covering the lower face.
  g.ellipse(0, r * 0.28, r * 0.5, r * 0.32).fill('#6f4a2c');
  // Clipboard tucked to the side.
  g.roundRect(r * 0.5, -r * 0.2, r * 0.5, r * 0.66, 2).fill('#d9c38a').stroke({ color: '#141d28', width: 1 });
}

export function updateCoaches(
  pool: TokenPool<CoachToken>,
  coaches: CoachMarker[],
  selectedCoachId?: ID | null
): void {
  pool.begin();
  for (const coach of coaches) {
    const token = pool.get(coach.id);
    token.container.position.set(coach.x, coach.y);
    drawCoachBody(token.body);
    token.selectionRing.clear();
    if (coach.id === selectedCoachId) {
      token.selectionRing
        .circle(0, 0, COACH_RADIUS + 4)
        .stroke({ color: 0x38bdf8, alpha: 0.9, width: 2.2 });
    }
  }
  pool.end();
}

// ----------------------------------------------------------------------------
// Training Equipment (cones, tires, mini-nets, barriers, gates, puck piles)
// ----------------------------------------------------------------------------

export interface EquipmentToken {
  container: Container;
  body: Graphics;
  selectionRing: Graphics;
}

export function createEquipmentToken(): EquipmentToken {
  const container = new Container({ label: 'equipment' });
  const selectionRing = new Graphics();
  const body = new Graphics();
  container.addChild(selectionRing, body);
  return { container, body, selectionRing };
}

function drawConeGraphic(g: Graphics): void {
  // Shadow
  g.ellipse(1.5, 3.5, 12, 7.5).fill({ color: 0x000f1e, alpha: 0.28 });
  // Base
  g.roundRect(-9, -9, 18, 18, 3.5).fill(0x9a3412).stroke({ color: 0x7c2d12, width: 1.2 });
  // Conical body
  g.circle(0, 0, 7.8).fill(0xea580c);
  // Reflective collar
  g.circle(0, 0, 4.8).fill(0xffffff).stroke({ color: 0xc2410c, alpha: 0.55, width: 0.8 });
  // Tip
  g.circle(0, 0, 1.8).fill(0x431407);
}

function drawTireGraphic(g: Graphics): void {
  const outerR = 13.5;
  const innerR = 5.5;
  g.circle(2, 3, outerR + 1).fill({ color: 0x000c18, alpha: 0.35 });
  g.circle(0, 0, outerR).fill(0x1e293b);
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const x1 = Math.cos(angle) * (outerR - 2.8);
    const y1 = Math.sin(angle) * (outerR - 2.8);
    const x2 = Math.cos(angle) * outerR;
    const y2 = Math.sin(angle) * outerR;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x090d16, width: 1.6 });
  }
  g.circle(0, 0, outerR - 3.5).stroke({ color: 0x475569, width: 1.4 });
  g.circle(0, 0, innerR + 1.2).stroke({ color: 0x64748b, width: 1.2 });
  g.circle(0, 0, innerR).fill(0x050811);
}

function drawMiniNetGraphic(g: Graphics): void {
  const halfW = 16;
  const d = 19;
  g.poly([-halfW - 2, 2, -halfW * 0.72 - 1, d + 3, halfW * 0.72 + 3, d + 3, halfW + 2, 2]).fill({ color: 0x000f1e, alpha: 0.28 });
  g.poly([-halfW, 0, -halfW * 0.72, d, halfW * 0.72, d, halfW, 0]).fill({ color: 0xf0f8ff, alpha: 0.52 });
  g.moveTo(-halfW * 0.7, 0).lineTo(halfW * 0.45, d);
  g.moveTo(-halfW * 0.2, 0).lineTo(halfW * 0.7, d * 0.7);
  g.moveTo(-halfW * 0.9, d * 0.35).lineTo(0, d);
  g.moveTo(halfW * 0.7, 0).lineTo(-halfW * 0.45, d);
  g.moveTo(halfW * 0.2, 0).lineTo(-halfW * 0.7, d * 0.7);
  g.moveTo(halfW * 0.9, d * 0.35).lineTo(0, d);
  g.stroke({ color: 0x647d91, alpha: 0.5, width: 0.85 });
  g.moveTo(-halfW * 0.72, d).lineTo(halfW * 0.72, d).stroke({ color: 0xffffff, alpha: 0.85, width: 2.2 });
  g.moveTo(-halfW, d).lineTo(-halfW, 0).lineTo(halfW, 0).lineTo(halfW, d).stroke({ color: 0xdc2626, width: 3, cap: 'round', join: 'round' });
  g.moveTo(-halfW + 3, -0.6).lineTo(halfW - 3, -0.6).stroke({ color: 0xffffff, alpha: 0.65, width: 1 });
  g.circle(-halfW, 0, 2.5).fill(0xb91c1c);
  g.circle(halfW, 0, 2.5).fill(0xb91c1c);
}

function drawBarrierGraphic(g: Graphics, size?: { width: number; height: number }): void {
  const w = size?.width ?? 68;
  const h = size?.height ?? 17;
  const r = h / 2;
  g.roundRect(-w / 2 + 1.5, -h / 2 + 3.5, w, h, r).fill({ color: 0x000f1e, alpha: 0.32 });
  g.roundRect(-w / 2, -h / 2, w, h, r).fill(0x0284c7);
  g.roundRect(-w / 2, -h / 2, w, h, r).stroke({ color: 0x38bdf8, width: 1.8 });
  g.moveTo(-w / 2 + r, 0).lineTo(w / 2 - r, 0).stroke({ color: 0xffffff, alpha: 0.45, width: 1 });
  g.rect(-w / 2 + 2, -3, 3, 6).fill(0x0f172a);
  g.rect(w / 2 - 5, -3, 3, 6).fill(0x0f172a);
}

function drawGateGraphic(g: Graphics, size?: { width: number; height: number }): void {
  const span = size?.width ?? 52;
  const halfSpan = span / 2;
  g.roundRect(-halfSpan - 4, 3, span + 8, 5, 2.5).fill({ color: 0x000f1e, alpha: 0.25 });
  g.roundRect(-halfSpan, -2.5, span, 5, 2.5).fill(0xf8fafc).stroke({ color: 0x0284c7, width: 1.2 });
  for (let x = -halfSpan + 6; x < halfSpan - 6; x += 10) {
    g.moveTo(x - 2, -2).lineTo(x + 2, 2).stroke({ color: 0xe11d48, width: 2.2 });
  }
  g.circle(-halfSpan, 0, 5).fill(0xea580c).stroke({ color: 0x7c2d12, width: 1 });
  g.circle(halfSpan, 0, 5).fill(0xea580c).stroke({ color: 0x7c2d12, width: 1 });
}

function drawPuckPileGraphic(g: Graphics, count = 5): void {
  const offsets = [
    { x: -5, y: -3 },
    { x: 4, y: -4 },
    { x: -3, y: 4 },
    { x: 5, y: 3 },
    { x: 0, y: 0 },
  ];
  const n = Math.min(count, offsets.length);
  g.ellipse(1, 2, 14, 10).fill({ color: 0x000f1e, alpha: 0.26 });
  for (let i = 0; i < n; i++) {
    const { x, y } = offsets[i];
    g.circle(x, y, 6).fill(0x171717).stroke({ color: 0xffffff, alpha: 0.35, width: 1 });
  }
}

function drawEquipmentBody(g: Graphics, item: EquipmentItem): void {
  g.clear();
  switch (item.kind) {
    case 'cone':
      drawConeGraphic(g);
      break;
    case 'tire':
      drawTireGraphic(g);
      break;
    case 'mini-net':
      drawMiniNetGraphic(g);
      break;
    case 'barrier':
      drawBarrierGraphic(g, item.size);
      break;
    case 'gate':
      drawGateGraphic(g, item.size);
      break;
    case 'puck-pile':
      drawPuckPileGraphic(g, item.count ?? 5);
      break;
    default:
      drawConeGraphic(g);
      break;
  }
}

function updateEquipmentSelectionRing(g: Graphics, item: EquipmentItem, isSelected: boolean): void {
  g.clear();
  if (!isSelected) return;
  const radius = item.kind === 'barrier' ? 24 : item.kind === 'mini-net' ? 22 : 18;
  g.circle(0, 0, radius).stroke({ color: 0x38bdf8, alpha: 0.9, width: 2.2 });
}

export function updateEquipment(
  pool: TokenPool<EquipmentToken>,
  equipment: EquipmentItem[],
  selectedEquipmentId?: ID | null
): void {
  pool.begin();
  for (const item of equipment) {
    const token = pool.get(item.id);
    token.container.position.set(item.position.x, item.position.y);
    token.container.rotation = item.rotation ?? 0;
    drawEquipmentBody(token.body, item);
    updateEquipmentSelectionRing(token.selectionRing, item, item.id === selectedEquipmentId);
  }
  pool.end();
}

// ----------------------------------------------------------------------------
// Ghost trails — one polyline per player, no per-segment allocation.
// ----------------------------------------------------------------------------

export function updateGhostTrails(pool: GraphicsKeyedPool, input: DynamicLayerInput, players: Player[]): void {
  pool.begin();
  if (input.isPlaying) {
    input.ghostTrails.forEach((playerId, points) => {
      if (points.length < 2) return;
      const g = pool.get(String(playerId));
      const player = players.find(p => p.id === playerId);
      const color = player ? (player.team === 'home' ? rgb(220, 57, 70) : rgb(58, 134, 255)) : rgb(180, 180, 180);
      for (let i = 1; i < points.length; i++) {
        const alpha = (i / points.length) * 0.26;
        const width = Math.max(1, (i / points.length) * 5);
        g.moveTo(points[i - 1].x, points[i - 1].y).lineTo(points[i].x, points[i].y).stroke({ color, alpha, width, cap: 'round' });
      }
    });
  }
  pool.end();
}

// ----------------------------------------------------------------------------
// Skate paths + transient route — dashed, reusing `expandCurve`.
// ----------------------------------------------------------------------------

const SKATE_DASH: DashPattern = { dash: 9, gap: 6 };

function drawSkateLine(g: Graphics, line: Point[], color: number, quality: RenderQuality): void {
  if (line.length < 2) return;
  if (effectsEnabled(quality)) {
    strokeSolidLine(g, line, color, 0.07, 13);
  }
  strokeDashedLine(g, line, SKATE_DASH, color, 0.82, 2.6);
  drawArrowHead(g, line[line.length - 2], line[line.length - 1], color, 0.82, 12);
  for (const t of [0.25, 0.5, 0.75]) {
    const pt = pointAtParameter(line, t);
    const r = 4;
    g.moveTo(pt.x, pt.y - r)
      .lineTo(pt.x + r, pt.y)
      .lineTo(pt.x, pt.y + r)
      .lineTo(pt.x - r, pt.y)
      .closePath()
      .fill({ color, alpha: 0.42 });
  }
}

/**
 * What `updateSkatePaths` last drew a path's Graphics FROM. A route's
 * `points` array is a plain reference in this app's immutable-update
 * architecture (same assumption `gameScene.ts`'s own `compiledFor` cache and
 * `renderDynamic.ts`'s `compiledFor` already make): it only changes identity
 * when an author edits that specific route, never on an unrelated re-render
 * (camera pan, playback tick, dragging a different player, ...). Comparing
 * by reference - not deep-equality - is what makes this cache nearly free to
 * check.
 */
interface SkatePathCacheEntry {
  points: SkatePath['points'];
  shape: SkatePath['shape'];
  quality: RenderQuality;
  color: number;
}

/**
 * Per-scene state for `updateSkatePaths`'s dirty-check (see below) - owned
 * by `gameScene.ts`, opaque to it. One `createSkatePathCache()` per
 * `GameScene` instance; sharing one across scenes (e.g. a module-level map)
 * would leak stale cache hits between them (concretely: between tests, or a
 * disposed-and-rebuilt renderer).
 */
export interface SkatePathCache {
  readonly entries: Map<string, SkatePathCacheEntry>;
}

export function createSkatePathCache(): SkatePathCache {
  return { entries: new Map() };
}

/**
 * Skate paths only change on an author edit, yet this used to fully
 * re-tessellate (`expandCurve` -> dash tessellation -> ~200 fresh Point
 * allocations -> a full Graphics clear+redraw) on EVERY frame this group
 * runs, including every playback tick and every camera pan where the path
 * itself never changed. The cache below makes an unchanged path's cost a
 * single Map lookup plus a `pool.touch()` (mark-visible only, no redraw) -
 * see the perf note on `dashedLine.ts`'s tessellation for why this group was
 * worth the dedicated cache rather than a cheaper micro-optimization.
 */
export function updateSkatePaths(
  pool: GraphicsKeyedPool,
  cache: SkatePathCache,
  paths: SkatePath[],
  quality: RenderQuality
): void {
  pool.begin();
  const present = new Set<string>();

  for (const path of paths) {
    present.add(path.id);
    const color = path.team === 'home' ? rgb(215, 48, 58) : rgb(48, 128, 255);
    const shape = path.shape ?? 'spline';
    const cached = cache.entries.get(path.id);
    const unchanged =
      !!cached &&
      cached.points === path.points &&
      cached.shape === shape &&
      cached.quality === quality &&
      cached.color === color;

    if (unchanged && pool.touch(path.id)) continue;

    const g = pool.get(path.id);
    drawSkateLine(g, expandCurve(path.points, shape), color, quality);
    cache.entries.set(path.id, { points: path.points, shape, quality, color });
  }

  // Drop cache entries for paths no longer authored, so a deleted route's
  // entry cannot linger indefinitely (ids are never reused, but an
  // unbounded map over a very long session is still worth avoiding).
  for (const key of cache.entries.keys()) {
    if (!present.has(key)) cache.entries.delete(key);
  }

  pool.end();
}

export function updateTransientRoute(g: Graphics, route: { ownerId: ID; points: Point[] } | null, players: Player[]): void {
  g.clear();
  if (!route || route.points.length < 2) return;
  const owner = players.find(p => p.id === route.ownerId);
  const color = (owner?.team ?? 'home') === 'home' ? rgb(215, 48, 58) : rgb(48, 128, 255);
  strokeDashedLine(g, route.points, SKATE_DASH, color, 0.28, 2);
  drawArrowHead(g, route.points[route.points.length - 2], route.points[route.points.length - 1], color, 0.28, 12);
}

// ----------------------------------------------------------------------------
// Events + flight lines
// ----------------------------------------------------------------------------

export interface EventToken {
  container: Container;
  line: Graphics;
  badge: Text;
}

export function createEventToken(): EventToken {
  const container = new Container();
  const line = new Graphics();
  const badge = new Text({ text: '', resolution: 2, style: BADGE_STYLE });
  badge.anchor.set(0.5);
  container.addChild(line, badge);
  return { container, line, badge };
}

function drawPassOrShotLine(g: Graphics, badge: Text, event: DrillEvent, eventNumber: number, color: number, width: number): void {
  const line = eventFlightLine(event);
  if (line.length < 2) return;
  strokeSolidLine(g, line, color, 0.95, width);
  drawArrowHead(g, line[line.length - 2], line[line.length - 1], color, 0.95, 12);
  const mid = line[Math.floor(line.length / 2)];
  const dx = event.toPoint.x - event.fromPoint.x;
  const dy = event.toPoint.y - event.fromPoint.y;
  const len = Math.hypot(dx, dy) || 1;
  drawBadge(g, badge, mid.x - (dy / len) * 14, mid.y + (dx / len) * 14, String(eventNumber), color);
}

function drawEventBody(token: EventToken, event: DrillEvent, eventNumber: number): void {
  const g = token.line.clear();
  if (event.type === 'pass') {
    const color = event.team === 'home' ? rgb(255, 210, 10) : rgb(110, 215, 255);
    drawPassOrShotLine(g, token.badge, event, eventNumber, color, 2.8);
    g.circle(event.fromPoint.x, event.fromPoint.y, 5).fill(color).stroke({ color: 0x000000, alpha: 0.28, width: 1 });
    g.circle(event.toPoint.x, event.toPoint.y, 5).fill(color).stroke({ color: 0x000000, alpha: 0.28, width: 1 });
  } else if (event.type === 'shot' || event.type === 'dump') {
    const color = rgb(255, 107, 15);
    drawPassOrShotLine(g, token.badge, event, eventNumber, color, 3);
    g.circle(event.toPoint.x, event.toPoint.y, 20).stroke({ color, alpha: 0.32, width: 2 });
  } else if (event.type === 'pickup') {
    g.circle(event.toPoint.x, event.toPoint.y, 15).fill({ color: 0x00e676, alpha: 0.16 }).stroke({ color: 0x00e676, width: 2.5 });
    drawBadge(g, token.badge, event.toPoint.x, event.toPoint.y - 23, String(eventNumber), 0x00e676);
  }
}

export function updateEvents(pool: TokenPool<EventToken>, events: DrillEvent[], selectedEventId: ID | null): void {
  pool.begin();
  events.forEach((event, index) => {
    const token = pool.get(event.id);
    drawEventBody(token, event, index + 1);
    if (event.id === selectedEventId) {
      for (const point of [event.fromPoint, event.toPoint]) {
        token.line.circle(point.x, point.y, 11).stroke({ color: 0xffffff, width: 2 });
      }
    }
  });
  pool.end();
}

// ----------------------------------------------------------------------------
// Drag preview + pass-from highlight
// ----------------------------------------------------------------------------

const DRAG_DASH: DashPattern = { dash: 8, gap: 5 };

export function updateDragPreview(g: Graphics, label: Text, dragPreview: DragPreview | null): void {
  g.clear();
  label.visible = false;
  if (!dragPreview) return;

  const color = dragPreview.kind === 'pass' ? rgb(255, 210, 10) : rgb(255, 107, 15);
  const to = dragPreview.receiver ? { x: dragPreview.receiver.x, y: dragPreview.receiver.y } : dragPreview.to;
  strokeDashedLine(g, [dragPreview.from, to], DRAG_DASH, color, 0.7, 2.5);
  drawArrowHead(g, dragPreview.from, to, color, 0.7, 13);

  if (dragPreview.kind === 'pass' && dragPreview.receiver) {
    g.circle(dragPreview.receiver.x, dragPreview.receiver.y, RINK.height * 0.055).stroke({ color, alpha: 0.7, width: 2.5 });
    label.visible = true;
    label.text = `PASS -> #${dragPreview.receiver.number}`;
    label.style.fill = color;
    label.position.set(dragPreview.receiver.x, dragPreview.receiver.y - RINK.height * 0.058 - 12);
  }

  if (dragPreview.kind === 'shoot') {
    const netL = { x: RINK.netLeftX, y: RINK.netLeftY };
    const netR = { x: RINK.netRightX, y: RINK.netRightY };
    const nearer = Math.hypot(to.x - netL.x, to.y - netL.y) < Math.hypot(to.x - netR.x, to.y - netR.y) ? netL : netR;
    const shotColor = rgb(255, 107, 15);
    for (const net of [netL, netR]) {
      const isNear = net === nearer;
      g.circle(net.x, net.y, 26).stroke({ color: shotColor, alpha: isNear ? 0.7 : 0.25, width: isNear ? 2.5 : 1.5 });
    }
    label.visible = true;
    label.text = 'SHOOT';
    label.style.fill = shotColor;
    label.position.set(nearer.x, nearer.y);
  }
}

export function updatePassFromHighlight(g: Graphics, player: Player | undefined): void {
  g.clear();
  if (!player) return;
  g.circle(player.x, player.y, RINK.height * 0.044 + 4).stroke({ color: rgb(255, 210, 10), alpha: 0.85, width: 2.5 });
}

// ----------------------------------------------------------------------------
// Dimmed players + pass candidates
// ----------------------------------------------------------------------------

const CATCH_COLOR: Record<CatchQuality, number> = {
  clean: 0x22c55e,
  assisted: 0xf59e0b,
  late: 0xf59e0b,
  unreachable: 0xef4444,
};

export function updateDimmedPlayers(g: Graphics, players: Player[], eligible: Set<ID>, passerId: ID | null): void {
  g.clear();
  for (const player of players) {
    if (player.id === passerId || eligible.has(player.id)) continue;
    g.circle(player.x, player.y, PLAYER_RADIUS + 9).fill({ color: rgb(6, 20, 31), alpha: 0.55 });
  }
}

export function updatePassCandidates(
  pool: GraphicsKeyedPool,
  candidates: { passerId: ID; candidates: PassCandidateView[] } | null,
  players: Player[],
  skatePaths: SkatePath[]
): void {
  pool.begin();
  if (candidates) {
    for (const candidate of candidates.candidates) {
      const g = pool.get(String(candidate.actorId));
      const color = CATCH_COLOR[candidate.predictedCatchQuality];
      const at = players.find(p => p.id === candidate.actorId) ?? { x: 0, y: 0 };
      g.circle(at.x, at.y, PLAYER_RADIUS + 9).stroke({ color, alpha: 1, width: 2.6 });

      const route = skatePaths.find(path => path.ownerId === candidate.actorId);
      if (route && (route.points?.length ?? 0) >= 2) {
        strokeSolidLine(g, expandCurve(route.points, route.shape ?? 'spline'), color, 0.3, 12);
      }

      const lead = Math.hypot(candidate.targetPoint.x - at.x, candidate.targetPoint.y - at.y);
      if (lead > PLAYER_RADIUS) {
        g.circle(candidate.targetPoint.x, candidate.targetPoint.y, PLAYER_RADIUS * 0.7).stroke({ color, alpha: 0.85, width: 1.8 });
      }
    }
  }
  pool.end();
}

// ----------------------------------------------------------------------------
// Edit handles — route + event, reusing CONTROL_HANDLE_RADIUS/ADD_HANDLE_RADIUS
// so hit-testing alignment holds by construction.
// ----------------------------------------------------------------------------

function drawControlHandle(g: Graphics, point: Point, accent: number): void {
  g.circle(point.x, point.y, CONTROL_HANDLE_RADIUS)
    .fill({ color: accent, alpha: 0.35 })
    .stroke({ color: accent, width: 2.2 });
  g.circle(point.x, point.y, 2.8).fill(0xffffff);
}

function drawAddHandle(g: Graphics, point: Point, accent: number): void {
  g.circle(point.x, point.y, 4.5)
    .fill({ color: 0x051b2c, alpha: 0.85 })
    .stroke({ color: accent, alpha: 0.9, width: 1.5 });
  g.moveTo(point.x - 2, point.y).lineTo(point.x + 2, point.y).stroke({ color: 0xffffff, width: 1.2 });
  g.moveTo(point.x, point.y - 2).lineTo(point.x, point.y + 2).stroke({ color: 0xffffff, width: 1.2 });
}

export function updateEditHandles(pool: GraphicsKeyedPool, input: DynamicLayerInput): void {
  pool.begin();
  const active = !input.isPlaying && !input.suppressEditAffordances;

  if (active && input.selectedPlayerId) {
    const route = input.drill.skatePaths.find(path => path.ownerId === input.selectedPlayerId);
    if (route && route.points.length >= 2) {
      for (const { index, point } of controlMidpoints(route.points)) {
        drawAddHandle(pool.get(`route-add-${index}`), point, 0x00c8f0);
      }
      for (let i = 1; i < route.points.length; i++) {
        drawControlHandle(pool.get(`route-ctl-${i}`), route.points[i], 0x00c8f0);
      }
    }
  }

  if (active && input.selectedEventId) {
    const event = input.drill.events.find(item => item.id === input.selectedEventId);
    if (event) {
      let ev = event;
      if (input.draggedEventHandle && input.draggedEventHandle.eventId === event.id) {
        if (input.draggedEventHandle.part === 'end') {
          ev = { ...ev, toPoint: input.draggedEventHandle.point };
        } else if (input.draggedEventHandle.part === 'start') {
          ev = { ...ev, fromPoint: input.draggedEventHandle.point };
        } else if (input.draggedEventHandle.part === 'waypoint' && ev.waypoints) {
          ev = {
            ...ev,
            waypoints: ev.waypoints.map((w, idx) => (idx === input.draggedEventHandle!.index ? input.draggedEventHandle!.point : w)),
          };
        }
      }
      const controls = flightControls(ev, ev.fromPoint, ev.toPoint);
      for (const { index, point } of controlMidpoints(controls)) {
        drawAddHandle(pool.get(`event-add-${index}`), point, 0xffd60a);
      }
      (event.waypoints ?? []).forEach((waypoint, index) => {
        const g = pool.get(`event-wp-${index}`);
        const d = 9;
        g.moveTo(waypoint.x, waypoint.y - d)
          .lineTo(waypoint.x + d, waypoint.y)
          .lineTo(waypoint.x, waypoint.y + d)
          .lineTo(waypoint.x - d, waypoint.y)
          .closePath()
          .fill({ color: 0xffd60a, alpha: 0.22 })
          .stroke({ color: 0xffd60a, width: 2.4 });
        g.circle(waypoint.x, waypoint.y, 2.4).fill(0xfff7d6);
      });
      if (ev.type === 'shot' || ev.type === 'dump') {
        pool
          .get('event-start')
          .circle(ev.fromPoint.x, ev.fromPoint.y, 8)
          .fill({ color: 0x061823, alpha: 0.9 })
          .stroke({ color: 0x00e676, width: 2.2 });

        pool
          .get('event-end')
          .circle(ev.toPoint.x, ev.toPoint.y, 8)
          .fill({ color: 0x061823, alpha: 0.9 })
          .stroke({ color: 0xff6b0f, width: 2 });
      }
    }
  }

  pool.end();
}

// ----------------------------------------------------------------------------
// Animated puck + diagnostics
// ----------------------------------------------------------------------------

export function updateAnimatedPuck(g: Graphics, puck: AnimatedPuck | null): void {
  g.clear();
  if (!puck?.visible) return;
  const strokeAlpha = puck.state === 'loose' ? 1 : 0.62;
  const width = puck.state === 'loose' ? 2.2 : 1.5;
  g.ellipse(puck.x, puck.y, 7, 5).fill(0x111111).stroke({ color: 0xffffff, alpha: strokeAlpha, width });
}

export function updateDiagnostics(
  g: Graphics,
  players: Player[],
  frames: Record<ID, PlaybackPlayerFrame>,
  puck: AnimatedPuck | null,
  show: boolean
): void {
  g.clear();
  if (!show) return;
  for (const player of players) {
    const frame = frames[player.id];
    if (!frame) continue;
    const { position, velocity, bladePosition, heading } = frame;
    g.moveTo(position.x, position.y)
      .lineTo(position.x + Math.cos(heading) * 34, position.y + Math.sin(heading) * 34)
      .stroke({ color: 0x00d2ff, alpha: 0.9, width: 1.5, cap: 'round' });
    g.moveTo(position.x, position.y)
      .lineTo(position.x + velocity.x * 0.22, position.y + velocity.y * 0.22)
      .stroke({ color: 0x00e676, alpha: 0.75, width: 1.5, cap: 'round' });
    g.circle(bladePosition.x, bladePosition.y, 2.8).fill(0xffd60a);
  }
  if (puck?.state === 'in_flight' && puck.intendedReceiverId) {
    const receiver = frames[puck.intendedReceiverId];
    if (receiver) {
      g.circle(receiver.bladePosition.x, receiver.bladePosition.y, SIMULATION.catchRadius).stroke({
        color: 0xffd60a,
        alpha: 0.55,
        width: 1.3,
      });
    }
  }
}

// ----------------------------------------------------------------------------
// Glow layer — the ONLY container a BlurFilter is ever attached to, and only
// at `quality === 'high'` (the brief's explicit rule). `'low'` sheds glow
// entirely; `'medium'` keeps the plain (unblurred) rings/strokes the other
// groups already draw, so nothing actually vanishes at 'medium' - only the
// soft bloom on top of them does.
// ----------------------------------------------------------------------------

export function updateGlow(
  g: Graphics,
  input: DynamicLayerInput,
  players: Player[],
  passCandidates: { passerId: ID; candidates: PassCandidateView[] } | null
): void {
  g.clear();
  if (input.puck?.visible && (input.puck.state === 'in_flight' || input.puck.state === 'shot' || input.puck.state === 'loose')) {
    const color = input.puck.state === 'shot' ? rgb(255, 107, 15) : rgb(255, 214, 10);
    g.circle(input.puck.x, input.puck.y, 10).fill({ color, alpha: 0.35 });
  }

  const holder = getCurrentPuckHolder(input.drill.players, input.drill.events);
  // Gated the same way gameScene.ts gates the solid ring (`isPuckHolder`,
  // see its `!input.puck && isPuckHolder` there): while the puck is animated
  // in flight/shot/loose, `getCurrentPuckHolder` still names the player who
  // last had it, but nobody currently does - drawing the glow anyway blooms a
  // player who visibly doesn't have the puck for the whole of playback.
  if (!input.puck && holder) {
    const carrier = players.find(p => p.id === holder.id);
    if (carrier) g.circle(carrier.x, carrier.y, PLAYER_RADIUS + 5).stroke({ color: 0xffd60a, alpha: 0.5, width: 6 });
  }

  if (passCandidates) {
    for (const candidate of passCandidates.candidates) {
      const at = players.find(p => p.id === candidate.actorId);
      if (!at) continue;
      g.circle(at.x, at.y, PLAYER_RADIUS + 9).stroke({ color: CATCH_COLOR[candidate.predictedCatchQuality], alpha: 0.4, width: 6 });
    }
  }
}

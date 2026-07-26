// ============================================================================
// WHO YOU CAN PASS TO, DRAWN ON THE ICE
//
// While a pass is armed, the coach should not have to guess. Eligible
// teammates and the lines they are skating are lit; everyone else is dimmed.
//
// This exists because targeting was invisible: the rules about who could
// receive lived in the domain, were applied at the moment of release, and the
// only feedback was a rejection after the fact. Showing the candidate set
// before the touch turns "why did that not work" into "oh, those two".
//
// Colour carries the catch prediction, so a pass that only works if the
// receiver keeps skating looks different from one they can take standing still:
//
//   green   clean      they are there for it
//   amber   assisted   they have to keep moving to meet it
//   amber   late       it only just arrives in time
//   red     unreachable they cannot get there at all
// ============================================================================

import type { ID, Player, Point, SkatePath } from '@/core/types';
import { PLAYER_RADIUS } from '@/core/constants';
import { expandCurve } from '@/utils/curves';
import type { CatchQuality } from '@/editor/passing/passTargetService';

/** What the overlay needs to know about one eligible receiver. */
export interface PassCandidateView {
  actorId: ID;
  predictedCatchQuality: CatchQuality;
  /** Where the solver says the puck would meet them. */
  targetPoint: Point;
}

const QUALITY_COLOR: Record<CatchQuality, string> = {
  clean: '#22c55e',
  assisted: '#f59e0b',
  late: '#f59e0b',
  unreachable: '#ef4444',
};

/** Ineligible players fade back so the eligible ones read first. */
export function drawDimmedPlayers(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  eligible: Set<ID>,
  passerId: ID | null
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 20, 31, 0.55)';
  for (const player of players) {
    if (player.id === passerId || eligible.has(player.id)) continue;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS + 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A ring around each eligible teammate, and a glow along the route they are
 * skating, because a point on that line is also a legal target.
 */
export function drawPassCandidates(
  ctx: CanvasRenderingContext2D,
  candidates: PassCandidateView[],
  positionOf: (id: ID) => Point,
  routes: SkatePath[]
): void {
  for (const candidate of candidates) {
    const color = QUALITY_COLOR[candidate.predictedCatchQuality];
    const at = positionOf(candidate.actorId);

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(at.x, at.y, PLAYER_RADIUS + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // The corridor: passing to a point on a teammate's route is passing to
    // where they will be, so the line is a target and should look like one.
    const route = routes.find(path => path.ownerId === candidate.actorId);
    if (route && (route.points?.length ?? 0) >= 2) {
      const line = expandCurve(route.points, route.shape ?? 'spline');
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (let index = 1; index < line.length; index++) ctx.lineTo(line[index].x, line[index].y);
      ctx.stroke();
      ctx.restore();
    }

    // Where the puck would actually meet them, when that is not simply where
    // they are standing now.
    const lead = Math.hypot(candidate.targetPoint.x - at.x, candidate.targetPoint.y - at.y);
    if (lead > PLAYER_RADIUS) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(candidate.targetPoint.x, candidate.targetPoint.y, PLAYER_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

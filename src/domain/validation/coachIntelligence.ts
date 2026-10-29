// ============================================================================
// COACH INTELLIGENCE & DOMAIN VALIDATION
//
// Pure domain analysis providing actionable hockey coaching diagnostics:
// - Pass timing verification (pass arrival vs receiver arrival)
// - Role and roster balance (goalie counts, skater quotas, position fit)
// - Spatial conflicts (overlapping actor starts, path collision risks)
// - Equipment sufficiency checks
// - Deterministic, undoable corrective proposals
// ============================================================================

import type {
  DrillDocumentV3,
  Actor,
  MovementSegment,
  PassAction,
  SkaterActor,
} from '@/domain/v3/types';
import { isSkater, isGoalie, isOnIce } from '@/domain/v3/types';
import type { Point } from '@/core/types';

export type ValidationIssueSeverity = 'error' | 'warning' | 'suggestion';

export type ValidationIssueKind =
  | 'timing_mismatch'
  | 'role_shortage'
  | 'space_conflict'
  | 'equipment_shortage'
  | 'duration_mismatch'
  | 'passing_lane_obstruction'
  | 'goalie_coverage_angle';

export interface CorrectiveProposal {
  id: string;
  label: string;
  description: string;
  apply: (drill: DrillDocumentV3) => DrillDocumentV3;
}

export interface DrillValidationIssue {
  id: string;
  kind: ValidationIssueKind;
  severity: ValidationIssueSeverity;
  title: string;
  message: string;
  affectedActorIds?: string[];
  affectedActionIds?: string[];
  timestamp?: number;
  proposal?: CorrectiveProposal;
}

export interface DrillValidationReport {
  drillId: string;
  timestamp: number;
  isValid: boolean;
  issues: DrillValidationIssue[];
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
}

export interface TeamSessionContext {
  availableSkaters?: number;
  availableGoalies?: number;
  availableRoles?: string[];
  availableEquipment?: Record<string, number>;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calculates an actor's position at a specific time in seconds along their tracks.
 */
export function estimateActorPositionAtTime(
  actor: Actor,
  segments: MovementSegment[],
  timeSec: number
): { position: Point; isAtSegmentEnd: boolean; arrivalTimeSec: number } {
  if (segments.length === 0) {
    return { position: actor.position, isAtSegmentEnd: true, arrivalTimeSec: 0 };
  }

  // Sort segments by start time
  const sorted = [...segments].sort((a, b) => a.startAtSeconds - b.startAtSeconds);

  // If time is before the first segment starts, actor is at starting position
  if (timeSec <= sorted[0].startAtSeconds) {
    return { position: sorted[0].points[0] || actor.position, isAtSegmentEnd: false, arrivalTimeSec: sorted[0].startAtSeconds };
  }

  for (const seg of sorted) {
    const start = seg.startAtSeconds + (seg.delaySeconds || 0);
    const end = start + seg.durationSeconds;

    if (timeSec >= start && timeSec <= end) {
      const progress = seg.durationSeconds > 0 ? (timeSec - start) / seg.durationSeconds : 1;
      const pts = seg.points;
      if (pts.length === 0) return { position: actor.position, isAtSegmentEnd: false, arrivalTimeSec: end };
      if (pts.length === 1) return { position: pts[0], isAtSegmentEnd: false, arrivalTimeSec: end };

      // Linear interpolation along points
      const indexFloat = progress * (pts.length - 1);
      const idx = Math.floor(indexFloat);
      const fraction = indexFloat - idx;
      const p1 = pts[idx];
      const p2 = pts[Math.min(pts.length - 1, idx + 1)];
      const interp: Point = {
        x: p1.x + (p2.x - p1.x) * fraction,
        y: p1.y + (p2.y - p1.y) * fraction,
      };
      return { position: interp, isAtSegmentEnd: progress >= 0.99, arrivalTimeSec: end };
    }
  }

  // If time is past all segments, actor is at the end of the last segment
  const last = sorted[sorted.length - 1];
  const lastPt = last.points[last.points.length - 1] || actor.position;
  const lastEnd = last.startAtSeconds + (last.delaySeconds || 0) + last.durationSeconds;
  return { position: lastPt, isAtSegmentEnd: true, arrivalTimeSec: lastEnd };
}

/**
 * Validates pass timing against receiver routes.
 */
function validatePassTiming(
  drill: DrillDocumentV3,
  issues: DrillValidationIssue[]
): void {
  for (const track of (drill.puckTracks || [])) {
    for (const action of track.actions) {
      if (action.type !== 'pass') continue;

      const pass = action as PassAction;

      // Check arrival vs release sanity
      if (pass.arrivalAt <= pass.releaseAt) {
        issues.push({
          id: `pass-order-${pass.id}`,
          kind: 'timing_mismatch',
          severity: 'error',
          title: 'Pass Timing Error',
          message: `Pass arrives at ${pass.arrivalAt.toFixed(1)}s, before or at release time (${pass.releaseAt.toFixed(1)}s).`,
          affectedActionIds: [pass.id],
          timestamp: pass.releaseAt,
          proposal: {
            id: `fix-pass-arrival-${pass.id}`,
            label: 'Set Standard Pass Flight Duration',
            description: `Adjust arrival time to ${Math.max(pass.releaseAt + 0.5, pass.arrivalAt).toFixed(1)}s (+0.8s flight time).`,
            apply: (d) => {
              const clone = structuredClone(d);
              for (const trk of clone.puckTracks) {
                for (const act of trk.actions) {
                  if (act.id === pass.id) {
                    act.arrivalAt = act.releaseAt + 0.8;
                  }
                }
              }
              return clone;
            },
          },
        });
        continue;
      }

      // Check receiver arrival timing if passing to an actor
      if (pass.toActorId) {
        const receiver = drill.actors.find(a => a.id === pass.toActorId);
        if (!receiver) continue;

        const receiverTrack = drill.actorTracks.find(t => t.actorId === receiver.id);
        const segments = receiverTrack ? receiverTrack.segments : [];

        // Estimate where receiver is at the moment the puck arrives
        const receiverState = estimateActorPositionAtTime(receiver, segments, pass.arrivalAt);
        const distToTarget = distance(receiverState.position, pass.target);

        // If target is farther than 15 feet from where the receiver is at that moment
        if (distToTarget > 15) {
          // Find when the receiver actually gets closest to pass.target
          let bestTimeSec = receiverState.arrivalTimeSec;
          let minDistance = distToTarget;

          // Sample along receiver route
          for (let t = pass.releaseAt; t <= pass.arrivalAt + 5; t += 0.25) {
            const pos = estimateActorPositionAtTime(receiver, segments, t).position;
            const d = distance(pos, pass.target);
            if (d < minDistance) {
              minDistance = d;
              bestTimeSec = t;
            }
          }

          const mismatchSec = Math.abs(pass.arrivalAt - bestTimeSec);
          if (mismatchSec >= 0.5) {
            const receiverLabel = (receiver as SkaterActor).number || receiver.label || receiver.id;
            const arrivalDiffStr =
              pass.arrivalAt < bestTimeSec
                ? `Puck arrives ${mismatchSec.toFixed(1)}s too early (receiver reaches target area at ${bestTimeSec.toFixed(1)}s).`
                : `Receiver arrived ${mismatchSec.toFixed(1)}s earlier (at ${bestTimeSec.toFixed(1)}s) than puck arrival (${pass.arrivalAt.toFixed(1)}s).`;

            issues.push({
              id: `pass-timing-${pass.id}`,
              kind: 'timing_mismatch',
              severity: 'warning',
              title: 'Pass-Receiver Timing Mismatch',
              message: `Pass to #${receiverLabel} lands ${distToTarget.toFixed(0)}ft away from receiver position at ${pass.arrivalAt.toFixed(1)}s. ${arrivalDiffStr}`,
              affectedActorIds: [receiver.id, pass.fromActorId],
              affectedActionIds: [pass.id],
              timestamp: pass.arrivalAt,
              proposal: {
                id: `sync-pass-${pass.id}`,
                label: `Synchronize Pass Timing (${bestTimeSec.toFixed(1)}s)`,
                description: `Adjust pass release and arrival so puck arrives right as #${receiverLabel} reaches the reception zone.`,
                apply: (d) => {
                  const clone = structuredClone(d);
                  for (const trk of clone.puckTracks) {
                    for (const act of trk.actions) {
                      if (act.id === pass.id) {
                        const flightDuration = Math.max(0.4, act.arrivalAt - act.releaseAt);
                        act.arrivalAt = bestTimeSec;
                        act.releaseAt = Math.max(0, bestTimeSec - flightDuration);
                      }
                    }
                  }
                  return clone;
                },
              },
            });
          }
        }
      }
    }
  }
}

/**
 * Validates roster roles and player counts.
 */
function validateRolesAndAttendance(
  drill: DrillDocumentV3,
  context: TeamSessionContext | undefined,
  issues: DrillValidationIssue[]
): void {
  const meta = drill.metadata;
  const skatersOnIce = drill.actors.filter(isSkater);
  const goaliesOnIce = drill.actors.filter(isGoalie);

  // Goalie requirement checks
  if (meta.goalieCount > 0 && goaliesOnIce.length === 0) {
    issues.push({
      id: 'role-missing-goalie',
      kind: 'role_shortage',
      severity: 'warning',
      title: 'Missing Goaltender',
      message: `Drill requires ${meta.goalieCount} goalie(s), but none are placed on the rink.`,
      proposal: {
        id: 'add-default-goalie',
        label: 'Place Goaltender in Crease',
        description: 'Automatically places a goalie in the primary net crease.',
        apply: (d) => {
          const clone = structuredClone(d);
          const newGoalie: Actor = {
            id: `act-goalie-${Date.now()}`,
            kind: 'goalie',
            team: 'home',
            number: '31',
            label: 'G31',
            position: { x: 89, y: 0 },
          };
          clone.actors.push(newGoalie);
          return clone;
        },
      },
    });
  }

  // Skater min quota
  if (meta.skaterCount.min > 0 && skatersOnIce.length < meta.skaterCount.min) {
    issues.push({
      id: 'role-skater-shortage',
      kind: 'role_shortage',
      severity: 'warning',
      title: 'Skater Count Below Minimum',
      message: `Drill specification calls for at least ${meta.skaterCount.min} skaters, but currently has ${skatersOnIce.length}.`,
    });
  }

  // Context-aware checks if context is provided
  if (context?.availableGoalies !== undefined && context.availableGoalies < meta.goalieCount) {
    issues.push({
      id: 'context-goalie-shortage',
      kind: 'role_shortage',
      severity: 'suggestion',
      title: 'Goalie Availability Alert',
      message: `Today's session has ${context.availableGoalies} goalie(s) available, but drill uses ${meta.goalieCount}. Consider using target nets or a shooter tutor.`,
    });
  }
}

/**
 * Validates space overlaps and collision hazards.
 */
function validateSpatialConflicts(
  drill: DrillDocumentV3,
  issues: DrillValidationIssue[]
): void {
  const actors = drill.actors;

  // Check overlapping start positions (< 3 feet)
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a1 = actors[i];
      const a2 = actors[j];
      const d = distance(a1.position, a2.position);
      if (d < 3.0) {
        issues.push({
          id: `space-overlap-${a1.id}-${a2.id}`,
          kind: 'space_conflict',
          severity: 'warning',
          title: 'Overlapping Starting Positions',
          message: `${a1.label || a1.id} and ${a2.label || a2.id} are placed at nearly the same starting spot (${d.toFixed(1)}ft apart).`,
          affectedActorIds: [a1.id, a2.id],
          proposal: {
            id: `separate-actors-${a1.id}-${a2.id}`,
            label: 'Offset Starting Positions',
            description: 'Offsets the second player by 5 feet to form an orderly queue.',
            apply: (dDoc) => {
              const clone = structuredClone(dDoc);
              const target = clone.actors.find(a => a.id === a2.id);
              if (target) {
                target.position.x += 5;
              }
              return clone;
            },
          },
        });
      }
    }
  }
}

/**
 * Validates equipment completeness.
 */
function validateEquipmentSufficiency(
  drill: DrillDocumentV3,
  context: TeamSessionContext | undefined,
  issues: DrillValidationIssue[]
): void {
  const equipment = drill.equipment;

  // If coaching points mention gates, cones, or tires, but none are placed
  const textHaystack = [
    drill.metadata.title,
    drill.metadata.summary,
    ...drill.metadata.coachingPoints,
  ].join(' ').toLowerCase();

  if (textHaystack.includes('cone') && !equipment.some(e => e.kind === 'cone')) {
    issues.push({
      id: 'equip-missing-cones',
      kind: 'equipment_shortage',
      severity: 'suggestion',
      title: 'Drill References Cones',
      message: 'Coaching notes mention cones, but no cone equipment items are placed on the diagram.',
    });
  }

  if (context?.availableEquipment) {
    const counts: Record<string, number> = {};
    for (const item of equipment) {
      counts[item.kind] = (counts[item.kind] || 0) + 1;
    }

    for (const [kind, needed] of Object.entries(counts)) {
      const available = context.availableEquipment[kind];
      if (available !== undefined && available < needed) {
        issues.push({
          id: `equip-shortage-${kind}`,
          kind: 'equipment_shortage',
          severity: 'warning',
          title: `Equipment Shortage: ${kind}`,
          message: `Drill requires ${needed} ${kind}(s), but current rink inventory only has ${available}.`,
        });
      }
    }
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Validates passing lanes against defending opponents and goalie coverage angles on shots.
 */
function validateTacticalLaneAndNetAngles(
  drill: DrillDocumentV3,
  issues: DrillValidationIssue[]
): void {
  const actorsById = new Map<string, Actor>(drill.actors.map(a => [a.id, a]));
  const goalies = drill.actors.filter(isGoalie);

  for (const track of (drill.puckTracks || [])) {
    for (const action of track.actions) {
      if (action.type === 'pass') {
        const pass = action as PassAction;
        const passer = actorsById.get(pass.fromActorId);
        if (!passer || !isOnIce(passer)) continue;

        for (const actor of drill.actors) {
          if (actor.id === pass.fromActorId || actor.id === pass.toActorId) continue;
          if (!isOnIce(actor)) continue;
          if (actor.team === passer.team) continue; // Only check opponents

          const midTime = (pass.releaseAt + pass.arrivalAt) / 2;
          const segments = (drill.actorTracks || []).find(t => t.actorId === actor.id)?.segments || [];
          const oppPos = estimateActorPositionAtTime(actor, segments, midTime).position;

          const dist = distToSegment(oppPos, pass.fromPoint, pass.target);
          if (dist < 4.0) {
            const oppLabel = ('number' in actor ? actor.number : '') || actor.label || 'opponent';
            issues.push({
              id: `lane-obstructed-${pass.id}-${actor.id}`,
              kind: 'passing_lane_obstruction',
              severity: 'warning',
              title: 'Passing Lane Obstructed',
              message: `Pass trajectory passes within stick intercept reach (${dist.toFixed(1)}ft) of defending opponent #${oppLabel}.`,
              affectedActorIds: [passer.id, actor.id],
              affectedActionIds: [pass.id],
              timestamp: pass.releaseAt,
            });
          }
        }
      } else if (action.type === 'shot') {
        // Goalie angle bisector coverage
        const shot = action;
        const netX = shot.target.x >= 0 ? 89 : -89;
        const defendingGoalie = goalies.find(g => (netX > 0 ? g.position.x > 0 : g.position.x < 0));
        if (defendingGoalie) {
          const netCenter: Point = { x: netX, y: 0 };
          const distFromBisector = distToSegment(defendingGoalie.position, netCenter, shot.fromPoint);
          if (distFromBisector > 5.5) {
            issues.push({
              id: `goalie-angle-${shot.id}-${defendingGoalie.id}`,
              kind: 'goalie_coverage_angle',
              severity: 'suggestion',
              title: 'Goaltender Off-Angle Coverage',
              message: `Defending goalie #${defendingGoalie.number || '31'} is caught off-angle (${distFromBisector.toFixed(1)}ft lateral deviation) from the shot release angle.`,
              affectedActorIds: [defendingGoalie.id],
              affectedActionIds: [shot.id],
              timestamp: shot.releaseAt,
              proposal: {
                id: `square-goalie-${defendingGoalie.id}`,
                label: 'Square Goalie to Shooting Angle',
                description: 'Positions the goalie along the angle bisector facing the shooter.',
                apply: (dDoc) => {
                  const clone = structuredClone(dDoc);
                  const g = clone.actors.find(a => a.id === defendingGoalie.id);
                  if (g) {
                    const dirX = shot.fromPoint.x - netX;
                    const dirY = shot.fromPoint.y - 0;
                    const len = Math.hypot(dirX, dirY) || 1;
                    g.position = {
                      x: netX + (dirX / len) * 4.5,
                      y: (dirY / len) * 4.5,
                    };
                  }
                  return clone;
                },
              },
            });
          }
        }
      }
    }
  }
}

export function validateDrillIntelligence(
  drill: DrillDocumentV3,
  context?: TeamSessionContext
): DrillValidationReport {
  const issues: DrillValidationIssue[] = [];

  validatePassTiming(drill, issues);
  validateRolesAndAttendance(drill, context, issues);
  validateSpatialConflicts(drill, issues);
  validateEquipmentSufficiency(drill, context, issues);
  validateTacticalLaneAndNetAngles(drill, issues);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const suggestionCount = issues.filter(i => i.severity === 'suggestion').length;

  return {
    drillId: drill.id,
    timestamp: Date.now(),
    isValid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    suggestionCount,
  };
}

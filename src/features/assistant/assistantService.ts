// ============================================================================
// ASSISTANT SERVICE & GROUNDED PROPOSAL ENGINE
// ============================================================================

import type {
  AssistantConfig,
  AssistantProposal,
  AssistantStatus,
} from './types';
import type {
  DrillDocumentV3,
  EquipmentItem,
  PassAction,
  SkaterActor,
  SkaterPosition,
} from '@/domain/v3/types';
import { isSkater } from '@/domain/v3/types';
import { parseDrillDocumentV3 } from '@/domain/v3/schema';
import type { PracticeSession } from '@/domain/practice/types';
import { parsePracticeSession } from '@/domain/practice/schema';

let currentConfig: AssistantConfig = {};

/**
 * Returns current assistant configuration status.
 * Unconfigured by default unless an explicit remote API key is supplied.
 */
export function getAssistantStatus(): AssistantStatus {
  if (currentConfig.apiKey && currentConfig.apiKey.trim().length > 0) {
    return 'configured';
  }
  return 'unconfigured';
}

export function configureAssistant(config: AssistantConfig): void {
  currentConfig = { ...config };
}

export function resetAssistantConfig(): void {
  currentConfig = {};
}

/**
 * Creates an allowlisted proposal to add equipment items to a drill.
 */
export function proposeAddEquipment(
  drill: DrillDocumentV3,
  items: EquipmentItem[],
  rationale: string = 'Added boundary and target equipment.'
): AssistantProposal<DrillDocumentV3> {
  const opId = `op-equip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const beforeCount = drill.equipment.length;
  const afterCount = beforeCount + items.length;

  return {
    operationId: opId,
    kind: 'add_equipment',
    affectedRecord: 'drill',
    sourceRevision: drill.updatedAt || 0,
    summary: `Add ${items.length} equipment item(s) (${items.map(i => i.kind).join(', ')}). ${rationale}`,
    assumptions: ['Rink layout has adequate space for the requested equipment items.'],
    diff: {
      changedFields: ['equipment'],
      summary: `Equipment count: ${beforeCount} → ${afterCount}`,
      beforeSnapshot: `${beforeCount} equipment items`,
      afterSnapshot: `${afterCount} equipment items (+${items.map(i => i.kind).join(', ')})`,
    },
    status: 'pending',
    apply: (source: DrillDocumentV3): DrillDocumentV3 => {
      const next = structuredClone(source);
      next.equipment.push(...items);
      next.updatedAt = Date.now();
      const validation = parseDrillDocumentV3(next);
      if (!validation.ok) {
        throw new Error(`Proposal application failed schema validation: ${validation.message}`);
      }
      return validation.document;
    },
  };
}

/**
 * Creates an allowlisted proposal to append a coaching cue/point.
 */
export function proposeAppendCue(
  drill: DrillDocumentV3,
  cue: string
): AssistantProposal<DrillDocumentV3> {
  const opId = `op-cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanCue = cue.trim();

  return {
    operationId: opId,
    kind: 'append_cue',
    affectedRecord: 'drill',
    sourceRevision: drill.updatedAt || 0,
    summary: `Add coaching point: "${cleanCue}"`,
    assumptions: ['Applies directly to current drill execution habits.'],
    diff: {
      changedFields: ['metadata.coachingPoints'],
      summary: `Coaching points: ${drill.metadata.coachingPoints.length} → ${drill.metadata.coachingPoints.length + 1}`,
      beforeSnapshot: drill.metadata.coachingPoints.join('; '),
      afterSnapshot: [...drill.metadata.coachingPoints, cleanCue].join('; '),
    },
    status: 'pending',
    apply: (source: DrillDocumentV3): DrillDocumentV3 => {
      const next = structuredClone(source);
      next.metadata.coachingPoints.push(cleanCue);
      next.updatedAt = Date.now();
      const validation = parseDrillDocumentV3(next);
      if (!validation.ok) {
        throw new Error(`Proposal application failed schema validation: ${validation.message}`);
      }
      return validation.document;
    },
  };
}

/**
 * Creates an allowlisted proposal to adjust pass timing.
 */
export function proposeAdjustPassTiming(
  drill: DrillDocumentV3,
  passId: string,
  deltaSeconds: number
): AssistantProposal<DrillDocumentV3> {
  const opId = `op-timing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let oldArrival = 0;
  for (const trk of drill.puckTracks) {
    for (const act of trk.actions) {
      if (act.id === passId && act.type === 'pass') {
        oldArrival = (act as PassAction).arrivalAt;
      }
    }
  }

  const newArrival = Math.max(0.5, oldArrival + deltaSeconds);

  return {
    operationId: opId,
    kind: 'adjust_timing',
    affectedRecord: 'drill',
    sourceRevision: drill.updatedAt || 0,
    summary: `Adjust pass arrival timing by ${deltaSeconds > 0 ? '+' : ''}${deltaSeconds.toFixed(1)}s (to ${newArrival.toFixed(1)}s)`,
    assumptions: ['Preserves pass release position and receiver route velocity.'],
    diff: {
      changedFields: ['puckTracks.actions.arrivalAt'],
      summary: `Pass arrival: ${oldArrival.toFixed(1)}s → ${newArrival.toFixed(1)}s`,
      beforeSnapshot: `Arrival: ${oldArrival.toFixed(1)}s`,
      afterSnapshot: `Arrival: ${newArrival.toFixed(1)}s`,
    },
    status: 'pending',
    apply: (source: DrillDocumentV3): DrillDocumentV3 => {
      const next = structuredClone(source);
      let found = false;
      for (const trk of next.puckTracks) {
        for (const act of trk.actions) {
          if (act.id === passId && act.type === 'pass') {
            const pass = act as PassAction;
            pass.arrivalAt = newArrival;
            if (pass.releaseAt >= pass.arrivalAt) {
              pass.releaseAt = Math.max(0, pass.arrivalAt - 0.6);
            }
            found = true;
          }
        }
      }
      if (!found) {
        throw new Error(`Pass action with ID "${passId}" not found in drill.`);
      }
      next.updatedAt = Date.now();
      const validation = parseDrillDocumentV3(next);
      if (!validation.ok) {
        throw new Error(`Proposal application failed schema validation: ${validation.message}`);
      }
      return validation.document;
    },
  };
}

/**
 * Creates an allowlisted proposal to assign a role and jersey number to a skater.
 */
export function proposeAssignRole(
  drill: DrillDocumentV3,
  actorId: string,
  role: SkaterPosition,
  number?: string
): AssistantProposal<DrillDocumentV3> {
  const opId = `op-role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const actor = drill.actors.find(a => a.id === actorId);
  const oldRole = actor && isSkater(actor) ? actor.role : 'unassigned';
  const oldNumber = actor && isSkater(actor) ? actor.number : '';

  return {
    operationId: opId,
    kind: 'assign_role',
    affectedRecord: 'drill',
    sourceRevision: drill.updatedAt || 0,
    summary: `Assign role ${role}${number ? ` (#${number})` : ''} to skater ${actor?.label || actorId}`,
    assumptions: ['Role aligns with drill tactical breakout or offensive structure.'],
    diff: {
      changedFields: ['actors.role', 'actors.number'],
      summary: `Role: ${oldRole} → ${role}${number ? `, Number: ${oldNumber} → ${number}` : ''}`,
      beforeSnapshot: `Role: ${oldRole}, No: ${oldNumber}`,
      afterSnapshot: `Role: ${role}, No: ${number ?? oldNumber}`,
    },
    status: 'pending',
    apply: (source: DrillDocumentV3): DrillDocumentV3 => {
      const next = structuredClone(source);
      const target = next.actors.find(a => a.id === actorId);
      if (!target || !isSkater(target)) {
        throw new Error(`Skater with ID "${actorId}" not found.`);
      }
      const skater = target as SkaterActor;
      skater.role = role;
      if (number) skater.number = number;
      next.updatedAt = Date.now();
      const validation = parseDrillDocumentV3(next);
      if (!validation.ok) {
        throw new Error(`Proposal application failed schema validation: ${validation.message}`);
      }
      return validation.document;
    },
  };
}

/**
 * Creates an allowlisted proposal to shorten practice duration to a target time,
 * scaling unlocked blocks while strictly respecting locked block allocations.
 */
export function proposeShortenPractice(
  session: PracticeSession,
  newTargetMinutes: number
): AssistantProposal<PracticeSession> {
  const opId = `op-shorten-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const currentTotal = session.blocks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
  const lockedBlocks = session.blocks.filter(b => b.locked);
  const unlockedBlocks = session.blocks.filter(b => !b.locked);

  const lockedMinutes = lockedBlocks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
  const availableForUnlocked = Math.max(0, newTargetMinutes - lockedMinutes);
  const unlockedCurrentMinutes = unlockedBlocks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

  const scaleFactor = unlockedCurrentMinutes > 0 ? availableForUnlocked / unlockedCurrentMinutes : 1;

  const modifiedBlocks = session.blocks.map(b => {
    if (b.locked) return { ...b };
    const scaled = Math.max(1, Math.round((b.durationMinutes || 0) * scaleFactor));
    return { ...b, durationMinutes: scaled };
  });

  const resultingTotal = modifiedBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  return {
    operationId: opId,
    kind: 'scale_duration',
    affectedRecord: 'practice',
    sourceRevision: session.updatedAt || session.createdAt,
    summary: `Shorten practice from ${currentTotal}m to ${resultingTotal}m (target ${newTargetMinutes}m), preserving ${lockedBlocks.length} locked block(s).`,
    assumptions: [
      'Locked blocks retain exact duration allocations.',
      'Drill route animation speeds are uncompromised; practice block allocation duration is adjusted.',
    ],
    diff: {
      changedFields: ['blocks.durationMinutes', 'targetMinutes'],
      summary: `Target minutes: ${session.targetMinutes} → ${newTargetMinutes}. Total duration: ${currentTotal}m → ${resultingTotal}m`,
      beforeSnapshot: session.blocks.map(b => `${b.title}: ${b.durationMinutes}m${b.locked ? ' (locked)' : ''}`).join(', '),
      afterSnapshot: modifiedBlocks.map(b => `${b.title}: ${b.durationMinutes}m${b.locked ? ' (locked)' : ''}`).join(', '),
    },
    status: 'pending',
    apply: (source: PracticeSession): PracticeSession => {
      const next = structuredClone(source);
      next.targetMinutes = newTargetMinutes;
      next.blocks = modifiedBlocks.map(b => structuredClone(b));
      next.updatedAt = new Date().toISOString();
      const validation = parsePracticeSession(next);
      if (!validation.ok) {
        throw new Error(`Proposal application failed schema validation: ${validation.issues.map(i => i.message).join(', ')}`);
      }
      return validation.session;
    },
  };
}

/**
 * Validates whether a proposal is still fresh relative to the current working document.
 */
export function validateProposalFreshness<T extends DrillDocumentV3 | PracticeSession>(
  proposal: AssistantProposal<T>,
  document: T
): { fresh: true } | { fresh: false; reason: string } {
  const currentRevision = (document as { updatedAt?: string | number }).updatedAt ?? 0;
  if (String(proposal.sourceRevision) !== String(currentRevision)) {
    return {
      fresh: false,
      reason: `Stale proposal: proposal was created against revision ${proposal.sourceRevision}, but document has been updated to ${currentRevision}.`,
    };
  }
  return { fresh: true };
}

/**
 * Safely applies an assistant proposal to a document, verifying freshness and schema.
 */
export function safelyApplyProposal<T extends DrillDocumentV3 | PracticeSession>(
  proposal: AssistantProposal<T>,
  document: T,
  options: { allowStale?: boolean } = {}
): { ok: true; document: T } | { ok: false; error: string; stale?: boolean } {
  if (!options.allowStale) {
    const freshness = validateProposalFreshness(proposal, document);
    if (!freshness.fresh) {
      return { ok: false, error: freshness.reason, stale: true };
    }
  }

  try {
    const updated = proposal.apply(document);
    return { ok: true, document: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

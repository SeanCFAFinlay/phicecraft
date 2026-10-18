import type { DrillDocumentV3, MovementSegment, PuckAction } from './types';
import { projectToV2 } from './projectToV2';

/**
 * An edit round-trip is stored-v3 → projectToV2 → edit → migrateV2ToV3.
 * Projection drops what v2 cannot say (equipment, annotations, extra puck
 * tracks, phase structure, rich metadata). Saving the migrated edit verbatim
 * would therefore erase those from storage. This merge keeps the coach's
 * edits and carries the inexpressible parts over from the stored document.
 */
export function mergeEditedIntoStored(
  stored: DrillDocumentV3,
  edited: DrillDocumentV3
): DrillDocumentV3 {
  const phases = stored.phases.length > 1 ? stored.phases : edited.phases;
  const validPhaseIds = new Set(phases.map(phase => phase.id));
  const anchorPhaseId = phases[0]?.id;
  const projectedRoutes = new Map(projectToV2(stored).drill.skatePaths.map(path => [path.ownerId, path.points]));

  const reanchorSegment = (segment: MovementSegment): MovementSegment =>
    validPhaseIds.has(segment.phaseId)
      ? segment
      : { ...segment, phaseId: anchorPhaseId ?? segment.phaseId };
  const reanchorAction = (action: PuckAction): PuckAction =>
    validPhaseIds.has(action.phaseId)
      ? action
      : { ...action, phaseId: anchorPhaseId ?? action.phaseId };

  return {
    ...edited,
    metadata: { ...stored.metadata, title: edited.metadata.title },
    groups: stored.groups,
    equipment: stored.equipment,
    annotations: stored.annotations,
    phases,
    actorTracks: edited.actorTracks.map(track => ({
      ...track,
      segments: (() => {
        const original = stored.actorTracks.find(candidate => candidate.actorId === track.actorId);
        const flattened = projectedRoutes.get(track.actorId);
        if (original && original.segments.length > 1 && track.segments.length === 1 &&
          flattened && JSON.stringify(track.segments[0].points) === JSON.stringify(flattened)) {
          return original.segments;
        }
        return track.segments.map(reanchorSegment);
      })(),
    })),
    puckTracks: [
      ...edited.puckTracks.slice(0, 1).map(track => ({
        ...track,
        actions: track.actions.map(reanchorAction),
      })),
      ...stored.puckTracks.slice(1),
    ],
    // durationSeconds, jerseys and reducedEffects are all things v2 can edit,
    // so the coach's edit wins; defaultView and showPlayerNumbers have no v2
    // equivalent (migrateV2ToV3 always hardcodes them), so the stored value -
    // kept by the spread below - survives an edit-save untouched.
    presentation: {
      ...stored.presentation,
      durationSeconds: edited.presentation.durationSeconds,
      jerseys: edited.presentation.jerseys,
      coaching: edited.presentation.coaching,
      reducedEffects: edited.presentation.reducedEffects,
    },
    templateId: stored.templateId,
    createdAt: stored.createdAt,
    updatedAt: edited.updatedAt,
  };
}

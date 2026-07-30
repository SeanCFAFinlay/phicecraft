// ============================================================================
// REMAPPING A V3 DOCUMENT'S IDS
//
// A template copy must not share so much as one id with the template it came
// from: two documents that agree on an actor, group, equipment, phase or
// track id are two documents that can alias each other the moment some future
// feature reconciles by id - exactly how the v2 coach hack (a skater standing
// in for a coach) worked its way into the model in the first place.
//
// Every id in the document is rewritten through ONE shared map, so an id that
// appears in more than one place - an actor referenced by its own track AND a
// puck source AND a pass's `toActorId`, say - is rewritten to the SAME fresh
// id everywhere, never three different ones. `validateV3Document`'s
// duplicate-id check treats actors, equipment, phases, puck tracks and
// annotations as one shared namespace, so this does too.
// ============================================================================

import type {
  Actor,
  ActorGroup,
  ActorTrack,
  Annotation,
  DrillDocumentV3,
  EquipmentItem,
  ID,
  MovementSegment,
  PuckAction,
  PuckSource,
  PuckTrack,
} from './types';

type Remap = (id: ID) => ID;

function remapActor(actor: Actor, remap: Remap): Actor {
  const id = remap(actor.id);
  if (actor.kind === 'skater') {
    return { ...actor, id, groupId: actor.groupId ? remap(actor.groupId) : undefined };
  }
  return { ...actor, id };
}

function remapGroup(group: ActorGroup, remap: Remap): ActorGroup {
  return { ...group, id: remap(group.id) };
}

function remapEquipment(item: EquipmentItem, remap: Remap): EquipmentItem {
  return { ...item, id: remap(item.id) };
}

function remapSegment(segment: MovementSegment, remap: Remap): MovementSegment {
  return { ...segment, id: remap(segment.id), phaseId: remap(segment.phaseId) };
}

function remapActorTrack(track: ActorTrack, remap: Remap): ActorTrack {
  return {
    actorId: remap(track.actorId),
    segments: track.segments.map(segment => remapSegment(segment, remap)),
  };
}

function remapSource(source: PuckSource, remap: Remap): PuckSource {
  switch (source.kind) {
    case 'actor':
    case 'coach':
      return { ...source, actorId: remap(source.actorId) };
    case 'equipment':
      return { ...source, equipmentId: remap(source.equipmentId) };
    case 'loose':
      return source;
  }
}

function remapAction(action: PuckAction, remap: Remap): PuckAction {
  const shared = {
    id: remap(action.id),
    phaseId: remap(action.phaseId),
    fromActorId: remap(action.fromActorId),
  };

  switch (action.type) {
    case 'pass':
      return { ...action, ...shared, toActorId: action.toActorId ? remap(action.toActorId) : undefined };
    case 'turnover':
      return { ...action, ...shared, toActorId: remap(action.toActorId) };
    case 'shot':
    case 'dump':
    case 'pickup':
      return { ...action, ...shared };
  }
}

function remapPuckTrack(track: PuckTrack, remap: Remap): PuckTrack {
  return {
    ...track,
    id: remap(track.id),
    initialSource: remapSource(track.initialSource, remap),
    actions: track.actions.map(action => remapAction(action, remap)),
  };
}

function remapAnnotation(annotation: Annotation, remap: Remap): Annotation {
  return {
    ...annotation,
    id: remap(annotation.id),
    phaseId: annotation.phaseId ? remap(annotation.phaseId) : undefined,
  };
}

/**
 * Rewrite every actor, group, equipment, phase, track, segment, action and
 * annotation id in `document` to a fresh one, consistently.
 *
 * The document's own top-level `id` is deliberately left alone - the caller
 * (`useTemplate`) assigns that separately, alongside `templateId`,
 * `createdAt` and `updatedAt`, once for the whole copy.
 */
export function remapDocumentIds(document: DrillDocumentV3, generateId: () => ID): DrillDocumentV3 {
  const known = new Map<ID, ID>();
  const remap: Remap = id => {
    const existing = known.get(id);
    if (existing) return existing;
    const fresh = generateId();
    known.set(id, fresh);
    return fresh;
  };

  return {
    ...document,
    actors: document.actors.map(actor => remapActor(actor, remap)),
    groups: document.groups.map(group => remapGroup(group, remap)),
    equipment: document.equipment.map(item => remapEquipment(item, remap)),
    phases: document.phases.map(phase => ({ ...phase, id: remap(phase.id) })),
    actorTracks: document.actorTracks.map(track => remapActorTrack(track, remap)),
    puckTracks: document.puckTracks.map(track => remapPuckTrack(track, remap)),
    annotations: document.annotations.map(annotation => remapAnnotation(annotation, remap)),
  };
}

// ============================================================================
// IS THIS DOCUMENT COHERENT?
//
// Structural checks, not taste. The v3 model is a graph - tracks point at
// actors, actions point at phases and at other actors, sources point at
// equipment - and a graph with a dangling edge fails somewhere far away from
// the edit that broke it.
//
// Two levels, because they need different handling:
//
//   ERROR    the document cannot be simulated or drawn as it stands. A pass to
//            an actor who is not on the ice has no destination.
//   WARNING  the document is coherent but says something a coach probably did
//            not mean. A phase nothing happens in, a puck nobody ever touches.
//
// This deliberately does NOT re-check hockey rules that live in `engine/puck`.
// One rule, one home; duplicating "a pass goes to a teammate" here is how the
// two copies eventually disagree.
// ============================================================================

import {
  isOnIce,
  orderedActions,
  type Actor,
  type DrillDocumentV3,
  type ID,
  type PuckAction,
} from './types';

export type ProblemLevel = 'error' | 'warning';

export interface DocumentProblem {
  level: ProblemLevel;
  code:
    | 'duplicate-id'
    | 'unknown-actor'
    | 'unknown-phase'
    | 'unknown-equipment'
    | 'coach-on-ice'
    | 'segment-too-short'
    | 'action-out-of-order'
    | 'action-outside-phase'
    | 'empty-phase'
    | 'untouched-puck'
    | 'no-actors';
  message: string;
  /** What the problem is attached to, for the UI to focus. */
  subjectId?: ID;
}

export interface ValidationResult {
  problems: DocumentProblem[];
  errors: DocumentProblem[];
  warnings: DocumentProblem[];
  valid: boolean;
}

function targetActorOf(action: PuckAction): ID | null {
  if (action.type === 'pass') return action.toActorId ?? null;
  if (action.type === 'turnover') return action.toActorId;
  return null;
}

function describe(actor: Actor): string {
  if (actor.kind === 'coach') return actor.name ?? 'the coach';
  return `#${actor.number}`;
}

export function validateV3Document(document: DrillDocumentV3): ValidationResult {
  const problems: DocumentProblem[] = [];
  const add = (
    level: ProblemLevel,
    code: DocumentProblem['code'],
    message: string,
    subjectId?: ID
  ) => problems.push({ level, code, message, subjectId });

  // --- identity ------------------------------------------------------------

  const seen = new Set<ID>();
  const collect = (id: ID, what: string) => {
    if (seen.has(id)) add('error', 'duplicate-id', `Two ${what} share the id "${id}".`, id);
    seen.add(id);
  };
  document.actors.forEach(actor => collect(actor.id, 'actors'));
  document.equipment.forEach(item => collect(item.id, 'pieces of equipment'));
  document.phases.forEach(phase => collect(phase.id, 'phases'));
  document.puckTracks.forEach(track => collect(track.id, 'puck tracks'));
  document.annotations.forEach(item => collect(item.id, 'annotations'));

  const actorsById = new Map(document.actors.map(actor => [actor.id, actor]));
  const phaseIds = new Set(document.phases.map(phase => phase.id));
  const equipmentIds = new Set(document.equipment.map(item => item.id));

  if (document.actors.filter(isOnIce).length === 0) {
    add('warning', 'no-actors', 'This drill has nobody on the ice.');
  }

  // --- movement ------------------------------------------------------------

  for (const track of document.actorTracks) {
    const actor = actorsById.get(track.actorId);
    if (!actor) {
      add(
        'error',
        'unknown-actor',
        `A skating route belongs to "${track.actorId}", who is not in this drill.`,
        track.actorId
      );
      continue;
    }

    if (actor.kind === 'coach') {
      // The whole point of a coach actor is that they do not skate. A route on
      // one is the v2 workaround coming back in a new costume.
      add(
        'error',
        'coach-on-ice',
        `${describe(actor)} is a coach and cannot be given a skating route.`,
        actor.id
      );
    }

    for (const segment of track.segments) {
      if (!phaseIds.has(segment.phaseId)) {
        add(
          'error',
          'unknown-phase',
          `A movement segment refers to phase "${segment.phaseId}", which does not exist.`,
          segment.id
        );
      }
      if (segment.points.length < 2) {
        add(
          'error',
          'segment-too-short',
          `A movement segment for ${describe(actor)} has fewer than two points.`,
          segment.id
        );
      }
    }
  }

  // --- puck ----------------------------------------------------------------

  const touched = new Set<ID>();

  for (const track of document.puckTracks) {
    const source = track.initialSource;
    if (source.kind === 'actor' || source.kind === 'coach') {
      if (!actorsById.has(source.actorId)) {
        add(
          'error',
          'unknown-actor',
          `A puck starts with "${source.actorId}", who is not in this drill.`,
          track.id
        );
      } else {
        touched.add(source.actorId);
      }
    }
    if (source.kind === 'equipment' && !equipmentIds.has(source.equipmentId)) {
      add(
        'error',
        'unknown-equipment',
        `A puck starts at equipment "${source.equipmentId}", which is not in this drill.`,
        track.id
      );
    }

    const actions = orderedActions(track);
    if (actions.length === 0 && source.kind !== 'loose') {
      add('warning', 'untouched-puck', 'A puck is placed but nothing ever happens to it.', track.id);
    }

    let previousArrival = -Infinity;
    for (const action of actions) {
      if (!phaseIds.has(action.phaseId)) {
        add(
          'error',
          'unknown-phase',
          `A puck action refers to phase "${action.phaseId}", which does not exist.`,
          action.id
        );
      }

      if (!actorsById.has(action.fromActorId)) {
        add(
          'error',
          'unknown-actor',
          `A puck action comes from "${action.fromActorId}", who is not in this drill.`,
          action.id
        );
      } else {
        touched.add(action.fromActorId);
      }

      const target = targetActorOf(action);
      if (target) {
        const receiver = actorsById.get(target);
        if (!receiver) {
          add(
            'error',
            'unknown-actor',
            `A puck action goes to "${target}", who is not in this drill.`,
            action.id
          );
        } else if (receiver.kind === 'coach') {
          add(
            'error',
            'coach-on-ice',
            `${describe(receiver)} is a coach and cannot receive the puck.`,
            action.id
          );
        } else {
          touched.add(target);
        }
      }

      if (action.releaseAt < previousArrival) {
        // The puck cannot leave before it got there.
        add(
          'error',
          'action-out-of-order',
          'A puck action is released before the previous one arrives.',
          action.id
        );
      }
      previousArrival = action.arrivalAt;

      const phase = document.phases.find(item => item.id === action.phaseId);
      if (phase) {
        const end = phase.startAtSeconds + phase.durationSeconds;
        if (action.releaseAt < phase.startAtSeconds - 1e-6 || action.releaseAt > end + 1e-6) {
          add(
            'warning',
            'action-outside-phase',
            `A puck action is timed outside its phase "${phase.label}".`,
            action.id
          );
        }
      }
    }
  }

  // --- phases --------------------------------------------------------------

  for (const phase of document.phases) {
    const hasMovement = document.actorTracks.some(track =>
      track.segments.some(segment => segment.phaseId === phase.id)
    );
    const hasPuck = document.puckTracks.some(track =>
      track.actions.some(action => action.phaseId === phase.id)
    );
    if (!hasMovement && !hasPuck) {
      add('warning', 'empty-phase', `Nothing happens in phase "${phase.label}".`, phase.id);
    }
  }

  const errors = problems.filter(problem => problem.level === 'error');
  const warnings = problems.filter(problem => problem.level === 'warning');

  return { problems, errors, warnings, valid: errors.length === 0 };
}

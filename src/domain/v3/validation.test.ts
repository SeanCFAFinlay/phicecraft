// ============================================================================
// DOCUMENT COHERENCE
//
// v3 is a graph. A dangling edge does not fail where it was created - it fails
// later, in the simulation or the renderer, a long way from the edit that
// broke it. These tests are about catching it at the edit.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { validateV3Document } from './validation';
import { migrateV2ToV3 } from './migrateV2ToV3';
import type { DrillDocumentV3, MovementSegment, PassAction } from './types';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';

const base = () => migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));

const codes = (document: DrillDocumentV3) =>
  validateV3Document(document).problems.map(problem => problem.code);

function segment(overrides: Partial<MovementSegment> = {}): MovementSegment {
  return {
    id: 'seg-x',
    phaseId: 'phase-1',
    startAtSeconds: 0,
    durationSeconds: 2,
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
    curve: 'spline',
    movement: 'forward',
    ...overrides,
  };
}

function pass(overrides: Partial<PassAction> = {}): PassAction {
  return {
    id: 'act-x',
    type: 'pass',
    phaseId: 'phase-1',
    fromActorId: base().actors[0].id,
    fromPoint: { x: 100, y: 100 },
    releaseAt: 1,
    arrivalAt: 2,
    waypoints: [],
    shape: 'spline',
    targetMode: 'actor',
    target: { x: 400, y: 200 },
    passType: 'flat',
    receiveMode: 'control',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------

describe('the shipped fixtures are coherent', () => {
  it('accepts the give-and-go', () => {
    const result = validateV3Document(base());
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts the corner retrieval, coach source and all', () => {
    const document = migrateV2ToV3(structuredClone(fiveManCornerRetrievalDrill));
    const result = validateV3Document(document);
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
  });
});

// ----------------------------------------------------------------------------

describe('dangling references are errors', () => {
  it('catches a route belonging to nobody', () => {
    const document = { ...base(), actorTracks: [{ actorId: 'ghost', segments: [segment()] }] };
    expect(codes(document)).toContain('unknown-actor');
    expect(validateV3Document(document).valid).toBe(false);
  });

  it('catches a segment in a phase that does not exist', () => {
    const document = {
      ...base(),
      actorTracks: [{ actorId: base().actors[0].id, segments: [segment({ phaseId: 'nope' })] }],
    };
    expect(codes(document)).toContain('unknown-phase');
  });

  it('catches a pass to somebody who is not in the drill', () => {
    const document = base();
    const track = document.puckTracks[0];
    expect(
      codes({
        ...document,
        puckTracks: [{ ...track, actions: [pass({ toActorId: 'ghost' })] }],
      })
    ).toContain('unknown-actor');
  });

  it('catches a puck starting at equipment that is not there', () => {
    const document = base();
    expect(
      codes({
        ...document,
        puckTracks: [
          { ...document.puckTracks[0], initialSource: { kind: 'equipment', equipmentId: 'nope' } },
        ],
      })
    ).toContain('unknown-equipment');
  });

  it('catches two things sharing an id', () => {
    const document = base();
    const actor = document.actors[0];
    expect(codes({ ...document, actors: [...document.actors, { ...actor }] })).toContain(
      'duplicate-id'
    );
  });
});

// ----------------------------------------------------------------------------

describe('a coach is not a player', () => {
  const withCoach = (): DrillDocumentV3 => {
    const document = base();
    return {
      ...document,
      actors: [...document.actors, { kind: 'coach', id: 'coach-1', position: { x: 0, y: 0 } }],
    };
  };

  it('refuses to give a coach a skating route', () => {
    // This is the v2 workaround trying to come back wearing a new costume.
    const document = withCoach();
    expect(
      codes({ ...document, actorTracks: [{ actorId: 'coach-1', segments: [segment()] }] })
    ).toContain('coach-on-ice');
  });

  it('refuses to pass to a coach', () => {
    const document = withCoach();
    expect(
      codes({
        ...document,
        puckTracks: [{ ...document.puckTracks[0], actions: [pass({ toActorId: 'coach-1' })] }],
      })
    ).toContain('coach-on-ice');
  });

  it('allows a coach to START a puck, which is the whole point', () => {
    const document = withCoach();
    const result = validateV3Document({
      ...document,
      puckTracks: [
        {
          ...document.puckTracks[0],
          initialSource: { kind: 'coach', actorId: 'coach-1' },
        },
      ],
    });
    expect(result.errors.filter(problem => problem.code === 'coach-on-ice')).toEqual([]);
  });
});

// ----------------------------------------------------------------------------

describe('timing', () => {
  it('catches a puck leaving before the previous action arrives', () => {
    const document = base();
    expect(
      codes({
        ...document,
        puckTracks: [
          {
            ...document.puckTracks[0],
            actions: [
              pass({ id: 'a', releaseAt: 1, arrivalAt: 5 }),
              pass({ id: 'b', releaseAt: 2, arrivalAt: 6 }),
            ],
          },
        ],
      })
    ).toContain('action-out-of-order');
  });

  it('warns when an action is timed outside its own phase', () => {
    const document = base();
    const result = validateV3Document({
      ...document,
      puckTracks: [
        {
          ...document.puckTracks[0],
          actions: [pass({ releaseAt: 999, arrivalAt: 1000 })],
        },
      ],
    });
    expect(result.warnings.map(problem => problem.code)).toContain('action-outside-phase');
  });

  it('accepts back-to-back actions that touch exactly', () => {
    const document = base();
    const result = validateV3Document({
      ...document,
      puckTracks: [
        {
          ...document.puckTracks[0],
          actions: [
            pass({ id: 'a', releaseAt: 1, arrivalAt: 2 }),
            pass({ id: 'b', releaseAt: 2, arrivalAt: 3 }),
          ],
        },
      ],
    });
    expect(result.errors.map(problem => problem.code)).not.toContain('action-out-of-order');
  });
});

// ----------------------------------------------------------------------------

describe('warnings are not failures', () => {
  it('warns about a phase where nothing happens', () => {
    const document = base();
    const result = validateV3Document({
      ...document,
      phases: [
        ...document.phases,
        {
          id: 'phase-empty',
          label: 'Nothing',
          order: 1,
          startAtSeconds: 8,
          durationSeconds: 4,
          repeatCount: 1,
          finishPolicy: 'none',
        },
      ],
    });

    expect(result.warnings.map(problem => problem.code)).toContain('empty-phase');
    expect(result.valid).toBe(true);
  });

  it('warns about a drill with nobody on the ice', () => {
    const result = validateV3Document({ ...base(), actors: [], actorTracks: [], puckTracks: [] });
    expect(result.warnings.map(problem => problem.code)).toContain('no-actors');
  });

  it('warns about a puck nobody ever touches', () => {
    const document = base();
    const result = validateV3Document({
      ...document,
      puckTracks: [{ ...document.puckTracks[0], actions: [] }],
    });
    expect(result.warnings.map(problem => problem.code)).toContain('untouched-puck');
  });

  it('separates errors from warnings', () => {
    const result = validateV3Document(base());
    expect(result.errors.every(problem => problem.level === 'error')).toBe(true);
    expect(result.warnings.every(problem => problem.level === 'warning')).toBe(true);
    expect(result.problems).toHaveLength(result.errors.length + result.warnings.length);
  });
});

// ============================================================================
// LINE SHAPE AND CONTROL POINTS
//
// Adjusting a line AFTER the play is set up: moving, adding and removing its
// control points, and switching between a curve and straight segments.
//
// The behaviour these lock down:
//   - moving one handle moves ONLY that point (the old code replaced the whole
//     route with a five-point smooth, so adjusting a route destroyed it)
//   - a puck line's waypoints are simulated, so bending one re-times its
//     arrival - the puck keeps the speed it was authored at over a longer path
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestHarness, toasted, type TestHarness } from '@/test/commandHost';
import { buildDrill, buildPlayer } from '@/test/builders';
import { RINK } from '@/core/constants';
import { MAX_COMFORTABLE_CONTROLS, ROUTE_CONTROL_TARGET, expandCurve, polylineLength } from '@/utils/curves';
import { measureFlight } from '@/sim/flightPath';

let harness: TestHarness;

const ROUTE_POINTS = [
  { x: 300, y: 200 },
  { x: 400, y: 160 },
  { x: 500, y: 240 },
];

function drillWithRoute() {
  return buildDrill({
    players: [
      buildPlayer({ id: 'h11', number: '11', hasPuck: true, x: 300, y: 200 }),
      buildPlayer({ id: 'h13', number: '13', x: 600, y: 200 }),
    ],
    skatePaths: [
      { id: 'r1', ownerId: 'h11', team: 'home', mode: 'skate', finish: 'stop', points: ROUTE_POINTS },
    ],
  });
}

beforeEach(() => {
  harness = createTestHarness();
  harness.loadDrill(drillWithRoute());
});

const route = () => harness.getState().drill.skatePaths[0];

// ----------------------------------------------------------------------------
// Route control points
// ----------------------------------------------------------------------------

describe('moveRouteControl', () => {
  it('moves exactly the point that was grabbed', () => {
    const result = harness.commands.moveRouteControl('r1', 1, { x: 420, y: 120 });

    expect(result.status).toBe('done');
    expect(route().points).toHaveLength(3);
    expect(route().points[1]).toEqual({ x: 420, y: 120 });
    // The neighbours are untouched. This is the regression: dragging a handle
    // used to rebuild the entire route from five resampled proxies.
    expect(route().points[0]).toEqual(ROUTE_POINTS[0]);
    expect(route().points[2]).toEqual(ROUTE_POINTS[2]);
  });

  it('refuses to move the start, which is pinned to the player', () => {
    expect(harness.commands.moveRouteControl('r1', 0, { x: 1, y: 1 }).status).toBe('rejected');
    expect(route().points[0]).toEqual(ROUTE_POINTS[0]);
  });

  it('rejects an index that does not exist', () => {
    expect(harness.commands.moveRouteControl('r1', 99, { x: 1, y: 1 }).status).toBe('rejected');
  });

  it('rejects a route that is gone', () => {
    expect(harness.commands.moveRouteControl('ghost', 1, { x: 1, y: 1 }).status).toBe('rejected');
  });

  it('clamps the point to the rink', () => {
    harness.commands.moveRouteControl('r1', 1, { x: 99_999, y: 99_999 });
    expect(route().points[1].x).toBeLessThanOrEqual(RINK.x + RINK.width);
    expect(route().points[1].y).toBeLessThanOrEqual(RINK.y + RINK.height);
  });

  it('does not record an undo entry per drag frame', () => {
    const before = harness.getState().undoStack.length;
    for (let step = 0; step < 20; step++) {
      harness.commands.moveRouteControl('r1', 1, { x: 420 + step, y: 120 });
    }
    expect(harness.getState().undoStack).toHaveLength(before);
  });
});

describe('insertRouteControl', () => {
  it('adds a point between two others and is undoable as one step', () => {
    const result = harness.commands.insertRouteControl('r1', 2, { x: 460, y: 190 });

    expect(result.status).toBe('done');
    expect(route().points).toHaveLength(4);
    expect(route().points[2]).toEqual({ x: 460, y: 190 });

    harness.commands.undo();
    expect(route().points).toHaveLength(3);
  });

  it('never inserts before the start or after the end', () => {
    harness.commands.insertRouteControl('r1', 0, { x: 9, y: 9 });
    expect(route().points[0]).toEqual(ROUTE_POINTS[0]);

    harness.commands.insertRouteControl('r1', 99, { x: 9, y: 9 });
    expect(route().points.at(-1)).toEqual(ROUTE_POINTS[2]);
  });
});

describe('removeRouteControl', () => {
  it('removes a point and is undoable', () => {
    expect(harness.commands.removeRouteControl('r1', 1).status).toBe('done');
    expect(route().points).toEqual([ROUTE_POINTS[0], ROUTE_POINTS[2]]);

    harness.commands.undo();
    expect(route().points).toHaveLength(3);
  });

  it('refuses to remove the starting point', () => {
    expect(harness.commands.removeRouteControl('r1', 0).status).toBe('rejected');
  });

  it('refuses to leave fewer than two points, and says why', () => {
    harness.commands.removeRouteControl('r1', 1);
    const result = harness.commands.removeRouteControl('r1', 1);

    expect(result.status).toBe('rejected');
    expect(toasted(harness, 'A route needs at least two points')).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Route shape
// ----------------------------------------------------------------------------

describe('setRouteShape', () => {
  it('switches to straight segments and back', () => {
    expect(harness.commands.setRouteShape('r1', 'polyline').status).toBe('done');
    expect(route().shape).toBe('polyline');

    harness.commands.setRouteShape('r1', 'spline');
    expect(route().shape).toBe('spline');
  });

  it('says what changed', () => {
    harness.commands.setRouteShape('r1', 'polyline');
    expect(toasted(harness, 'runs straight between its points')).toBe(true);
  });

  it('is a no-op when the shape is already that', () => {
    const before = harness.getState().documentRevision;
    expect(harness.commands.setRouteShape('r1', 'spline').status).toBe('done');
    expect(harness.getState().documentRevision).toBe(before);
  });

  it('actually changes the geometry the skater follows', () => {
    const curved = expandCurve(route().points, 'spline');
    harness.commands.setRouteShape('r1', 'polyline');
    const straight = expandCurve(route().points, 'polyline');

    expect(straight).toHaveLength(3);
    expect(curved.length).toBeGreaterThan(10);
  });

  it('rejects a route that is gone', () => {
    expect(harness.commands.setRouteShape('ghost', 'polyline').status).toBe('rejected');
  });
});

describe('simplifyRoute', () => {
  it('reduces a legacy dense route to editable points', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h11', hasPuck: true, x: 300, y: 200 })],
        skatePaths: [
          {
            id: 'dense',
            ownerId: 'h11',
            team: 'home',
            mode: 'skate',
            finish: 'stop',
            points: Array.from({ length: 50 }, (_, index) => ({ x: 300 + index * 5, y: 200 })),
          },
        ],
      })
    );

    expect(harness.commands.simplifyRoute('dense').status).toBe('done');
    expect(route().points).toHaveLength(ROUTE_CONTROL_TARGET);
    expect(toasted(harness, /50 points to 10 editable/)).toBe(true);
  });

  it('declines when the route is already handleable', () => {
    const result = harness.commands.simplifyRoute('r1');
    expect(result.status).toBe('rejected');
    expect(route().points.length).toBeLessThanOrEqual(MAX_COMFORTABLE_CONTROLS);
  });
});

// ----------------------------------------------------------------------------
// Puck-line waypoints
// ----------------------------------------------------------------------------

describe('puck line waypoints', () => {
  const event = () => harness.getState().drill.events[0];

  beforeEach(() => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', hasPuck: true, x: 200, y: 212 }),
          buildPlayer({ id: 'h13', number: '13', x: 800, y: 212 }),
        ],
        events: [
          {
            id: 'p1',
            type: 'pass',
            fromPlayerId: 'h11',
            toPlayerId: 'h13',
            fromPoint: { x: 200, y: 212 },
            toPoint: { x: 800, y: 212 },
            team: 'home',
            at: 0.2,
            arrivalAt: 0.4,
          },
        ],
      })
    );
  });

  it('adds a bend point, and the drawn line genuinely gets longer', () => {
    const straight = measureFlight({ x: 200, y: 212 }, [], { x: 800, y: 212 });

    expect(harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 60 }).status).toBe('done');
    expect(event().waypoints).toEqual([{ x: 500, y: 60 }]);

    const bent = measureFlight({ x: 200, y: 212 }, event().waypoints!, { x: 800, y: 212 });
    expect(bent).toBeGreaterThan(straight);
  });

  it('re-times the arrival so the puck keeps its authored speed', () => {
    const before = event().arrivalAt!;
    harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 60 });
    const after = event().arrivalAt!;

    // A longer path at the same speed takes longer to arrive.
    expect(after).toBeGreaterThan(before);

    // And by roughly the right amount: the flight window scales with length.
    const straight = measureFlight({ x: 200, y: 212 }, [], { x: 800, y: 212 });
    const bent = measureFlight({ x: 200, y: 212 }, event().waypoints!, { x: 800, y: 212 });
    const expected = 0.2 + (before - 0.2) * (bent / straight);
    expect(after).toBeCloseTo(Math.min(1, expected), 5);
  });

  it('re-times again when a bend point is dragged further out', () => {
    harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 150 });
    const modest = event().arrivalAt!;

    harness.commands.moveEventWaypoint('p1', 0, { x: 500, y: 40 });
    expect(event().arrivalAt!).toBeGreaterThan(modest);
  });

  it('re-times back when the bend is removed', () => {
    const before = event().arrivalAt!;
    harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 60 });
    harness.commands.removeEventWaypoint('p1', 0);

    expect(event().waypoints).toEqual([]);
    expect(event().arrivalAt!).toBeCloseTo(before, 4);
  });

  it('never lets a bent line arrive after the drill ends', () => {
    harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 20 });
    harness.commands.moveEventWaypoint('p1', 0, { x: 500, y: RINK.y + 20 });
    expect(event().arrivalAt!).toBeLessThanOrEqual(1);
  });

  it('clamps a bend point to the rink', () => {
    harness.commands.insertEventWaypoint('p1', 0, { x: 99_999, y: -99_999 });
    const waypoint = event().waypoints![0];
    expect(waypoint.x).toBeLessThanOrEqual(RINK.x + RINK.width);
    expect(waypoint.y).toBeGreaterThanOrEqual(RINK.y);
  });

  it('inserting and removing are each one undo step', () => {
    harness.commands.insertEventWaypoint('p1', 0, { x: 500, y: 60 });
    harness.commands.undo();
    expect(event().waypoints ?? []).toEqual([]);
  });

  it('rejects a waypoint index that does not exist', () => {
    expect(harness.commands.moveEventWaypoint('p1', 0, { x: 1, y: 1 }).status).toBe('rejected');
    expect(harness.commands.removeEventWaypoint('p1', 5).status).toBe('rejected');
  });

  it('rejects an event that is gone', () => {
    expect(harness.commands.insertEventWaypoint('ghost', 0, { x: 1, y: 1 }).status).toBe('rejected');
    expect(harness.commands.setEventShape('ghost', 'polyline').status).toBe('rejected');
  });

  it('refuses to bend a line past the waypoint limit', () => {
    for (let index = 0; index < 50; index++) {
      harness.commands.insertEventWaypoint('p1', index, { x: 300 + index * 5, y: 150 });
    }
    const result = harness.commands.insertEventWaypoint('p1', 0, { x: 400, y: 100 });

    expect(result.status).toBe('rejected');
    expect(toasted(harness, /at most 50 points/)).toBe(true);
  });
});

describe('setEventShape', () => {
  beforeEach(() => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', hasPuck: true, x: 200, y: 212 }),
          buildPlayer({ id: 'h13', number: '13', x: 800, y: 212 }),
        ],
        events: [
          {
            id: 'p1',
            type: 'pass',
            fromPlayerId: 'h11',
            toPlayerId: 'h13',
            fromPoint: { x: 200, y: 212 },
            toPoint: { x: 800, y: 212 },
            team: 'home',
            at: 0.2,
            arrivalAt: 0.4,
            waypoints: [
              { x: 400, y: 100 },
              { x: 600, y: 320 },
            ],
          },
        ],
      })
    );
  });

  it('changes the flight geometry, and re-times for the new length', () => {
    const event = () => harness.getState().drill.events[0];
    const curvedLength = measureFlight(event().fromPoint, event().waypoints!, event().toPoint, 'spline');
    const curvedArrival = event().arrivalAt!;

    harness.commands.setEventShape('p1', 'polyline');

    const straightLength = measureFlight(
      event().fromPoint,
      event().waypoints!,
      event().toPoint,
      'polyline'
    );
    // A curve through the same points is longer than the cornered path.
    expect(straightLength).toBeLessThan(curvedLength);
    expect(event().arrivalAt!).toBeLessThan(curvedArrival);
  });

  it('says what changed', () => {
    harness.commands.setEventShape('p1', 'polyline');
    expect(toasted(harness, 'runs straight between its points')).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// A drawn route becomes editable control points
// ----------------------------------------------------------------------------

describe('commitRoute', () => {
  it('turns hundreds of raw samples into a handful of grabbable points', () => {
    harness.loadDrill(
      buildDrill({ players: [buildPlayer({ id: 'h11', hasPuck: true, x: 300, y: 200 })] })
    );

    const raw = Array.from({ length: 300 }, (_, index) => ({
      x: 300 + index * 2,
      y: 200 + Math.sin(index / 30) * 40,
    }));
    harness.commands.commitRoute('h11', raw);

    const stored = harness.getState().drill.skatePaths[0];
    expect(stored.points).toHaveLength(ROUTE_CONTROL_TARGET);
    expect(stored.points.length).toBeLessThanOrEqual(MAX_COMFORTABLE_CONTROLS);
  });

  it('keeps the drawn shape closely enough to be honest', () => {
    harness.loadDrill(
      buildDrill({ players: [buildPlayer({ id: 'h11', hasPuck: true, x: 300, y: 200 })] })
    );

    const raw = Array.from({ length: 200 }, (_, index) => ({ x: 300 + index * 2, y: 200 }));
    harness.commands.commitRoute('h11', raw);

    const stored = harness.getState().drill.skatePaths[0];
    const line = expandCurve(stored.points, stored.shape ?? 'spline');
    // A straight drag stays a straight line of about the same length.
    expect(polylineLength(line)).toBeCloseTo(398, 0);
  });
});

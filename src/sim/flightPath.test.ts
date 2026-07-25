// ============================================================================
// PUCK FLIGHT PATH
//
// The claim this exists to make true: the line drawn for a pass or shot IS the
// path the puck takes.
//
// Before this, `via` shaped only the drawing and `solvePassInterception` flew
// the puck straight to the receiver's blade - so a bent line was a diagram
// annotation that the simulation ignored, while the event inspector described
// it as "the exact puck trajectory".
// ============================================================================

import { describe, it, expect } from 'vitest';
import { flightControls, getFlightPath, measureFlight, puckAlongFlight } from './flightPath';
import { compileDrill } from './compileDrill';
import { sampleFrame } from './sampleFrame';
import { buildDrill, buildPlayer } from '@/test/builders';
import type { DrillEvent, Point } from '@/core/types';

const FROM: Point = { x: 200, y: 212 };
const TO: Point = { x: 800, y: 212 };

function passEvent(overrides: Partial<DrillEvent> = {}): DrillEvent {
  return {
    id: 'p1',
    type: 'pass',
    fromPlayerId: 'h11',
    toPlayerId: 'h13',
    fromPoint: FROM,
    toPoint: TO,
    team: 'home',
    at: 0.2,
    arrivalAt: 0.6,
    ...overrides,
  } as DrillEvent;
}

describe('flightControls', () => {
  it('is release, waypoints, destination', () => {
    const event = passEvent({ waypoints: [{ x: 500, y: 100 }] });
    expect(flightControls(event, FROM, TO)).toEqual([FROM, { x: 500, y: 100 }, TO]);
  });

  it('is a straight two-point line when nothing is bent', () => {
    expect(flightControls(passEvent(), FROM, TO)).toEqual([FROM, TO]);
  });

  it('uses the endpoints it is given, not the stored ones', () => {
    // A pass leaves the passer's blade and lands on the receiver's, wherever
    // their routes have taken them by then.
    const moved = { x: 250, y: 300 };
    expect(flightControls(passEvent(), moved, TO)[0]).toEqual(moved);
  });
});

describe('getFlightPath', () => {
  it('is a straight segment with no waypoints', () => {
    const flight = getFlightPath(passEvent(), FROM, TO);
    expect(flight.points).toEqual([FROM, TO]);
    expect(flight.length).toBe(600);
  });

  it('is longer once the line is bent', () => {
    const flight = getFlightPath(passEvent({ waypoints: [{ x: 500, y: 60 }] }), FROM, TO);
    expect(flight.length).toBeGreaterThan(600);
  });

  it('passes through the waypoint the author placed', () => {
    const waypoint = { x: 500, y: 60 };
    const flight = getFlightPath(passEvent({ waypoints: [waypoint] }), FROM, TO);
    const nearest = Math.min(
      ...flight.points.map(point => Math.hypot(point.x - waypoint.x, point.y - waypoint.y))
    );
    expect(nearest).toBeLessThan(0.5);
  });

  it('keeps sharp corners for a polyline', () => {
    const flight = getFlightPath(
      passEvent({ waypoints: [{ x: 500, y: 60 }], shape: 'polyline' }),
      FROM,
      TO
    );
    expect(flight.points).toEqual([FROM, { x: 500, y: 60 }, TO]);
  });

  it('is memoized per event and endpoints', () => {
    const event = passEvent({ waypoints: [{ x: 500, y: 60 }] });
    expect(getFlightPath(event, FROM, TO)).toBe(getFlightPath(event, FROM, TO));
  });

  it('recomputes when an endpoint moves', () => {
    const event = passEvent({ waypoints: [{ x: 500, y: 60 }] });
    const first = getFlightPath(event, FROM, TO);
    const second = getFlightPath(event, FROM, { x: 820, y: 212 });
    expect(second).not.toBe(first);
    expect(second.length).not.toBe(first.length);
  });
});

describe('puckAlongFlight', () => {
  it('walks the curve rather than cutting across it', () => {
    const flight = getFlightPath(passEvent({ waypoints: [{ x: 500, y: 60 }] }), FROM, TO);
    const midway = puckAlongFlight(flight, 0.5);

    // Halfway along a line bent upward is well above the straight chord.
    expect(midway.position.y).toBeLessThan(180);
  });

  it('starts at the release point and ends at the destination', () => {
    const flight = getFlightPath(passEvent({ waypoints: [{ x: 500, y: 60 }] }), FROM, TO);
    expect(puckAlongFlight(flight, 0).position.x).toBeCloseTo(FROM.x, 6);
    expect(puckAlongFlight(flight, 0).position.y).toBeCloseTo(FROM.y, 6);
    expect(puckAlongFlight(flight, 1).position.x).toBeCloseTo(TO.x, 6);
    expect(puckAlongFlight(flight, 1).position.y).toBeCloseTo(TO.y, 6);
  });

  it('clamps outside 0..1', () => {
    const flight = getFlightPath(passEvent(), FROM, TO);
    expect(puckAlongFlight(flight, -1).position).toEqual(FROM);
    expect(puckAlongFlight(flight, 5).position).toEqual(TO);
  });
});

describe('measureFlight', () => {
  it('measures the straight case exactly', () => {
    expect(measureFlight(FROM, [], TO)).toBe(600);
  });

  it('charges for the detour a bend adds', () => {
    expect(measureFlight(FROM, [{ x: 500, y: 60 }], TO)).toBeGreaterThan(600);
  });

  it('a curve through the same points is longer than the cornered path', () => {
    const waypoints = [
      { x: 400, y: 100 },
      { x: 600, y: 320 },
    ];
    expect(measureFlight(FROM, waypoints, TO, 'spline')).toBeGreaterThan(
      measureFlight(FROM, waypoints, TO, 'polyline')
    );
  });
});

// ----------------------------------------------------------------------------
// End to end through the simulation
// ----------------------------------------------------------------------------

describe('the simulated puck follows the drawn line', () => {
  function drillWithPass(waypoints?: Point[]) {
    return buildDrill({
      players: [
        buildPlayer({ id: 'h11', number: '11', hasPuck: true, x: 200, y: 212 }),
        buildPlayer({ id: 'h13', number: '13', x: 800, y: 212 }),
      ],
      events: [passEvent(waypoints ? { waypoints } : {})],
    });
  }

  /** Where the puck actually is, mid-flight, according to the engine. */
  function puckMidFlight(waypoints?: Point[], atSeconds = 3.2) {
    const compiled = compileDrill(drillWithPass(waypoints));
    // The pass runs from 0.2 to 0.6 of an 8s drill: 1.6s to 4.8s.
    return sampleFrame(compiled, atSeconds).puck;
  }

  /** How far the middle sample sits off the line joining the outer two. */
  function crossTrackDeviation(waypoints?: Point[]): number {
    const a = puckMidFlight(waypoints, 2.0)!;
    const b = puckMidFlight(waypoints, 3.2)!;
    const c = puckMidFlight(waypoints, 4.4)!;

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    return Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / length;
  }

  it('flies straight when the line is straight', () => {
    const puck = puckMidFlight();
    expect(puck?.state).toBe('in_flight');
    // Three samples of a straight flight are collinear. The endpoints are the
    // passer's and receiver's blades, not the stored points, so this is
    // expressed as collinearity rather than a fixed coordinate.
    expect(crossTrackDeviation()).toBeLessThan(1);
  });

  it('bows away from the chord when the line is bent', () => {
    expect(crossTrackDeviation([{ x: 500, y: 60 }])).toBeGreaterThan(20);
  });

  it('flies ABOVE the chord when the line is bent upward', () => {
    const straight = puckMidFlight();
    const bent = puckMidFlight([{ x: 500, y: 60 }]);

    expect(bent?.state).toBe('in_flight');
    // This is the assertion the old implementation could not pass: `via` was
    // never consulted by the simulation, so both pucks flew the same line.
    expect(bent!.y).toBeLessThan(straight!.y - 50);
  });

  it('gives the puck a velocity along the curve, not toward the target', () => {
    const bent = puckMidFlight([{ x: 500, y: 60 }]);
    // Past the apex of an upward bend the puck is heading back down.
    expect(bent!.velocity!.y).toBeGreaterThan(0);
    expect(bent!.velocity!.x).toBeGreaterThan(0);
  });

  it('moves the puck faster along a longer path in the same time window', () => {
    const straightSpeed = (() => {
      const puck = puckMidFlight();
      return Math.hypot(puck!.velocity!.x, puck!.velocity!.y);
    })();
    const bentSpeed = (() => {
      const puck = puckMidFlight([{ x: 500, y: 60 }]);
      return Math.hypot(puck!.velocity!.x, puck!.velocity!.y);
    })();

    // Same authored flight window, longer path: the engine reports the higher
    // speed honestly. The command layer is what widens the window so a coach
    // does not get a teleporting puck.
    expect(bentSpeed).toBeGreaterThan(straightSpeed);
  });
});

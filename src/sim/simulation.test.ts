import { describe, expect, it } from 'vitest';
import { FT, RINK } from '@/core/constants';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';
import { compileDrill } from './compileDrill';
import { sampleFrame, getCompiledEventEndpoints } from './sampleFrame';
import { solveLoosePuck } from './puckSolver';
import { isInsideRink } from './collision/rinkGeometry';
import { migrateDrill } from '@/storage/migrations';
import { nextLifecycle } from '@/engine/drillLifecycle';
import { validateDrillMechanics } from '@/engine/drillValidation';

describe('deterministic hockey simulation', () => {
  it('accelerates, cruises, and stops each skater from route distance', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const early = sampleFrame(compiled, 0.25).players.p13;
    const middle = sampleFrame(compiled, 1.5).players.p13;
    const finished = sampleFrame(compiled, 8).players.p13;

    expect(early.speed).toBeGreaterThan(0);
    expect(middle.speed).toBeGreaterThan(early.speed);
    expect(middle.speed).toBeLessThanOrEqual(compiled.config.maxForwardSpeed);
    expect(finished.speed).toBe(0);
    expect(finished.routeProgress).toBe(1);
  });

  it('does not force different route lengths to finish together', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const frame = sampleFrame(compiled, 3);
    expect(frame.players.p11.routeProgress).toBe(1);
    expect(frame.players.p13.routeProgress).toBeLessThan(1);
  });

  it('samples the same absolute time identically at any presentation rate', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const direct = sampleFrame(compiled, 3.2);
    for (const hz of [30, 60, 120, 144]) {
      // Presentation may request any number of intermediate frames; sampling
      // the same final simulation timestamp must remain identical.
      for (let frame = 0; frame < Math.floor(3.2 * hz); frame++) {
        sampleFrame(compiled, frame / hz);
      }
      const sampled = sampleFrame(compiled, 3.2);
      expect(sampled.players.p13.position.x).toBeCloseTo(direct.players.p13.position.x, 8);
      expect(sampled.puck?.x).toBeCloseTo(direct.puck?.x ?? 0, 8);
    }
  });

  it('resolves a pass at the receiver blade and keeps possession after arrival', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const pass = compiled.events[0];
    const endpoints = getCompiledEventEndpoints(compiled, pass);
    const atArrival = sampleFrame(compiled, pass.arrivalSeconds);
    const afterArrival = sampleFrame(compiled, pass.arrivalSeconds + 1);

    expect(endpoints.to.x).toBeCloseTo(atArrival.players.p13.bladePosition.x, 6);
    expect(endpoints.to.y).toBeCloseTo(atArrival.players.p13.bladePosition.y, 6);
    expect(atArrival.puck?.carrierId).toBe('p13');
    expect(afterArrival.puck?.carrierId).toBe('p13');
    expect(afterArrival.puck?.x).toBeCloseTo(afterArrival.players.p13.bladePosition.x, 6);
  });

  it('releases a shot once and retains a successful review result', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const shot = compiled.events[1];
    const inFlight = sampleFrame(compiled, (shot.departureSeconds + shot.arrivalSeconds) / 2);
    const complete = sampleFrame(compiled, compiled.durationSeconds);

    expect(inFlight.puck?.state).toBe('shot');
    expect(complete.puck?.state).toBe('dead');
    expect(complete.puck?.result).toBe('goal');
    expect(complete.lifecycle).toBe('success');
  });

  it('keeps loose pucks inside rounded rink geometry and removes energy', () => {
    const compiled = compileDrill(giveAndGoRegressionDrill);
    const result = solveLoosePuck(
      { x: RINK.centerX, y: 2 * FT },
      { x: 70 * FT, y: -24 * FT },
      6,
      compiled.config
    );
    expect(isInsideRink(result.position, compiled.config.puckRadius - 0.001)).toBe(true);
    expect(result.collisions).toBeGreaterThan(0);
    expect(Math.hypot(result.velocity.x, result.velocity.y)).toBeLessThan(Math.hypot(70 * FT, 24 * FT));
  });
});

describe('schema, lifecycle, and validation', () => {
  it('migrates legacy drills without changing IDs or puck ownership', () => {
    const legacy = structuredClone(giveAndGoRegressionDrill);
    delete legacy.schemaVersion;
    delete legacy.settings;
    legacy.players = legacy.players.map(player => ({ ...player, visual: undefined }));
    const migrated = migrateDrill(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.players.map(player => player.id)).toEqual(['p11', 'p13', 'g1']);
    expect(migrated.players.filter(player => player.hasPuck)).toHaveLength(1);
    expect(migrated.settings?.assistance).toBe('standard');
  });

  it('moves through active, success, review, and reset without duplicate transitions', () => {
    expect(nextLifecycle('ready', 'start')).toBe('active');
    expect(nextLifecycle('active', 'succeed')).toBe('success');
    expect(nextLifecycle('success', 'succeed')).toBe('success');
    expect(nextLifecycle('success', 'finish-review')).toBe('review');
    expect(nextLifecycle('review', 'reset')).toBe('ready');
  });

  it('reports overlapping puck events as blocking errors', () => {
    const invalid = structuredClone(giveAndGoRegressionDrill);
    invalid.events[1].at = 0.35;
    const issues = validateDrillMechanics(invalid);
    expect(issues.some(issue => issue.severity === 'error' && issue.eventId === 'shot-13')).toBe(true);
  });
});

describe('five-man corner retrieval drill', () => {
  it('executes coach dump, retrieval, two catches, and a goal in order', () => {
    const compiled = compileDrill(fiveManCornerRetrievalDrill);

    expect(sampleFrame(compiled, 0.1).puck?.carrierId).toBe('coach');
    expect(sampleFrame(compiled, 4.9).puck?.carrierId).toBe('p21');
    expect(sampleFrame(compiled, 6.1).puck?.carrierId).toBe('p19');
    expect(sampleFrame(compiled, 7.2).puck?.carrierId).toBe('p17');

    const finish = sampleFrame(compiled, 10);
    expect(finish.puck?.result).toBe('goal');
    expect(finish.lifecycle).toBe('success');
  });
});

describe.each([
  {
    name: 'cross-corner attack',
    drill: fiveManCrossCornerDrill,
    possession: [
      [0.1, 'coach'],
      [4.9, 'p17'],
      [6.1, 'p21'],
      [7.2, 'p19'],
    ] as const,
    finishAt: 10,
  },
  {
    name: 'full-ice criss-cross point shot',
    drill: fiveManLowHighDrill,
    possession: [
      [0.1, 'coach'],
      [12.2, 'p21'],
      [13.5, 'p6'],
      [15, 'p19'],
    ] as const,
    finishAt: 18,
  },
])('five-man $name drill', ({ drill, possession, finishAt }) => {
  it('completes the authored puck chain and scores', () => {
    const compiled = compileDrill(drill);

    possession.forEach(([time, carrierId]) => {
      expect(sampleFrame(compiled, time).puck?.carrierId).toBe(carrierId);
    });

    const finish = sampleFrame(compiled, finishAt);
    expect(finish.puck?.result).toBe('goal');
    expect(finish.lifecycle).toBe('success');
  });
});

describe('full-ice criss-cross route design', () => {
  it('starts all five skaters at the far end and crosses each route through both lanes', () => {
    const skaterIds = ['p17', 'p19', 'p21', 'p4', 'p6'];
    const skaters = fiveManLowHighDrill.players.filter(player => skaterIds.includes(player.id));

    expect(skaters).toHaveLength(5);
    expect(skaters.every(player => player.x <= 32 * FT)).toBe(true);
    for (const playerId of skaterIds) {
      const route = fiveManLowHighDrill.skatePaths.find(path => path.ownerId === playerId);
      expect(route).toBeDefined();
      expect(route?.points.some(point => point.y < RINK.centerY)).toBe(true);
      expect(route?.points.some(point => point.y > RINK.centerY)).toBe(true);
      const endpoint = route!.points[route!.points.length - 1];
      expect(endpoint.x).toBeGreaterThan(RINK.blueLineRightX);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { SHOWCASE_PRESET } from './showcase';
import { buildDrill } from '@/test/builders';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame, getCompiledEventEndpoints } from '@/sim/sampleFrame';
import { evaluateReception } from '@/sim/receptionSolver';
import { isInsideRink, distance } from '@/utils/geometry';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { parseDrillDocumentV3 } from '@/domain/v3/schema';
import { migrateDrillCandidate, remapImportedDrill } from '@/persistence/drillPipeline';

function showcase() {
  const players = SHOWCASE_PRESET.players();
  return buildDrill({
    players, initialPuck: SHOWCASE_PRESET.initialPuck,
    ...SHOWCASE_PRESET.sequence!(players),
    settings: { assistance: 'off', recovery: 'authored', timeLimitSeconds: 8, reducedEffects: false, ...SHOWCASE_PRESET.settings },
  });
}

describe('guided faceoff showcase', () => {
  it('has bounded positions, fresh identities and a reachable faceoff pickup at the real dot', () => {
    const drill = showcase();
    expect(drill.initialPuck).toEqual({ x: 845, y: 322.5 });
    expect(SHOWCASE_PRESET.subtitle).toMatch(/planned save/);
    expect(drill.players).toHaveLength(5);
    const next = showcase();
    expect(drill.players.every(player => !next.players.some(other => other.id === player.id))).toBe(true);
    expect(drill.events.every(event => !next.events.some(other => other.id === event.id))).toBe(true);
    for (const player of drill.players) expect(isInsideRink(player, 18)).toBe(true);
    for (const route of drill.skatePaths) for (const point of route.points) expect(isInsideRink(point, 18)).toBe(true);
    const compiled = compileDrill(drill);
    const hold = sampleFrame(compiled, 0.5);
    expect(hold.puck?.state).toBe('loose');
    expect(Object.values(hold.players).every(player => player.speed === 0)).toBe(true);
    const pickup = sampleFrame(compiled, 0.75);
    const centre = pickup.players[drill.events[0].fromPlayerId];
    expect(distance(centre.bladePosition, drill.initialPuck!)).toBeLessThan(0.001);
    expect(pickup.eventExecutions[0].outcome).toBe('recovered');
    expect(centre.action).toBe('recover');
    expect(centre.actionPhase).toBeCloseTo(0.5);
  });

  it('completes both unforced catches in stride, then the planned shot and goalie reaction', () => {
    const drill = showcase();
    const compiled = compileDrill(drill);
    for (const event of compiled.events) {
      if (event.source.type !== 'pass') continue;
      expect(event.source.catchResult).toBeUndefined();
      const frame = sampleFrame(compiled, event.arrivalSeconds);
      const receiver = frame.players[event.source.toPlayerId];
      const { from, to } = getCompiledEventEndpoints(compiled, event);
      const flight = event.arrivalSeconds - event.departureSeconds;
      const catchQuality = evaluateReception(event.source, to, { x: (to.x - from.x) / flight, y: (to.y - from.y) / flight }, receiver, compiled.config);
      expect(catchQuality.caught).toBe(true);
      expect(catchQuality.quality).toBe('good');
      expect(catchQuality.gap).toBeLessThan(0.001);
      expect(catchQuality.relativeSpeed).toBeLessThan(compiled.config.catchSpeed);
      expect(receiver.speed).toBeGreaterThan(20);
      expect(receiver.action).toBe('receive');
      expect(receiver.actionPhase).toBeCloseTo(0.5);
    }
    const shot = compiled.events[3];
    expect(sampleFrame(compiled, shot.departureSeconds).players[shot.source.fromPlayerId].action).toBe('shot');
    const arrival = sampleFrame(compiled, shot.arrivalSeconds);
    expect(Object.values(arrival.players).find(player => player.goalieAction === 'save')?.actionPhase).toBeCloseTo(0.5);
    const end = sampleFrame(compiled, 8);
    expect(end.eventExecutions.map(event => event.status)).toEqual(['completed', 'completed', 'completed', 'completed']);
    expect(end.eventExecutions.map(event => event.outcome)).toEqual(['recovered', 'caught', 'caught', 'save']);
  });

  it('preserves delayed starts and outcomes through JSON schema storage and editor projection', () => {
    const drill = showcase();
    const parsed = parseDrillDocumentV3(JSON.parse(JSON.stringify(migrateV2ToV3(drill))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.message);
    const restored = projectToV2(parsed.document).drill;
    expect(restored.skatePaths.map(path => path.startAtSeconds)).toEqual([1, 2, 3.5]);
    const before = sampleFrame(compileDrill(drill), 8);
    const after = sampleFrame(compileDrill(restored), 8);
    expect(after.eventExecutions).toEqual(before.eventExecutions);
    expect(after.puck).toEqual(before.puck);
    const sanitized = migrateDrillCandidate(JSON.parse(JSON.stringify(drill))).drill;
    expect(sanitized.skatePaths.map(path => path.startAtSeconds)).toEqual([1, 2, 3.5]);
    let id = 0;
    const copy = remapImportedDrill(drill, () => `copied-${id++}`);
    expect(sampleFrame(compileDrill(copy), 8).eventExecutions.map(event => event.outcome)).toEqual(['recovered', 'caught', 'caught', 'save']);
  });
});

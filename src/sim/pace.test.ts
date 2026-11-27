import { describe, expect, it } from 'vitest';
import { FT } from '@/core/constants';
import type { Drill, PlaybackPace, Player, SkatePath } from '@/core/types';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { mergeEditedIntoStored as mergeEditedV2 } from '@/domain/v3/mergeEditedV2';
import { compileDrill } from './compileDrill';
import { sampleFrame } from './sampleFrame';
import { getMechanicsConfig } from './config';
import { compileRoute, sampleRouteMotion } from './routeCompiler';
import { PACE_FACTOR } from './pace';
import { appReducer, createInitialState } from '@/core/state';

const withPace = (drill: Drill, pace: PlaybackPace): Drill => ({
  ...drill,
  settings: { ...drill.settings!, pace },
});

describe('playback pace by age group', () => {
  it('stretches the drill clock for younger players and shrinks it for older ones', () => {
    const { drill } = projectToV2(DRILL_TEMPLATES[0].document);
    const standard = getMechanicsConfig(drill).durationSeconds;
    expect(getMechanicsConfig(withPace(drill, 'u9')).durationSeconds).toBeCloseTo(standard / PACE_FACTOR.u9);
    expect(getMechanicsConfig(withPace(drill, 'adult')).durationSeconds).toBeLessThan(standard);
    expect(getMechanicsConfig(withPace(drill, 'u9')).maxForwardSpeed).toBeLessThan(getMechanicsConfig(drill).maxForwardSpeed);
  });

  it('plays every library drill out the same way at U7 pace as at standard pace', () => {
    // The pace slows everything together, so no pass that connects at
    // standard pace misses for younger players, and no goal turns into a save.
    const differences: string[] = [];
    for (const item of DRILL_TEMPLATES) {
      const { drill } = projectToV2(item.document);
      const fast = compileDrill(drill);
      const slow = compileDrill(withPace(drill, 'u7'));
      const outcomes = (compiled: typeof fast) =>
        sampleFrame(compiled, compiled.durationSeconds).eventExecutions.map(execution => `${execution.status}:${execution.outcome ?? ''}`);
      if (outcomes(fast).join() !== outcomes(slow).join()) differences.push(item.document.metadata.title);
    }
    expect(differences).toEqual([]);
  });

  it('keeps the pace through the stored document and back', () => {
    const stored = DRILL_TEMPLATES[0].document;
    const { drill } = projectToV2(stored);
    const edited = migrateV2ToV3(withPace(drill, 'u11'));
    expect(edited.presentation.pace).toBe('u11');
    const merged = mergeEditedV2(stored, edited);
    expect(merged.presentation.pace).toBe('u11');
    expect(projectToV2(merged).drill.settings?.pace).toBe('u11');
    // Back to standard clears it.
    expect(mergeEditedV2(merged, migrateV2ToV3(projectToV2(stored).drill)).presentation.pace).toBeUndefined();
  });
});

describe('choosing a pace', () => {
  it('sets, changes and clears the pace as one undoable step each', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_PACE', pace: 'u9' });
    expect(state.drill.settings?.pace).toBe('u9');
    expect(state.undoStack.length).toBe(1);
    state = appReducer(state, { type: 'SET_PACE', pace: null });
    expect(state.drill.settings?.pace).toBeUndefined();
    expect(state.drill.settings && 'pace' in state.drill.settings).toBe(false);
    expect(state.undoStack.length).toBe(2);
  });
});

describe('slowing down through turns', () => {
  const player: Player = { id: 'p', x: 100, y: 200, team: 'home', number: '1', role: 'F', hasPuck: false };
  const config = getMechanicsConfig({ settings: undefined } as unknown as Drill);
  const path = (points: SkatePath['points']): SkatePath => ({ id: 'r', ownerId: 'p', team: 'home', points, shape: 'polyline', mode: 'skate', finish: 'stop' });

  it('takes longer to skate a U-turn than a straight line of the same length', () => {
    const leg = 40 * FT;
    const straight = compileRoute(player, path([{ x: 100, y: 200 }, { x: 100 + leg * 2, y: 200 }]), config);
    const uTurn = compileRoute(player, path([{ x: 100, y: 200 }, { x: 100 + leg, y: 200 }, { x: 100 + leg, y: 203 }, { x: 100, y: 203 }]), config);
    expect(uTurn.durationSeconds).toBeGreaterThan(straight.durationSeconds * 1.07);
    expect(straight.turnWarp).toBeUndefined();
  });

  it('is slowest at the apex of the turn and still finishes at the end of the route', () => {
    const leg = 40 * FT;
    const route = compileRoute(player, path([{ x: 100, y: 200 }, { x: 100 + leg, y: 200 }, { x: 100 + leg, y: 203 }, { x: 100, y: 203 }]), config);
    let apexSpeed = Infinity;
    let straightSpeed = 0;
    for (let t = 0; t <= route.durationSeconds; t += 0.02) {
      const motion = sampleRouteMotion(route, t);
      if (Math.abs(motion.distance - leg) < 1 * FT) apexSpeed = Math.min(apexSpeed, motion.speed);
      if (motion.distance > 10 * FT && motion.distance < leg - 8 * FT) straightSpeed = Math.max(straightSpeed, motion.speed);
    }
    expect(apexSpeed).toBeLessThan(straightSpeed * 0.8);
    expect(sampleRouteMotion(route, route.durationSeconds + 1).distance).toBeCloseTo(route.totalLength, 3);
  });
});

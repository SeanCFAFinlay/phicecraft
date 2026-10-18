import { describe, expect, it } from 'vitest';
import { buildDrill, buildPlayer, buildRoute } from '@/test/builders';
import { SHOWCASE_PRESET } from '@/engine/showcase';
import { compileDrill } from './compileDrill';
import { getAuthoredPlayerFrame, getAuthoredReleaseProgress, getRouteMotionAtProgress } from './authoring';

function delayedRoute(delay: number) {
  return buildDrill({
    players: [buildPlayer({ id: 'p1', x: 200, y: 200, hasPuck: true })],
    skatePaths: [buildRoute({ id: 'route', ownerId: 'p1', startAtSeconds: delay,
      points: [{ x: 200, y: 200 }, { x: 400, y: 200 }], shape: 'polyline' })],
  });
}

describe('authoring delayed skating routes', () => {
  it.each([{ x: 220, y: 200 }, { x: 300, y: 200 }, { x: 400, y: 200 }])(
    'authors release when the delayed player actually reaches $x,$y', point => {
      const immediate = delayedRoute(0);
      const delayed = delayedRoute(2);
      const originalProgress = getAuthoredReleaseProgress(immediate, 'p1', point);
      const progress = getAuthoredReleaseProgress(delayed, 'p1', point);
      expect((progress - originalProgress) * 8).toBeCloseTo(2);
      const player = getAuthoredPlayerFrame(delayed, 'p1', progress)!;
      expect(player.position.x).toBeCloseTo(point.x);
      expect(player.position.y).toBeCloseTo(point.y);
    }
  );

  it('keeps the motion helper and sampled player in agreement before, at and after the delay', () => {
    const drill = delayedRoute(2);
    for (const seconds of [0, 1, 2, 2.5, 3, 4, 6, 8]) {
      const motion = getRouteMotionAtProgress(drill, 'p1', seconds / 8)!;
      const player = getAuthoredPlayerFrame(drill, 'p1', seconds / 8)!;
      expect(motion.speed).toBeCloseTo(player.speed);
      expect(motion.distance).toBeCloseTo(player.position.x - 200);
      if (seconds <= 2) {
        expect(motion.distance).toBe(0);
        expect(motion.speed).toBe(0);
      }
    }
  });

  it('keeps the showcase shooter at its real endpoint when its shot is reauthored', () => {
    const players = SHOWCASE_PRESET.players();
    const drill = buildDrill({ players, ...SHOWCASE_PRESET.sequence!(players), initialPuck: SHOWCASE_PRESET.initialPuck });
    const path = drill.skatePaths[2];
    const endpoint = path.points[path.points.length - 1];
    const progress = getAuthoredReleaseProgress(drill, path.ownerId, endpoint);
    const expectedArrival = compileDrill(drill).routes.get(path.ownerId)!.durationSeconds;
    expect(progress * 8).toBeCloseTo(expectedArrival);
    expect(progress * 8).toBeGreaterThan(6);
    expect(getAuthoredPlayerFrame(drill, path.ownerId, progress)!.position.x).toBeCloseTo(endpoint.x);
  });

  it('retains the editor release cap for a route extending past the timeline', () => {
    expect(getAuthoredReleaseProgress(delayedRoute(7), 'p1', { x: 400, y: 200 })).toBe(0.98);
    expect(getAuthoredReleaseProgress(delayedRoute(2), 'missing', { x: 400, y: 200 })).toBe(0);
    expect(getRouteMotionAtProgress(delayedRoute(2), 'missing', 0.5)).toBeNull();
  });
});

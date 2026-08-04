// ============================================================================
// PLAYBACK STORE
//
// These assertions are the reducer's playback tests, moved verbatim to the
// store that now owns the frame. The behaviour is unchanged - the drill is
// still never mutated by playback, trails still only accumulate while playing,
// and progress is still clamped - but React no longer sees a per-frame update.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybackStore } from './PlaybackStore';
import { GhostTrailBuffer, derivePlaybackFrame } from './playbackFrame';
import { buildDrill, buildPass, buildPlayer, buildRoute } from '@/test/builders';
import type { Drill, Point } from '@/core/types';

function drillWithRoute(): Drill {
  return buildDrill({
    players: [
      buildPlayer({ id: 'a', number: '11', hasPuck: true, x: 0, y: 0 }),
      buildPlayer({ id: 'b', number: '13', x: 100, y: 0 }),
    ],
    skatePaths: [
      buildRoute({
        id: 'route-a',
        ownerId: 'a',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 60 },
          { x: 200, y: 140 },
        ],
      }),
    ],
  });
}

let store: PlaybackStore;

beforeEach(() => {
  store = new PlaybackStore();
});

describe('sampling', () => {
  it('never moves players in the drill itself', () => {
    // The invariant that keeps an interrupted playback from persisting
    // animation frames as the drill's real state.
    const drill = drillWithRoute();
    store.setDrill(drill);
    store.setPlaying(true);
    store.seek(0.5);

    expect(drill.players.find(player => player.id === 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('exposes interpolated positions separately', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    const frame = store.seek(1);

    expect(frame.playerFrames.a.routeProgress).toBe(1);
    expect(frame.positions.a.y).toBeGreaterThan(0);
  });

  it('clamps progress to 0..1', () => {
    store.setDrill(drillWithRoute());
    expect(store.seek(5).progress).toBe(1);
    expect(store.seek(-5).progress).toBe(0);
  });

  it('derives fired events from progress, and un-fires them when scrubbing back', () => {
    const drill = buildDrill({
      players: [
        buildPlayer({ id: 'a', hasPuck: true, x: 0, y: 0 }),
        buildPlayer({ id: 'b', x: 100, y: 0 }),
      ],
      events: [buildPass({ id: 'p1', fromPlayerId: 'a', toPlayerId: 'b', at: undefined, arrivalAt: undefined })],
    });
    store.setDrill(drill);
    store.setPlaying(true);

    expect(store.seek(0.9).firedEventIndices).toEqual([0]);
    expect(store.seek(0.1).firedEventIndices).toEqual([]);
  });

  it('returns the previous frame when no drill has been set', () => {
    expect(store.seek(0.5).progress).toBe(0);
  });
});

describe('ghost trails', () => {
  it('accumulates only while playing', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.25);
    store.seek(0.5);
    expect(store.trails.read('a').length).toBeGreaterThan(0);

    const scrubbing = new PlaybackStore();
    scrubbing.setDrill(drillWithRoute());
    scrubbing.seek(0.5);
    expect(scrubbing.trails.entries()).toEqual([]);
  });

  it('is bounded by its capacity rather than growing without limit', () => {
    const buffer = new GhostTrailBuffer(4);
    for (let index = 0; index < 50; index++) buffer.push('a', { x: index * 10, y: 0 });

    const points = buffer.read('a');
    expect(points).toHaveLength(4);
    // Oldest first, and the newest sample is last.
    expect(points.at(-1)).toEqual({ x: 490, y: 0 });
    expect(points[0]).toEqual({ x: 460, y: 0 });
  });

  it('ignores a sample that has not meaningfully moved', () => {
    const buffer = new GhostTrailBuffer(8);
    buffer.push('a', { x: 0, y: 0 });
    buffer.push('a', { x: 0.1, y: 0.1 });
    buffer.push('a', { x: 0.2, y: 0 });
    expect(buffer.read('a')).toHaveLength(1);
  });

  it('ignores a missing sample', () => {
    const buffer = new GhostTrailBuffer(4);
    buffer.push('a', undefined);
    expect(buffer.read('a')).toEqual([]);
  });

  it('is cleared on reset', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.5);
    store.reset();
    expect(store.trails.entries()).toEqual([]);
  });

  it('forEach yields the same points as read(), oldest-first, per player', () => {
    const buffer = new GhostTrailBuffer(4);
    for (let index = 0; index < 6; index++) buffer.push('a', { x: index * 10, y: 0 });
    buffer.push('b', { x: 1, y: 1 });
    buffer.push('b', { x: 2, y: 2 });

    const seen: Record<string, readonly Point[]> = {};
    buffer.forEach((playerId, points) => {
      seen[playerId] = [...points];
    });

    expect(seen.a).toEqual(buffer.read('a'));
    expect(seen.b).toEqual(buffer.read('b'));
  });

  it('reuses a single scratch array across callback invocations in one forEach pass', () => {
    // The renderer relies on this to stay allocation-free: forEach hands every
    // player's callback the SAME backing array, overwritten in place. This is
    // only safe because each callback runs synchronously before the next -
    // a consumer must copy out what it needs (as the assertion above does)
    // rather than retain the reference past its own invocation.
    const buffer = new GhostTrailBuffer(4);
    buffer.push('a', { x: 0, y: 0 });
    buffer.push('a', { x: 10, y: 0 });
    buffer.push('b', { x: 1, y: 1 });
    buffer.push('b', { x: 2, y: 2 });

    const references: (readonly Point[])[] = [];
    buffer.forEach((_playerId, points) => {
      references.push(points);
    });

    expect(references).toHaveLength(2);
    expect(references[0]).toBe(references[1]);
  });

  it('skips a player with no accumulated points', () => {
    const buffer = new GhostTrailBuffer(4);
    buffer.push('a', { x: 0, y: 0 });
    buffer.push('b', undefined); // never actually accumulates

    const seenIds: string[] = [];
    buffer.forEach(playerId => seenIds.push(playerId));

    expect(seenIds).toEqual(['a']);
  });
});

describe('puck trail', () => {
  it('accumulates the puck position only while playing, alongside the player trails', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.25);
    store.seek(0.5);
    expect(store.puckTrail.read('puck').length).toBeGreaterThan(0);

    const scrubbing = new PlaybackStore();
    scrubbing.setDrill(drillWithRoute());
    scrubbing.seek(0.5);
    expect(scrubbing.puckTrail.entries()).toEqual([]);
  });

  it('does not accumulate when the frame has no puck (no carrier, no puck event yet)', () => {
    const drill = buildDrill({
      players: [buildPlayer({ id: 'a', x: 0, y: 0 }), buildPlayer({ id: 'b', x: 100, y: 0 })],
    });
    store.setDrill(drill);
    store.setPlaying(true);
    store.seek(0.5);
    expect(store.getFrame().puck).toBeNull();
    expect(store.puckTrail.entries()).toEqual([]);
  });

  it('is cleared on reset, the same place player trails clear', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.5);
    expect(store.puckTrail.entries().length).toBeGreaterThan(0);

    store.reset();
    expect(store.puckTrail.entries()).toEqual([]);
    expect(store.trails.entries()).toEqual([]);
  });

  it('is cleared whenever playback starts, the same place player trails clear', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.5);
    expect(store.puckTrail.entries().length).toBeGreaterThan(0);

    store.setPlaying(true);
    expect(store.puckTrail.entries()).toEqual([]);
  });
});

describe('reset and document changes', () => {
  it('resets back to a clean slate', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.8);

    store.reset();
    const frame = store.getFrame();
    expect(frame.progress).toBe(0);
    expect(frame.positions).toEqual({});
    expect(frame.puck).toBeNull();
  });

  it('resets when a different drill is set', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);
    store.seek(0.8);

    store.setDrill(buildDrill({ id: 'other' }));
    expect(store.getFrame().progress).toBe(0);
  });

  it('does not reset when handed the same drill object again', () => {
    const drill = drillWithRoute();
    store.setDrill(drill);
    store.setPlaying(true);
    store.seek(0.6);

    store.setDrill(drill);
    expect(store.getFrame().progress).toBeCloseTo(0.6, 6);
  });
});

describe('the coarse display snapshot React subscribes to', () => {
  it('changes at most once per percent of progress', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);

    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    // 200 frames across 1% of the timeline: one visible change at most.
    for (let index = 0; index < 200; index++) store.seek(0.5 + index * 0.00001);
    expect(notifications).toBeLessThanOrEqual(2);
  });

  it('notifies canvas subscribers on every frame', () => {
    store.setDrill(drillWithRoute());
    store.setPlaying(true);

    let frames = 0;
    store.subscribeToFrames(() => {
      frames += 1;
    });

    for (let index = 0; index < 10; index++) store.seek(0.5 + index * 0.00001);
    expect(frames).toBe(10);
  });

  it('reports progress as a whole percent', () => {
    store.setDrill(drillWithRoute());
    store.seek(0.567);
    expect(store.getSnapshot().progressPercent).toBe(57);
  });

  it('stops notifying after unsubscribe', () => {
    store.setDrill(drillWithRoute());
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.seek(0.5);
    const afterFirst = notifications;
    unsubscribe();
    store.seek(0.9);
    expect(notifications).toBe(afterFirst);
  });
});

describe('derivePlaybackFrame', () => {
  it('reports `active` while playing but `ready` when parked at the start', () => {
    const drill = drillWithRoute();
    expect(derivePlaybackFrame(drill, 0, true).lifecycle).toBe('active');
    expect(derivePlaybackFrame(drill, 0, false).lifecycle).toBe('ready');
  });

  it('is deterministic: the same inputs give the same frame', () => {
    const drill = drillWithRoute();
    const first = derivePlaybackFrame(drill, 0.42, true);
    const second = derivePlaybackFrame(drill, 0.42, true);
    expect(second.positions).toEqual(first.positions);
    expect(second.firedEventIndices).toEqual(first.firedEventIndices);
  });
});

describe('positionFor', () => {
  it('gives the interpolated position while scrubbing, and nothing at rest', () => {
    store.setDrill(drillWithRoute());
    expect(store.positionFor('a')).toBeUndefined();

    store.seek(0.5);
    expect(store.positionFor('a')).toBeDefined();
  });
});

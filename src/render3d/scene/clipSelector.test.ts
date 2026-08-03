// ============================================================================
// CLIP SELECTOR — pure selection-rule tests
//
// No THREE, no mixer, no DOM: `selectClipName`/`isMovementClip` are plain
// data-in/name-out functions, so these run under the default (node)
// environment - see actors.dom.test.ts for the mixer-driven worked examples
// that prove what a selected clip actually DOES once wired into an Actor.
// ============================================================================

import { describe, expect, it } from 'vitest';
import type { PlaybackPlayerFrame, SkaterAction } from '@/core/types';
import { isMovementClip, selectClipName } from './clipSelector';

function playerFrame(overrides: Partial<PlaybackPlayerFrame>): PlaybackPlayerFrame {
  return {
    id: 'p1',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    angularVelocity: 0,
    speed: 0,
    routeProgress: 0,
    stridePhase: 0,
    action: 'stride',
    bladePosition: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('selectClipName - goalie', () => {
  it('is always goalie_idle, ignoring the frame and the available clip set entirely', () => {
    expect(selectClipName('goalie', playerFrame({ action: 'shot' }), new Set(['goalie_idle']))).toBe('goalie_idle');
    expect(selectClipName('goalie', undefined, new Set())).toBe('goalie_idle');
  });
});

describe('selectClipName - skater, exact match', () => {
  it('returns frame.action verbatim when a clip by that exact name exists', () => {
    const available = new Set(['idle', 'stride', 'skate', 'pass', 'shot']);
    const actions: SkaterAction[] = ['idle', 'pass', 'shot', 'stride'];
    for (const action of actions) {
      expect(selectClipName('skater', playerFrame({ action }), available)).toBe(action);
    }
  });
});

describe('selectClipName - skater, fallback chain', () => {
  it("falls back to 'stride' when the action itself has no clip but stride does", () => {
    const available = new Set(['stride', 'skate']);
    expect(selectClipName('skater', playerFrame({ action: 'pass' }), available)).toBe('stride');
    expect(selectClipName('skater', playerFrame({ action: 'glide' }), available)).toBe('stride');
  });

  it("falls back all the way to 'skate' when neither the action nor 'stride' has a clip - today's shipped GLBs", () => {
    const available = new Set(['skate']);
    const actions: SkaterAction[] = ['idle', 'stride', 'glide', 'turn', 'stop', 'receive', 'recover', 'pass', 'shot'];
    for (const action of actions) {
      expect(selectClipName('skater', playerFrame({ action }), available)).toBe('skate');
    }
  });

  it('prefers an exact action match over the stride/skate fallback even when both also exist', () => {
    const available = new Set(['pass', 'stride', 'skate']);
    expect(selectClipName('skater', playerFrame({ action: 'pass' }), available)).toBe('pass');
  });

  it('treats a missing frame like an idle skater, still subject to the same fallback chain', () => {
    expect(selectClipName('skater', undefined, new Set(['stride', 'skate']))).toBe('stride');
    expect(selectClipName('skater', undefined, new Set(['skate']))).toBe('skate');
  });
});

describe('isMovementClip', () => {
  it('is true for the four movement-loop names (today\'s and future)', () => {
    expect(isMovementClip('skate')).toBe(true);
    expect(isMovementClip('stride')).toBe(true);
    expect(isMovementClip('glide')).toBe(true);
    expect(isMovementClip('turn')).toBe(true);
  });

  it('is false for every non-movement action name', () => {
    const nonMovement = ['pass', 'shot', 'stop', 'receive', 'recover', 'idle', 'goalie_idle'];
    for (const name of nonMovement) {
      expect(isMovementClip(name)).toBe(false);
    }
  });
});

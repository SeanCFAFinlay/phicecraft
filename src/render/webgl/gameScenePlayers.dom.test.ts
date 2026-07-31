// ============================================================================
// GAME SCENE PLAYER TOKENS — unit test
//
// Same rationale as gameScene.dom.test.ts / rinkScene.dom.test.ts: Pixi's
// real renderer cannot initialize in jsdom, so this constructs a token in
// isolation and asserts on its draw calls (via spies) and transform state,
// not pixels.
//
// Covers two review findings:
//   - `showInitialPuck` used to be computed and passed but never read;
//     `updateCarrierAndPuck` must combine it with `isPuckHolder` the same
//     way Canvas's PlayerRenderer.ts does (`isPuckHolder || showInitialPuck`),
//     or a brand-new drill (one player, `hasPuck: true`, zero events) draws
//     no puck marker at all - the DEFAULT editor state.
//   - `trackedPuck` used to be declared but never read; a goalie must rotate
//     to face a visible puck (GoalieRenderer.ts's `trackedHeading`), not the
//     frame's own heading.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerToken, updatePlayerToken, type PlayerVisualOptions } from './gameScenePlayers';
import type { Player, PlaybackPlayerFrame } from '@/core/types';

function fakeCanvasRenderingContext2D(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} } as unknown as CanvasGradient;
  return {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect: () => {},
    measureText: (text: string) => ({
      width: text.length * 6,
      actualBoundingBoxAscent: 5,
      actualBoundingBoxDescent: 2,
      fontBoundingBoxAscent: 6,
      fontBoundingBoxDescent: 2,
    }),
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = ((type: string) =>
    type === '2d' ? fakeCanvasRenderingContext2D() : null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

function options(overrides: Partial<PlayerVisualOptions> = {}): PlayerVisualOptions {
  return {
    isSelected: false,
    isDragging: false,
    isMoving: false,
    isPassFrom: false,
    isPuckHolder: false,
    showInitialPuck: false,
    heading: 0,
    showRouteHandle: false,
    isPreparingReceive: false,
    screenRotation: 0,
    ...overrides,
  };
}

const skater: Player = {
  id: 'p1',
  x: 100,
  y: 100,
  team: 'home',
  number: '9',
  role: 'C',
  hasPuck: true,
};

function frameAt(overrides: Partial<PlaybackPlayerFrame> = {}): PlaybackPlayerFrame {
  return {
    id: 'p1',
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    angularVelocity: 0,
    speed: 0,
    routeProgress: 0,
    stridePhase: 0,
    action: 'idle',
    bladePosition: { x: 120, y: 100 },
    ...overrides,
  };
}

describe('updatePlayerToken — carrier ring + puck marker wiring', () => {
  it('draws the carrier ring and puck marker when showInitialPuck is true, even though isPuckHolder is false (brand-new drill, zero events)', () => {
    const token = createPlayerToken();
    const ringSpy = vi.spyOn(token.carrierRing, 'circle');
    const puckSpy = vi.spyOn(token.puck, 'ellipse');

    updatePlayerToken(token, {
      player: skater,
      options: options({ showInitialPuck: true, isPuckHolder: false }),
      quality: 'high',
    });

    expect(ringSpy).toHaveBeenCalled();
    expect(puckSpy).toHaveBeenCalled();
  });

  it('still draws the carrier ring + puck marker via isPuckHolder alone (mid-drill possession)', () => {
    const token = createPlayerToken();
    const ringSpy = vi.spyOn(token.carrierRing, 'circle');

    updatePlayerToken(token, {
      player: skater,
      options: options({ showInitialPuck: false, isPuckHolder: true }),
      quality: 'high',
    });

    expect(ringSpy).toHaveBeenCalled();
  });

  it('draws neither when the player carries no puck at all', () => {
    const token = createPlayerToken();
    const ringSpy = vi.spyOn(token.carrierRing, 'circle');
    const puckSpy = vi.spyOn(token.puck, 'ellipse');

    updatePlayerToken(token, { player: skater, options: options(), quality: 'high' });

    expect(ringSpy).not.toHaveBeenCalled();
    expect(puckSpy).not.toHaveBeenCalled();
  });
});

describe('updatePlayerToken — goalie tracks a visible puck (trackedPuck)', () => {
  it("rotates the body to face the puck, overriding the frame's own heading", () => {
    const token = createPlayerToken();
    const goalie: Player = { ...skater, role: 'G' };
    const frame = frameAt({ heading: 0 });
    const puck = { x: 100, y: 200, visible: true, state: 'loose' as const };

    updatePlayerToken(token, {
      player: goalie,
      options: options({ playbackFrame: frame, trackedPuck: puck }),
      quality: 'high',
    });

    const expected = Math.atan2(puck.y - goalie.y, puck.x - goalie.x);
    expect(token.bodyGroup.rotation).toBeCloseTo(expected, 5);
  });

  it('falls back to the frame heading when the puck is not visible', () => {
    const token = createPlayerToken();
    const goalie: Player = { ...skater, role: 'G' };
    const frame = frameAt({ heading: 0.7 });
    const puck = { x: 100, y: 200, visible: false, state: 'dead' as const };

    updatePlayerToken(token, {
      player: goalie,
      options: options({ playbackFrame: frame, trackedPuck: puck }),
      quality: 'high',
    });

    expect(token.bodyGroup.rotation).toBeCloseTo(0.7, 5);
  });

  it('a skater ignores a visible puck and always uses the frame heading', () => {
    const token = createPlayerToken();
    const frame = frameAt({ heading: 1.2 });
    const puck = { x: 100, y: 200, visible: true, state: 'loose' as const };

    updatePlayerToken(token, {
      player: skater,
      options: options({ playbackFrame: frame, trackedPuck: puck }),
      quality: 'high',
    });

    expect(token.bodyGroup.rotation).toBeCloseTo(1.2, 5);
  });
});

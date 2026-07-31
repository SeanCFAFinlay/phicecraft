// ============================================================================
// RINK SCENE — scene-graph unit test
//
// Pixi's WebGL renderer cannot initialize in jsdom (no real GL context), so
// this never touches a renderer: it builds the scene graph in isolation and
// asserts node counts/types per rink feature group. Actual pixels are
// e2e-verified (Playwright's `visual-webgl-shell` project).
//
// Constructing the graph still touches TWO real-canvas dependencies even
// without a renderer: `FillGradient.fill()` eagerly bakes its gradient into a
// tiny canvas texture (used by the ice surface, the zone tints and the PH
// monogram), and Pixi `Text` measures itself via a canvas 2D context on
// construction. The project's global jsdom setup stubs
// `HTMLCanvasElement.prototype.getContext` to return `null` (real jsdom
// canvas support is absent, and most DOM tests never need it) - this file
// overrides that stub, locally, with just enough of a fake 2D context for
// those two code paths to succeed. Nothing here asserts on pixels, only on
// the shape of the tree, so the fake never needs to draw anything real.
// ============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { RINK } from '@/core/constants';

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

const {
  buildRinkScene,
  buildArenaFloor,
  buildIceSurface,
  buildZoneTints,
  buildCenterLogo,
  buildMarkings,
  buildBoardFixtures,
  buildBoards,
  buildGoals,
  iceYRangeAt,
} = await import('./rinkScene');

// This is the actual correctness mechanism for the goal/blue/centre lines
// (see rinkScene.ts's "Line markings" section for why it replaced a Container
// mask): the Playwright baseline's own generation surfaced that a WebGL
// context is not guaranteed a stencil buffer, and Pixi silently stops
// clipping without one.
describe('iceYRangeAt', () => {
  it('is the full ice height away from the corner columns', () => {
    expect(iceYRangeAt(RINK.centerX)).toEqual([RINK.y, RINK.y + RINK.height]);
  });

  it('narrows near a corner, following the rounded-rect arc', () => {
    const [top, bottom] = iceYRangeAt(RINK.goalLineLeftX);
    const cornerCenterX = RINK.x + RINK.cornerRadius;
    const dx = RINK.goalLineLeftX - cornerCenterX;
    const expectedDy = Math.sqrt(RINK.cornerRadius ** 2 - dx ** 2);

    expect(top).toBeCloseTo(RINK.y + RINK.cornerRadius - expectedDy);
    expect(bottom).toBeCloseTo(RINK.y + RINK.height - RINK.cornerRadius + expectedDy);
    expect(bottom - top).toBeLessThan(RINK.height);
  });

  it('trims the same amount on both sides of the rink (goal line x is symmetric)', () => {
    const left = iceYRangeAt(RINK.goalLineLeftX);
    const right = iceYRangeAt(RINK.goalLineRightX);
    expect(right[0]).toBeCloseTo(left[0]);
    expect(right[1]).toBeCloseTo(left[1]);
  });
});

describe('buildArenaFloor', () => {
  it('is a single Graphics node (drawn before the ice, so it only ever peeks out past the boards)', () => {
    expect(buildArenaFloor()).toBeInstanceOf(Graphics);
  });
});

describe('buildIceSurface', () => {
  it('is a single Graphics node', () => {
    expect(buildIceSurface()).toBeInstanceOf(Graphics);
  });
});

describe('buildZoneTints', () => {
  it('is a container of two Graphics tints, home and away', () => {
    const group = buildZoneTints();
    expect(group).toBeInstanceOf(Container);
    expect(group.children).toHaveLength(2);
    expect(group.children.every(child => child instanceof Graphics)).toBe(true);
  });
});

describe('buildCenterLogo', () => {
  it('has the rings, the arc-text tagline, the monogram and the wordmark', () => {
    const logo = buildCenterLogo();
    expect(logo).toBeInstanceOf(Container);
    expect(logo.children).toHaveLength(4);

    const [rings, tagline, monogram, wordmark] = logo.children;
    expect(rings).toBeInstanceOf(Graphics);
    expect(monogram).toBeInstanceOf(Text);
    expect((monogram as Text).text).toBe('PH');
    expect(wordmark).toBeInstanceOf(Text);
    expect((wordmark as Text).text).toBe('HOCKEY PRACTICE');

    // One glyph per character of the tagline, each its own Text node.
    expect(tagline).toBeInstanceOf(Container);
    const tagText = 'TRAIN · PLAY · IMPROVE';
    expect((tagline as Container).children).toHaveLength(tagText.length);
    expect((tagline as Container).children.every(child => child instanceof Text)).toBe(true);
  });
});

describe('buildMarkings', () => {
  it('has every marking group, with no mask (full-height lines are trimmed analytically instead)', () => {
    const markings = buildMarkings();
    expect(markings).toBeInstanceOf(Container);
    // goal lines + blue lines + centre line + creases + trapezoids +
    // faceoff circles + neutral spots + referee crease.
    expect(markings.children).toHaveLength(8);
    expect(markings.mask).toBeFalsy();
  });

  it('groups the four end-zone circles and the centre circle together', () => {
    const markings = buildMarkings();
    const faceoffCircles = markings.getChildByLabel('faceoff-circles');
    expect(faceoffCircles).toBeInstanceOf(Container);
    // 4 end-zone circles (each ring+marks+hash+spot in one Graphics) + 1 centre circle.
    expect((faceoffCircles as Container).children).toHaveLength(5);
    expect((faceoffCircles as Container).children.every(child => child instanceof Graphics)).toBe(true);
  });
});

describe('buildBoardFixtures', () => {
  it('labels every bench, penalty box and the scorer table', () => {
    const fixtures = buildBoardFixtures();
    expect(fixtures).toBeInstanceOf(Container);

    const texts = fixtures.children.filter((child): child is Text => child instanceof Text);
    const graphics = fixtures.children.filter(child => child instanceof Graphics);
    expect(texts.map(t => t.text)).toEqual(['HOME BENCH', 'AWAY BENCH', 'PENALTY', 'SCORER', 'PENALTY']);
    // Bench shapes, penalty/scorer shapes, glass stanchions.
    expect(graphics).toHaveLength(3);
  });

  // Review finding (Task 5 round 1): buildBenches used to add each label
  // INSIDE the loop but its shared Graphics (the rects + dividers) AFTER the
  // loop, so the box fill painted over "HOME BENCH"/"AWAY BENCH" and the
  // dividers struck through the glyphs - the opposite of the canvas source's
  // order (rect -> stroke -> dividers -> fillText) and of the sibling
  // buildPenaltyBoxes, which already had this right. A node-count assertion
  // alone can't catch a z-order regression like that, so this locks in the
  // actual child ORDER: each fixture's Graphics must precede its own label(s)
  // so Pixi paints the labels on top.
  it('paints each fixture group\'s Graphics before its own label(s), so labels stay on top', () => {
    const fixtures = buildBoardFixtures();
    const kinds = fixtures.children.map(child =>
      child instanceof Text ? 'text' : child instanceof Graphics ? 'graphics' : 'other'
    );

    expect(kinds).toEqual([
      'graphics', // benches: rects + dividers
      'text', // HOME BENCH
      'text', // AWAY BENCH
      'graphics', // penalty boxes + scorer's table
      'text', // PENALTY
      'text', // SCORER
      'text', // PENALTY
      'graphics', // glass stanchions
    ]);
  });
});

describe('buildBoards', () => {
  it('is a single Graphics node (the rounded-rect board stack)', () => {
    expect(buildBoards()).toBeInstanceOf(Graphics);
  });
});

describe('buildGoals', () => {
  it('is a container of two goals, left and right', () => {
    const goals = buildGoals();
    expect(goals).toBeInstanceOf(Container);
    expect(goals.children).toHaveLength(2);
    expect(goals.children.every(child => child instanceof Graphics)).toBe(true);
  });
});

describe('buildRinkScene', () => {
  it('assembles every feature group, once, in paint order', () => {
    const scene = buildRinkScene();
    expect(scene).toBeInstanceOf(Container);
    expect(scene.children).toHaveLength(8);

    const labels = scene.children.map(child => child.label);
    // arena-floor is FIRST (drawn before the ice, like the canvas original -
    // see buildArenaFloor's header) even though "boards" (the stroke stack
    // on top of everything) is named similarly and sorts much later.
    expect(labels).toEqual([
      'arena-floor',
      'ice-surface',
      'zone-tints',
      'center-logo',
      'markings',
      'boards',
      'board-fixtures',
      'goals',
    ]);
  });

  it('builds a fresh scene graph on every call (no shared mutable state)', () => {
    const a = buildRinkScene();
    const b = buildRinkScene();
    expect(a).not.toBe(b);
    expect(a.children[0]).not.toBe(b.children[0]);
  });
});

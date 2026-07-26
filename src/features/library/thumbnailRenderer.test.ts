// ============================================================================
// FRAMING A THUMBNAIL
//
// The drawing needs a canvas, which the test environment deliberately does not
// provide. The framing does not, and framing is the part that decides whether
// a card is useful: a quarter-ice battle drawn on a full sheet is four specks
// in a white rectangle, and every card in the library looks identical.
//
// So these test `drillBounds` against the REAL catalogue, and check that the
// drawing degrades to null rather than throwing when there is no context.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  __clearThumbnailCache,
  cachedThumbnail,
  drillBounds,
  renderThumbnail,
} from './thumbnailRenderer';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { buildDrill, buildPlayer } from '@/test/builders';
import { RINK } from '@/core/constants';
import type { Drill } from '@/core/types';

const ASPECT = 400 / 170;

const drillFor = (index: number): Drill => projectToV2(DRILL_TEMPLATES[index].document).drill;

function contains(outer: { x: number; y: number; width: number; height: number }, point: { x: number; y: number }) {
  return (
    point.x >= outer.x - 0.01 &&
    point.x <= outer.x + outer.width + 0.01 &&
    point.y >= outer.y - 0.01 &&
    point.y <= outer.y + outer.height + 0.01
  );
}

// ----------------------------------------------------------------------------

describe('framing every drill in the catalogue', () => {
  for (const [index, template] of DRILL_TEMPLATES.entries()) {
    it(`fits everything in ${template.document.metadata.title}`, () => {
      const drill = drillFor(index);
      const view = drillBounds(drill, ASPECT);

      for (const player of drill.players) {
        expect(contains(view, player), `#${player.number}`).toBe(true);
      }
      for (const path of drill.skatePaths) {
        for (const point of path.points) expect(contains(view, point)).toBe(true);
      }
      for (const event of drill.events) {
        expect(contains(view, event.fromPoint)).toBe(true);
        expect(contains(view, event.toPoint)).toBe(true);
      }
    });

    it(`stays inside the boards for ${template.document.metadata.title}`, () => {
      const view = drillBounds(drillFor(index), ASPECT);

      expect(view.x).toBeGreaterThanOrEqual(RINK.x - 0.01);
      expect(view.y).toBeGreaterThanOrEqual(RINK.y - 0.01);
      expect(view.x + view.width).toBeLessThanOrEqual(RINK.x + RINK.width + 0.01);
      expect(view.y + view.height).toBeLessThanOrEqual(RINK.y + RINK.height + 0.01);
    });

    it(`matches the card shape for ${template.document.metadata.title}`, () => {
      const view = drillBounds(drillFor(index), ASPECT);
      // Otherwise the drawing is letterboxed and the card wastes half its area.
      expect(view.width / view.height).toBeCloseTo(ASPECT, 2);
    });
  }
});

// ----------------------------------------------------------------------------

describe('framing', () => {
  it('zooms in on a drill that only uses one corner', () => {
    const corner = buildDrill({
      players: [
        buildPlayer({ id: 'a', number: '1', x: 120, y: 120 }),
        buildPlayer({ id: 'b', number: '2', x: 200, y: 200 }),
      ],
    });
    const view = drillBounds(corner, ASPECT);

    // The point of framing: a quarter-ice drill must not be drawn as four
    // specks on a full sheet.
    expect(view.width).toBeLessThan(RINK.width * 0.75);
  });

  it('shows the whole sheet for a drill that uses it', () => {
    const wide = buildDrill({
      players: [
        buildPlayer({ id: 'a', number: '1', x: 70, y: 200 }),
        buildPlayer({ id: 'b', number: '2', x: 930, y: 220 }),
      ],
    });
    expect(drillBounds(wide, ASPECT).width).toBeGreaterThan(RINK.width * 0.9);
  });

  it('does not become a close-up of two dots', () => {
    const tiny = buildDrill({
      players: [
        buildPlayer({ id: 'a', number: '1', x: 500, y: 210 }),
        buildPlayer({ id: 'b', number: '2', x: 510, y: 215 }),
      ],
    });
    expect(drillBounds(tiny, ASPECT).width).toBeGreaterThan(300);
  });

  it('falls back to the whole rink when there is nothing to frame', () => {
    const empty = buildDrill({ players: [] });
    const view = drillBounds(empty, ASPECT);
    expect(view.width).toBe(RINK.width);
  });

  it('ignores a non-finite coordinate rather than framing infinity', () => {
    const broken = buildDrill({
      players: [
        buildPlayer({ id: 'a', number: '1', x: Number.NaN, y: 200 }),
        buildPlayer({ id: 'b', number: '2', x: 400, y: 200 }),
      ],
    });
    const view = drillBounds(broken, ASPECT);
    expect(Number.isFinite(view.x)).toBe(true);
    expect(Number.isFinite(view.width)).toBe(true);
  });

  it('respects a different card shape', () => {
    const square = drillBounds(drillFor(0), 1);
    expect(square.width / square.height).toBeCloseTo(1, 2);
  });
});

// ----------------------------------------------------------------------------

describe('drawing without a canvas', () => {
  it('returns null rather than throwing', () => {
    // The test environment stubs getContext to null on purpose. A library card
    // with no picture beats a suite that explodes.
    expect(renderThumbnail(drillFor(0), { width: 400, height: 170 })).toBeNull();
  });

  it('caches the answer, including the null one', () => {
    __clearThumbnailCache();
    const options = { width: 400, height: 170 };
    const first = cachedThumbnail('x', drillFor(0), options);
    const second = cachedThumbnail('x', drillFor(0), options);
    expect(second).toBe(first);
  });

  it('keys the cache by size, so a bigger card is not given a small image', () => {
    __clearThumbnailCache();
    expect(cachedThumbnail('y', drillFor(0), { width: 400, height: 170 })).toBeNull();
    expect(cachedThumbnail('y', drillFor(0), { width: 800, height: 340 })).toBeNull();
  });
});

// ============================================================================
// SPRITE ATLAS — pure region-math tests
//
// `HOCKEY_SPRITES` (src/canvas/HockeySpriteAtlas.ts) describes each region of
// the shared webp atlas as a pixel rect plus an anchor point IN PIXELS (the
// point Canvas2D's `drawImage` offsets the draw by, see SkaterRenderer.ts /
// GoalieRenderer.ts). Pixi's `Spritesheet` JSON format wants the frame rect
// unchanged, but the anchor NORMALIZED to 0..1 of the frame's own size
// (`Texture.defaultAnchor` - see Spritesheet.d.ts). This is the pure
// conversion, tested without touching Pixi or the DOM.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { HOCKEY_SPRITES } from '@/canvas/HockeySpriteAtlas';
import { buildHockeySpritesheetData, regionAnchor, regionFrame } from './spriteAtlas';

describe('regionFrame', () => {
  it('carries the pixel rect straight through, renamed to Pixi\'s w/h keys', () => {
    const region = { x: 10, y: 20, width: 100, height: 50, anchorX: 40, anchorY: 25 };
    expect(regionFrame(region)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
});

describe('regionAnchor', () => {
  it('normalizes a pixel anchor to a 0..1 fraction of the region size', () => {
    const region = { x: 0, y: 0, width: 200, height: 100, anchorX: 50, anchorY: 25 };
    expect(regionAnchor(region)).toEqual({ x: 0.25, y: 0.25 });
  });

  it('handles an anchor at the region origin', () => {
    const region = { x: 0, y: 0, width: 200, height: 100, anchorX: 0, anchorY: 0 };
    expect(regionAnchor(region)).toEqual({ x: 0, y: 0 });
  });

  it('handles an anchor past the far edge (still just a fraction, > 1)', () => {
    const region = { x: 0, y: 0, width: 100, height: 100, anchorX: 150, anchorY: 50 };
    expect(regionAnchor(region)).toEqual({ x: 1.5, y: 0.5 });
  });
});

describe('buildHockeySpritesheetData', () => {
  const data = buildHockeySpritesheetData({ width: 1200, height: 1200 });

  it('has one frame per HOCKEY_SPRITES region, keyed by the same names', () => {
    expect(Object.keys(data.frames).sort()).toEqual(Object.keys(HOCKEY_SPRITES).sort());
  });

  it('every frame reproduces its source region\'s rect and normalized anchor', () => {
    for (const [name, region] of Object.entries(HOCKEY_SPRITES)) {
      const frame = data.frames[name];
      expect(frame.frame).toEqual(regionFrame(region));
      expect(frame.anchor).toEqual(regionAnchor(region));
    }
  });

  it('stamps meta.size from the image dimensions passed in, at scale 1', () => {
    expect(data.meta).toMatchObject({ size: { w: 1200, h: 1200 }, scale: 1 });
  });
});

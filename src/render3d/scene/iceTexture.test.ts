// ============================================================================
// ICE TEXTURE — FLAT_CAMERA corner-mapping proof
//
// iceTexture.ts's doc comment works through, by hand, why FLAT_CAMERA maps
// rink (0,0) -> canvas (0,0) and rink (1000,425) -> canvas ~(2048,871). That
// worked check was never executable: nothing failed if RINK's dimensions,
// ICE_TEXTURE_WIDTH/HEIGHT, or cameraMatrix itself drifted out from under it.
//
// This test runs the SAME proof through the real camera math
// (cameraMatrix + applyAffine, src/utils/geometry.ts) that
// `worldToScreen`/CanvasSurface's own rendering path uses, with the rink
// corners hardcoded (not re-derived from RINK) so a change to RINK's
// dimensions, ICE_TEXTURE_WIDTH/HEIGHT, or cameraMatrix's own formula fails
// this test rather than silently recomputing a new "expected" value.
//
// No DOM needed here (pure affine-matrix math), so this file is a plain
// `.test.ts`, not `.dom.test.ts` — it runs under vitest's default `node`
// environment (see vite.config.ts's `environmentMatchGlobs`).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { cameraMatrix, applyAffine } from '@/utils/geometry';
import { FLAT_CAMERA, ICE_TEXTURE_WIDTH, ICE_TEXTURE_HEIGHT } from './iceTexture';

describe('FLAT_CAMERA', () => {
  it('maps rink (0, 0) exactly onto the canvas top-left corner', () => {
    const p = applyAffine(cameraMatrix(FLAT_CAMERA), 0, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('maps rink (1000, 425) — the rink\'s far corner — onto the canvas\'s far corner (2048, 871), within the sub-texel tolerance the report documents', () => {
    const p = applyAffine(cameraMatrix(FLAT_CAMERA), 1000, 425);

    // x lands exactly: zoom = ICE_TEXTURE_WIDTH / RINK.width, so
    // zoom * 1000 == ICE_TEXTURE_WIDTH by construction.
    expect(p.x).toBeCloseTo(2048, 9);

    // y is the documented sub-texel sliver: 2.048 * 425 = 870.4, not the
    // canvas's full 871px height — the rink's 1000:425 aspect isn't an exact
    // multiple of 2048:871. Pin the exact worked value AND check it still
    // reads as "the far corner" within less than one texel.
    expect(p.y).toBeCloseTo(870.4, 9);
    expect(Math.abs(p.y - 871)).toBeLessThan(1);
  });

  it('uses the canvas dimensions this proof assumes (guards the hardcoded 2048/871 above)', () => {
    expect(ICE_TEXTURE_WIDTH).toBe(2048);
    expect(ICE_TEXTURE_HEIGHT).toBe(871);
  });
});

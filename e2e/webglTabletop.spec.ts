// ============================================================================
// WEBGL TABLETOP — the GPU-toggle-on binding requirement
//
// Task 5's brief requires that "tabletop MUST still work with the GPU
// toggle on" - covered by a test. WebGLRenderer.dom.test.ts only asserts that
// drawStatic() ROUTES to the Canvas2D pass-through pipeline once tilt crosses
// TABLETOP_MIN_TILT (pixi.js/rinkScene/drawStaticLayer are all mocked there);
// nothing verifies the real buffer -> texture upload -> sprite blit chain
// actually puts pixels on a webgl2-locked canvas in a real browser.
//
// This spec drives a real Chromium tab with `?renderer=webgl`, confirms the
// renderer that won selection really is 'webgl' (not a silent Canvas2D
// degrade - see paintCounters.ts's `kind`), then tilts into the tabletop view
// and asserts BOTH that a static repaint happened and that the static canvas
// actually holds non-transparent pixels afterward - not just that a paint
// counter ticked, which would still pass if the pass-through buffer somehow
// blitted a blank frame.
//
// No new screenshot baseline: this is a functional/pixel-sampling check, not
// a visual-regression one (per the review finding).
// ============================================================================

import { expect, test, type Page } from '@playwright/test';

/**
 * Whether the FIRST canvas in DOM order (the static/rink layer -
 * `CanvasSurface.tsx` mounts it before the dynamic one) currently holds any
 * non-transparent pixel.
 *
 * Reads back through a 2D `drawImage` onto an offscreen canvas rather than
 * inspecting the source canvas's own context type, so this works whether the
 * source canvas is `webgl2`-backed (the real case here) or `2d` - and
 * `WebGLRenderer`'s pass-through layers are built with
 * `preserveDrawingBuffer: true` specifically so this kind of readback sees
 * real content rather than whatever the browser cleared the buffer to after
 * its last composite.
 */
async function staticCanvasHasInk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const source = document.querySelectorAll('canvas')[0] as HTMLCanvasElement | undefined;
    if (!source || source.width === 0 || source.height === 0) return false;
    const offscreen = document.createElement('canvas');
    offscreen.width = source.width;
    offscreen.height = source.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
}

test('tabletop still renders real pixels with the GPU renderer toggled on', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      indexedDB.deleteDatabase('phicecraft');
    } catch {
      /* ignore */
    }
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  await page.goto('/?renderer=webgl');
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible();

  // Wait on real paint activity, not a guessed delay (selectRenderer's
  // dynamic import + two Pixi renderers' own async init()).
  await page.waitForFunction(() => {
    const paint = window.__phicecraftPaint;
    return !!paint && paint.staticPaints > 0 && paint.dynamicPaints > 0;
  });

  // Confirm this session actually got the WebGL renderer rather than a
  // silent Canvas2D fallback (a failed webgl2 probe or chunk import) - the
  // rest of this test would still pass against Canvas2D, which would prove
  // nothing about the binding requirement under test.
  const kind = await page.evaluate(() => window.__phicecraftPaint?.kind);
  expect(kind, 'the active renderer for this session').toBe('webgl');

  expect(await staticCanvasHasInk(page), 'the flat rink holds real pixels').toBe(true);

  await page.evaluate(() => window.__phicecraftPaint?.reset());

  await page.getByRole('button', { name: /tabletop 3D view/ }).click();
  await page.waitForFunction(() => {
    const paint = window.__phicecraftPaint;
    return !!paint && paint.staticPaints > 0;
  });
  // Let the (reduced-motion, so effectively instant) tilt settle onto its
  // final frame before sampling.
  await page.waitForTimeout(300);

  expect(
    await staticCanvasHasInk(page),
    'the tabletop arena, drawn via the Canvas2D pass-through buffer/sprite blit, holds real pixels'
  ).toBe(true);
});

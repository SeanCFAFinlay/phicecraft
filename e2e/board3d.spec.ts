// ============================================================================
// BOARD3D — true 3D is the tabletop view, unconditionally (Phase 4 Task 6)
//
// Replaces the deleted webglTabletop.spec.ts, which asserted the OLD
// Canvas2D/Pixi pseudo-3D pass still worked with the GPU renderer toggled on.
// That pass is gone: tilting into 3D via ViewControls' toggle now ALWAYS
// mounts Board3D (src/render3d/Board3D.tsx), a real three.js presentation,
// and the flat pair of 2D canvases (CanvasSurface) unmounts with it.
//
// This is a functional/pixel-sampling check, like the spec it replaces - not
// a visual-regression one (visual.spec.ts's 'tabletop rink' scenario owns
// that baseline).
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { dragWorld, LINEUP, openEditor } from './support';

const REQUESTED_RENDERER =
  process.env.RENDERER === 'webgl' || process.env.RENDERER === 'canvas2d' ? process.env.RENDERER : null;

/** Whether the given canvas element currently holds any non-transparent pixel. */
async function canvasHasInk(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(sel => {
    const source = document.querySelector(sel) as HTMLCanvasElement | null;
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
  }, selector);
}

test('entering 3D mounts Board3D and renders it; playback keeps it live; returning to 2D restores the flat surface', async ({
  page,
}) => {
  await openEditor(page);

  // Board3D is view-only (no editing gestures in 3D - that's CanvasSurface's
  // job, and it unmounts the moment 3D is entered), and the bundled default
  // drill starts with no authored route or puck action, which blocks
  // playback entirely ("Add a skating route or a puck action before
  // playing."). Draw one route in 2D first, exactly as a coach would before
  // tilting in, so Play actually has something to animate once in 3D.
  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });

  // Steady state: the flat pair of canvases (static + dynamic), no Board3D
  // canvas mounted yet.
  await expect(page.locator('canvas[data-board3d]')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(2);

  await page.evaluate(() => window.__phicecraftBoard3d?.reset());
  await page.getByRole('button', { name: /tabletop 3D view/ }).click();

  // Board3D's canvas mounts, and the flat pair unmounts with it - AppShell
  // swaps the whole tree, not just a layer within it.
  await expect(page.locator('canvas[data-board3d]')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(1);

  // `framesRendered` alone can race the async GLB load (see Board3D.tsx's
  // buildActors/renderFrame ordering note) - a frame can render the bare
  // arena before the actors are actually in the scene. Wait on both signals
  // so the capture below is of a genuinely populated scene.
  await page.waitForFunction(() => {
    const counters = window.__phicecraftBoard3d;
    return !!counters && counters.framesRendered > 0 && counters.actorsBuilt;
  });

  expect(await canvasHasInk(page, 'canvas[data-board3d]'), 'Board3D holds real pixels once ready').toBe(
    true
  );

  // Playback keeps driving real frames while it plays.
  const beforePlay = await page.evaluate(() => window.__phicecraftBoard3d?.framesRendered ?? 0);
  await page.getByRole('button', { name: 'Play drill' }).click();
  await page.waitForTimeout(800);
  const duringPlay = await page.evaluate(() => window.__phicecraftBoard3d?.framesRendered ?? 0);
  expect(duringPlay, 'Board3D kept rendering frames while the drill played').toBeGreaterThan(beforePlay);
  expect(
    await canvasHasInk(page, 'canvas[data-board3d]'),
    'Board3D still holds real pixels mid-playback'
  ).toBe(true);

  const stop = page.getByRole('button', { name: 'Stop playback' });
  if (await stop.isVisible().catch(() => false)) await stop.click();

  // Return to 2D: the flat pair remounts, and its own paint counters and
  // renderer kind behave exactly as they do on a fresh load.
  await page.evaluate(() => window.__phicecraftPaint?.reset());
  await page.getByRole('button', { name: /flat top-down view/ }).click();

  await expect(page.locator('canvas[data-board3d]')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(2);

  await page.waitForFunction(() => {
    const paint = window.__phicecraftPaint;
    return !!paint && paint.staticPaints > 0 && paint.dynamicPaints > 0;
  });

  if (REQUESTED_RENDERER) {
    const kind = await page.evaluate(() => window.__phicecraftPaint?.kind);
    expect(kind, 'the active renderer after returning to 2D').toBe(REQUESTED_RENDERER);
  }
});

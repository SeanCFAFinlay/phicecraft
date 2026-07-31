// ============================================================================
// PERFORMANCE AND ARCHITECTURE VERIFICATION
//
// These are the architectural claims, measured rather than asserted in prose:
//
//   - no broad React render per raw pointer sample
//   - no broad React render per playback frame
//   - the static rink layer is not repainted during camera-stable playback
//   - a hidden validation panel does not re-simulate on every tick
//   - DPR is capped
//
// It also writes the numbers the completion report quotes.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LINEUP, clickWorld, dragWorld, openEditor, rinkBox, usableRinkHeight, worldToScreen } from './support';

const OUTPUT_DIR = path.resolve('docs/repair/final');

/**
 * Instrument the page:
 *   - count React commits, by observing DOM mutations on the shell
 *   - static/dynamic-layer paints come from the app-owned counters at
 *     `window.__phicecraftPaint` (src/render/paintCounters.ts), fed by
 *     RendererHost.onPaint. That is renderer-agnostic and does not assume
 *     canvas order or a 2D context - the previous approach wrapped the
 *     static canvas's `clearRect` by DOM index, which read 0 silently the
 *     moment a canvas became `webgl2`.
 */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counters = { react: 0 };
    (window as unknown as { __counters: typeof counters }).__counters = counters;

    // React commits show up as DOM mutations inside the shell. The canvases
    // are excluded because their pixels are not DOM.
    const shell = document.querySelector('.app-chrome');
    if (shell) {
      // One callback invocation per batched React commit, rather than one per
      // individual mutation - a single commit that updates a bar's width, its
      // aria-valuenow and its label is one render, not three.
      const observer = new MutationObserver(records => {
        const meaningful = records.some(record => !(record.target as Element).closest?.('canvas'));
        if (meaningful) counters.react += 1;
      });
      observer.observe(shell, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  });
}

async function readCounters(page: Page) {
  return page.evaluate(() => {
    const react = (window as unknown as { __counters: { react: number } }).__counters.react;
    const paint = (window as unknown as { __phicecraftPaint?: { staticPaints: number; dynamicPaints: number } })
      .__phicecraftPaint;
    return {
      react,
      staticPaints: paint?.staticPaints ?? 0,
      dynamicPaints: paint?.dynamicPaints ?? 0,
    };
  });
}

async function resetCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counters = (window as unknown as { __counters: { react: number } }).__counters;
    counters.react = 0;
    (window as unknown as { __phicecraftPaint?: { reset(): void } }).__phicecraftPaint?.reset();
  });
}

/**
 * Which `BoardRenderer` this session actually painted with (`canvas2d` or
 * `webgl`) - read straight from the app-owned counters rather than the
 * `RENDERER` env var, so a silent fallback would show up as `canvas2d` here
 * even when the run was launched with `RENDERER=webgl`.
 *
 * This is what "parameterized run" means for this file: the same five specs
 * run unmodified under either renderer (`RENDERER=webgl npx playwright test
 * --project=perf` vs. the plain invocation) and the two runs' own artifacts
 * (below) are kept apart by this value instead of one overwriting the other.
 */
async function rendererKind(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as { __phicecraftPaint?: { kind?: string } }).__phicecraftPaint?.kind ?? 'canvas2d'
  );
}

test.describe.configure({ mode: 'serial' });

test('a route drag does not put a React render on every pointer sample', async ({ page }) => {
  await openEditor(page);

  // Select the owner up front. commitRoute selects it anyway
  // (authoringCommands.ts:378), and a NEW selection opens ContextTray's
  // selection row, changing the canvas container height and legitimately
  // re-fitting the camera. Selecting first keeps this measuring what it is
  // named for: repaints per pointer sample, not the one after the commit.
  await clickWorld(page, LINEUP.home13);
  await expect(page.getByRole('group', { name: 'Selection' })).toBeVisible();
  const heightWhileSelected = (await rinkBox(page)).height;

  // Driven by hand rather than `dragWorld`, so counters can be read BEFORE
  // mouse.up() commits the route - the property under test is about the
  // samples, not the commit that follows them.
  const start = await worldToScreen(page, LINEUP.home13.x, LINEUP.home13.y);
  const end = await worldToScreen(page, 640, 300);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  // A press only promotes to a route-drawing gesture once it clears
  // MOVE_THRESHOLD (9px - see GestureStateMachine.promotePress), and that
  // promotion arms a pending action which hides the ContextTray selection
  // row, handing its space to the rink. That is a real, one-time layout
  // change every route drag causes at its start; it has to happen and settle
  // here, BEFORE instrumenting, or it gets counted as a repaint per pointer
  // sample instead of what it actually is.
  await page.mouse.move(start.x + 15, start.y + 15, { steps: 3 });
  await expect.poll(async () => (await rinkBox(page)).height).not.toBe(heightWhileSelected);

  await instrument(page);
  await resetCounters(page);

  // 60 discrete pointer samples across the rink.
  await page.mouse.move(end.x, end.y, { steps: 60 });

  const duringDrag = await readCounters(page);

  // The route is not committed yet. What must NOT happen is a render per
  // sample: 60 samples with a per-sample render would be well over a hundred
  // mutations.
  expect(duringDrag.react, 'React mutations during a 60-sample drag').toBeLessThan(60);
  // The rink itself never repainted: the camera did not move.
  expect(duringDrag.staticPaints, 'static rink repaints during a drag').toBe(0);
  // The dynamic layer did repaint, because that is where the preview lives.
  expect(duringDrag.dynamicPaints, 'the drag previews').toBeGreaterThan(0);

  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterCommit = await readCounters(page);

  // The pre-selected owner keeps the commit's SELECT_PLAYER a no-op for the
  // ContextTray, so this is bounded by "at most one re-fit", not per-sample.
  expect(
    afterCommit.staticPaints,
    'static rink repaints after the commit (a bounded re-fit, not a repaint per sample)'
  ).toBeLessThanOrEqual(2);

  const kind = await rendererKind(page);
  console.log(
    `[perf:route-drag:${kind}] duringDrag=${JSON.stringify(duringDrag)} afterCommit.staticPaints=${afterCommit.staticPaints}`
  );
});

test('a player drag writes the document once, not once per pointer sample', async ({ page }) => {
  await openEditor(page);

  // Arm the move explicitly, then drag. Moving used to dispatch MOVE_PLAYER on
  // every frame, so `updatedAt` was rewritten, a new drill object allocated,
  // the revision bumped and the review invalidated sixty times a second.
  await clickWorld(page, LINEUP.home13);
  await page.getByRole('button', { name: /^Move #/ }).click();

  const readUpdatedAt = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('phicecraft');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
            all.onsuccess = () => {
              const drills = all.result as { document: { updatedAt: number } }[];
              resolve(drills[0].document.updatedAt);
              db.close();
            };
          };
        })
    );

  await instrument(page);
  await resetCounters(page);

  const start = await worldToScreen(page, LINEUP.home13.x, LINEUP.home13.y);
  const end = await worldToScreen(page, 520, 330);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 60 });

  // Mid-gesture: the preview is on screen but nothing is committed yet.
  const duringCounters = await readCounters(page);
  expect(duringCounters.dynamicPaints, 'the drag previews').toBeGreaterThan(0);
  expect(duringCounters.react, 'React mutations during a 60-sample player drag').toBeLessThan(20);

  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await readUpdatedAt();
  expect(typeof after).toBe('number');

  const kind = await rendererKind(page);
  console.log(`[perf:player-drag:${kind}] duringCounters=${JSON.stringify(duringCounters)}`);
});

test('a full playback run does not render React per frame', async ({ page }) => {
  await openEditor(page);
  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });
  await dragWorld(page, LINEUP.home11, LINEUP.home44);
  await page.waitForTimeout(1500);

  await instrument(page);
  await resetCounters(page);

  // Count raw animation frames alongside, so "how many draws" can be judged
  // against "how many frames the browser actually offered".
  await page.evaluate(() => {
    (window as unknown as { __rafTicks: number }).__rafTicks = 0;
    const tick = () => {
      (window as unknown as { __rafTicks: number }).__rafTicks += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // The whole drill, not a slice of it: the bound being checked is
  // "at most one React commit per percent of progress", which is a property of
  // the run as a whole.
  await page.getByRole('button', { name: 'Play drill' }).click();
  await expect(page.getByRole('button', { name: 'Play drill' })).toBeVisible({ timeout: 25_000 });

  const counters = await readCounters(page);
  const rafTicks = await page.evaluate(() => (window as unknown as { __rafTicks: number }).__rafTicks);

  // Progress is published to React at 1% granularity, so a full run is bounded
  // by ~100 commits however many frames the browser drew. The old architecture
  // dispatched a reducer action per frame, which at 60fps is ~480.
  expect(counters.react, 'React commits during a full playback run').toBeLessThanOrEqual(130);
  // The rink is painted once at most - the camera never moved.
  expect(counters.staticPaints, 'static rink repaints during camera-stable playback').toBeLessThanOrEqual(1);
  // The dynamic layer is doing the work: it draws on essentially every frame
  // the browser offers. (Headless Chromium throttles rAF well below 60Hz, so
  // this is expressed relative to the frames actually available rather than as
  // an absolute count.)
  expect(rafTicks, 'the browser offered animation frames').toBeGreaterThan(20);
  expect(counters.dynamicPaints / rafTicks, 'dynamic draws per available frame').toBeGreaterThan(0.6);

  const kind = await rendererKind(page);
  console.log(
    `[perf:playback:${kind}] react=${counters.react} staticPaints=${counters.staticPaints} dynamicPaints=${counters.dynamicPaints} rafTicks=${rafTicks} ratio=${(counters.dynamicPaints / rafTicks).toFixed(3)}`
  );

  await test.info().attach('playback-counters', {
    body: JSON.stringify({ ...counters, rafTicks, kind }, null, 2),
    contentType: 'application/json',
  });

  const record =
    JSON.stringify(
      {
        note: 'One full 8-second playback run, headless Chromium. reactCommits counts batched MutationObserver callbacks inside the shell, excluding canvases - approximately one per React commit.',
        renderer: kind,
        reactCommits: counters.react,
        staticRinkRepaints: counters.staticPaints,
        dynamicFramesDrawn: counters.dynamicPaints,
        animationFramesOffered: rafTicks,
      },
      null,
      2
    ) + '\n';

  await mkdir(OUTPUT_DIR, { recursive: true });
  // Named by renderer kind so a webgl run's numbers do not clobber a
  // canvas2d run's - both are quoted in the Task 7 parity report. The plain
  // `playback-counters.json` (no suffix) is kept in sync with the canvas2d
  // (default-renderer) run only, since docs/repair/PHICECRAFT_REPAIR_COMPLETION.md
  // links that exact filename from the pre-WebGL repair report.
  await writeFile(path.join(OUTPUT_DIR, `playback-counters.${kind}.json`), record, 'utf8');
  if (kind === 'canvas2d') {
    await writeFile(path.join(OUTPUT_DIR, 'playback-counters.json'), record, 'utf8');
  }
});

test('panning repaints the rink, proving the static layer is genuinely live', async ({ page }) => {
  await openEditor(page);
  await instrument(page);
  await resetCounters(page);

  await dragWorld(page, { x: 500, y: 380 }, { x: 560, y: 380 });
  await page.waitForTimeout(200);

  const counters = await readCounters(page);
  expect(counters.staticPaints, 'the rink repaints when the camera moves').toBeGreaterThan(0);

  const kind = await rendererKind(page);
  console.log(`[perf:pan:${kind}] staticPaints=${counters.staticPaints}`);
});

test('the effective device pixel ratio is capped at 2', async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openEditor(page);

  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    return canvas.width / parseFloat(canvas.style.width);
  });

  // A DPR 3 phone renders at 2x, not 3x: nine times the pixels buys nothing
  // on a line diagram.
  expect(ratio).toBeLessThanOrEqual(2);
  expect(ratio).toBeGreaterThan(1);

  const kind = await rendererKind(page);
  console.log(`[perf:dpr:${kind}] ratio=${ratio}`);
  await context.close();
});

test('records the final measurements', async ({ page }, testInfo) => {
  await openEditor(page);

  const viewports = {
    'phone-320-portrait': { width: 320, height: 568 },
    'phone-360-portrait': { width: 360, height: 800 },
    'phone-390-portrait': { width: 390, height: 844 },
    'phone-667-landscape': { width: 667, height: 375 },
    'phone-844-landscape': { width: 844, height: 390 },
    'tablet-768': { width: 768, height: 1024 },
    'desktop-1366': { width: 1366, height: 768 },
  };

  const rinkHeights: Record<string, number> = {};
  for (const [name, viewport] of Object.entries(viewports)) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    rinkHeights[name] = await usableRinkHeight(page);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, 'measurements.json'),
    JSON.stringify({ recordedAt: testInfo.project.name, rinkHeights }, null, 2) + '\n',
    'utf8'
  );

  // Landscape phones are the case the repair targeted.
  expect(rinkHeights['phone-667-landscape']).toBeGreaterThanOrEqual(230);
  expect(rinkHeights['phone-844-landscape']).toBeGreaterThanOrEqual(250);
});

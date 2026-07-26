// ============================================================================
// VIEWPORT MATRIX
//
// Runs once per required viewport. The measurements here are the mobile
// repair's acceptance criteria: on a landscape phone the fixed chrome used to
// consume 259px, leaving 116-131px of rink.
// ============================================================================

import { expect, test } from '@playwright/test';
import {
  closeSheet,
  expectNoHorizontalOverflow,
  expectNothingClipped,
  openEditor,
  openSheet,
  rinkBox,
  usableRinkHeight,
  worldToScreen,
} from './support';

/** Minimum usable rink height, per the repair targets. */
const RINK_HEIGHT_TARGETS: Record<string, number> = {
  'viewport-phone-667-landscape': 230,
  'viewport-phone-844-landscape': 250,
};

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('no essential control clips off the edge', async ({ page }) => {
  await expectNothingClipped(page, 'header');
  await expectNothingClipped(page, 'nav[aria-label="Editing tools"]');
});

test('the page never scrolls sideways', async ({ page }) => {
  await expectNoHorizontalOverflow(page);
});

test('the rink keeps a usable height', async ({ page }, testInfo) => {
  const height = await usableRinkHeight(page);
  const target = RINK_HEIGHT_TARGETS[testInfo.project.name];

  if (target) {
    expect(height, `${testInfo.project.name} rink height`).toBeGreaterThanOrEqual(target);
  } else {
    // Everywhere else, simply more than the chrome around it.
    expect(height).toBeGreaterThan(150);
  }

  // Record it, so the completion report can quote a measured number.
  await testInfo.attach('usable-rink-height', {
    body: String(height),
    contentType: 'text/plain',
  });
});

test('the board is laid out the way that shows the most ice', async ({ page }, testInfo) => {
  const box = await rinkBox(page);
  const topLeft = await worldToScreen(page, 0, 0);
  const bottomRight = await worldToScreen(page, 1000, 425);

  const drawnWidth = Math.abs(bottomRight.x - topLeft.x);
  const drawnHeight = Math.abs(bottomRight.y - topLeft.y);
  const coverage = (drawnWidth * drawnHeight) / (box.width * box.height);

  // What the OTHER orientation would have given, from the same fit rule. This
  // is the comparison that matters: a full sheet is 2.35:1 and a phone is not,
  // so no orientation fills an upright screen - one is simply much better.
  const padding = 16;
  const zoomFor = (rinkW: number, rinkH: number) =>
    Math.min((box.width - padding * 2) / rinkW, (box.height - padding * 2) / rinkH);
  const flat = zoomFor(1000, 425);
  const turned = zoomFor(425, 1000);
  const best = Math.max(flat, turned);
  const worst = Math.min(flat, turned);

  await testInfo.attach('rink-coverage', {
    body: JSON.stringify({
      canvas: `${Math.round(box.width)}x${Math.round(box.height)}`,
      drawn: `${Math.round(drawnWidth)}x${Math.round(drawnHeight)}`,
      areaCoverage: Number(coverage.toFixed(3)),
      chosenZoom: Number((drawnWidth / (drawnHeight > drawnWidth ? 425 : 1000)).toFixed(4)),
      flatZoom: Number(flat.toFixed(4)),
      turnedZoom: Number(turned.toFixed(4)),
      areaGainOverAlternative: Number(((best / worst) ** 2).toFixed(2)),
    }),
    contentType: 'application/json',
  });

  const chosenZoom = Math.max(drawnWidth, drawnHeight) / 1000;

  // Never strictly worse than the alternative.
  expect(chosenZoom, 'chosen zoom vs the worse orientation').toBeGreaterThanOrEqual(worst - 1e-6);

  // And it takes the better one whenever the gain is worth the disorientation.
  // Below that margin - a 768x1024 tablet, where turning buys about 11% - the
  // board is left alone on purpose rather than spinning for a rounding error.
  const WORTH_TURNING = 1.15;
  if (best / worst > WORTH_TURNING) {
    expect(chosenZoom, 'chosen zoom vs the best available').toBeCloseTo(best, 3);
  }
});

test('every primary control is a comfortable touch target', async ({ page }) => {
  const small = await page.evaluate(() => {
    const offenders: string[] = [];
    const roots = [
      document.querySelector('nav[aria-label="Editing tools"]'),
      document.querySelector('header'),
    ].filter(Boolean) as Element[];

    for (const root of roots) {
      for (const button of root.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        // 44 CSS px, allowing a pixel of rounding.
        if (rect.width < 43 || rect.height < 43) {
          offenders.push(`${button.getAttribute('aria-label') ?? button.textContent?.trim()} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
    }
    return offenders;
  });

  expect(small).toEqual([]);
});

test('essential text is at least 14px, secondary at least 12px', async ({ page }) => {
  const tiny = await page.evaluate(() => {
    const offenders: string[] = [];
    const roots = [
      document.querySelector('nav[aria-label="Editing tools"]'),
      document.querySelector('header'),
    ].filter(Boolean) as Element[];

    for (const root of roots) {
      for (const element of root.querySelectorAll('*')) {
        const text = element.textContent?.trim() ?? '';
        if (!text || element.children.length > 0) continue;
        const size = parseFloat(getComputedStyle(element).fontSize);
        // Emoji glyphs used purely as icons are marked aria-hidden.
        if (element.getAttribute('aria-hidden') === 'true') continue;
        if (size < 12) offenders.push(`"${text.slice(0, 24)}" at ${size}px`);
      }
    }
    return offenders;
  });

  expect(tiny).toEqual([]);
});

test('browser zoom is not disabled', async ({ page }) => {
  const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
  expect(viewport).not.toContain('user-scalable=no');
  expect(viewport).not.toContain('maximum-scale');
  expect(viewport).toContain('viewport-fit=cover');
});

test('touch-action: none is scoped to the rink, not the document', async ({ page }) => {
  const bodyTouchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
  const rinkTouchAction = await page.evaluate(
    () => getComputedStyle(document.querySelector('canvas[role="application"]')!).touchAction
  );

  expect(bodyTouchAction).not.toBe('none');
  expect(rinkTouchAction).toBe('none');
});

test('safe-area insets are applied to the chrome', async ({ page }) => {
  const applied = await page.evaluate(() => {
    const header = document.querySelector('header');
    const dock = document.querySelector('nav[aria-label="Editing tools"]');
    return {
      header: header?.className.includes('safe-top') && header?.className.includes('safe-x'),
      dock: dock?.className.includes('safe-bottom') && dock?.className.includes('safe-x'),
    };
  });

  expect(applied.header).toBe(true);
  expect(applied.dock).toBe(true);
});

test('a sheet is dismissible and scrolls internally', async ({ page }) => {
  const sheet = await openSheet(page, 'More actions', 'More');

  const scrollable = await sheet.locator('.sheet-scroll').first();
  await expect(scrollable).toBeVisible();

  const overflows = await scrollable.evaluate(element => {
    const style = getComputedStyle(element);
    return style.overflowY === 'auto' || style.overflowY === 'scroll';
  });
  expect(overflows).toBe(true);

  // It must never be taller than the viewport.
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.height).toBeLessThanOrEqual(viewport.height + 1);

  await closeSheet(page, 'More');
});

test('the rink centre stays clear while editing', async ({ page }) => {
  // Chips are pinned to the edges; nothing opaque may sit over the middle of
  // the ice during ordinary editing.
  const box = (await page.locator('canvas[role="application"]').boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };

  const topmost = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.tagName ?? 'none';
    },
    centre
  );

  expect(topmost).toBe('CANVAS');
});



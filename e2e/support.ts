// ============================================================================
// E2E SUPPORT
//
// Shared helpers. The important one is `openEditor`, which clears IndexedDB
// before the app boots so every spec starts from a known, empty library.
// ============================================================================

import { expect, type Page } from '@playwright/test';

export const RINK = 'canvas[role="application"]';

/**
 * Open the app with a clean local store.
 *
 * The database is deleted in an init script, which runs before any app code,
 * so there is no window where a previous spec's drills are visible.
 */
export async function openEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Init scripts run on EVERY navigation, including page.reload(). Guarding
    // on sessionStorage (which survives a reload but not a new context) means
    // the reset happens once per spec - otherwise a spec that reloads to prove
    // persistence would wipe the very data it is checking for.
    const FLAG = '__phicecraft_e2e_reset';
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, '1');
    } catch {
      /* a browser without sessionStorage still gets one reset per load */
    }
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

  await page.goto('/');
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Editing tools' })).toBeVisible();
  // Wait for the initial save so the library is in a known state.
  await expect(page.getByRole('status', { name: /^Save status:/ })).toHaveAccessibleName(
    /Saved|Unsaved/
  );
}

/** The rink's bounding box, for coordinate maths. */
export async function rinkBox(page: Page) {
  const box = await page.locator(RINK).boundingBox();
  if (!box) throw new Error('The rink is not visible');
  return box;
}

/** A point inside the rink, given as fractions of its box. */
export async function rinkPoint(page: Page, fx: number, fy: number) {
  const box = await rinkBox(page);
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

// ----------------------------------------------------------------------------
// World coordinates
//
// The rink is 1000x425 world units and the camera auto-fits it with 16px of
// padding until the user pans. These helpers reproduce that fit so a spec can
// address a player by where it is ON THE ICE rather than by guessing pixels.
// ----------------------------------------------------------------------------

const RINK_WIDTH = 1000;
const RINK_HEIGHT = 425;
const FIT_PADDING = 16;

export async function worldToScreen(page: Page, wx: number, wy: number) {
  const box = await rinkBox(page);
  const zoom = Math.min(
    (box.width - FIT_PADDING * 2) / RINK_WIDTH,
    (box.height - FIT_PADDING * 2) / RINK_HEIGHT
  );
  return {
    x: box.x + (box.width - RINK_WIDTH * zoom) / 2 + wx * zoom,
    y: box.y + (box.height - RINK_HEIGHT * zoom) / 2 + wy * zoom,
  };
}

/**
 * The default lineup, in world units. Home defends the LEFT net.
 * Derived from createDefaultPlayers(): centre ice is (500, 212.5) and one foot
 * of real ice is 5 world units.
 */
export const LINEUP = {
  home11: { x: 360, y: 212.5 },
  home13: { x: 280, y: 122.5 },
  home44: { x: 280, y: 302.5 },
  home5: { x: 190, y: 157.5 },
  home7: { x: 190, y: 267.5 },
  homeGoalie31: { x: 70, y: 212.5 },
  away87: { x: 640, y: 212.5 },
  away19: { x: 720, y: 122.5 },
  away71: { x: 720, y: 302.5 },
  awayGoalie1: { x: 930, y: 212.5 },
  emptyIce: { x: 500, y: 380 },
  rightNet: { x: 945, y: 212.5 },
} as const;

export async function clickWorld(page: Page, world: { x: number; y: number }): Promise<void> {
  const point = await worldToScreen(page, world.x, world.y);
  await page.mouse.click(point.x, point.y);
}

export async function dragWorld(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 16
): Promise<void> {
  const start = await worldToScreen(page, from.x, from.y);
  const end = await worldToScreen(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Several intermediate moves, so the gesture machine sees a drag rather
  // than a jump, and its per-frame coalescing gets a chance to run.
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/**
 * A two-finger pinch, released one finger at a time.
 *
 * This is the sequence that used to turn the second release into a tap.
 */
export async function pinchThenReleaseSequentially(
  page: Page,
  centre: { x: number; y: number },
  spread = 40
): Promise<void> {
  const point = await worldToScreen(page, centre.x, centre.y);
  const client = await page.context().newCDPSession(page);

  const touch = (type: string, points: { x: number; y: number }[]) =>
    client.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart' | 'touchMove' | 'touchEnd',
      touchPoints: points.map((p, index) => ({ x: p.x, y: p.y, id: index + 1 })),
    });

  const a = { x: point.x - spread, y: point.y };
  const b = { x: point.x + spread, y: point.y };

  await touch('touchStart', [a]);
  await touch('touchStart', [a, b]);
  await touch('touchMove', [
    { x: a.x - 20, y: a.y },
    { x: b.x + 20, y: b.y },
  ]);
  // First finger up: one pointer remains.
  await touch('touchEnd', [{ x: b.x + 20, y: b.y }]);
  // Second finger up: the release that used to become a tap.
  await touch('touchEnd', []);
  await client.detach();
}

export async function tapRink(page: Page, fx: number, fy: number): Promise<void> {
  const point = await rinkPoint(page, fx, fy);
  await page.mouse.click(point.x, point.y);
}

export async function dragOnRink(
  page: Page,
  from: { fx: number; fy: number },
  to: { fx: number; fy: number },
  steps = 12
): Promise<void> {
  const start = await rinkPoint(page, from.fx, from.fy);
  const end = await rinkPoint(page, to.fx, to.fy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/** Open a sheet from the tool dock or top strip and wait for it. */
export async function openSheet(page: Page, opener: string, title: string) {
  await page.getByRole('button', { name: opener }).click();
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function closeSheet(page: Page, title: string): Promise<void> {
  const sheet = page.getByRole('dialog', { name: title });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
}

/** Confirm the currently open destructive dialog. */
export async function confirmDialog(page: Page, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
}

/** How many CSS pixels of rink the layout actually leaves for the ice. */
export async function usableRinkHeight(page: Page): Promise<number> {
  const box = await rinkBox(page);
  return Math.round(box.height);
}

/** Assert the page itself never scrolls sideways. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/** Assert every visible element in `root` is inside the viewport horizontally. */
export async function expectNothingClipped(page: Page, selector: string): Promise<void> {
  const clipped = await page.evaluate(sel => {
    const root = document.querySelector(sel);
    if (!root) return ['missing root'];
    const width = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const element of root.querySelectorAll('button, a, input, [role="button"]')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.left < -1 || rect.right > width + 1) {
        offenders.push(`${element.tagName}.${element.className}`.slice(0, 80));
      }
    }
    return offenders;
  }, selector);

  expect(clipped, `clipped controls in ${selector}`).toEqual([]);
}

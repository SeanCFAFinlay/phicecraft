// ============================================================================
// E2E SUPPORT
//
// Shared helpers. The important one is `openEditor`, which clears IndexedDB
// before the app boots so every spec starts from a known, empty library.
// ============================================================================

import { expect, type Page } from '@playwright/test';
import { projectToV2 } from '@/domain/v3/projectToV2';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import type { Drill } from '@/core/types';

export const RINK = 'canvas[role="application"]';

// ----------------------------------------------------------------------------
// Storage
//
// Storage keeps the authored v3 document (metadata, actors, puck tracks, ...);
// the app's editor, engine and these specs all still speak the flat v2 shape
// (`players`, `skatePaths`, `events`) - see `src/domain/v3/projectToV2.ts` for
// the seam that bridges the two. Reading a raw record straight off IndexedDB
// and casting it to the v2 shape (what these specs used to do) stopped working
// the moment storage moved to v3; this runs it back through the same
// projection the app itself uses, so a spec asserts on what a coach actually
// sees rather than on the wire format underneath it.
// ----------------------------------------------------------------------------

interface StoredRecord {
  id: string;
  name: string;
  document: Drill;
}

async function rawDrillRecords(page: Page): Promise<{ id: string; name: string; document: DrillDocumentV3 }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
          all.onsuccess = () => {
            resolve(all.result);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      })
  );
}

/** Every stored drill, projected to the v2 shape the app and these specs assert on. */
export async function storedDrills(page: Page): Promise<StoredRecord[]> {
  const raw = await rawDrillRecords(page);
  return raw.map(record => ({
    id: record.id,
    name: record.name,
    document: projectToV2(record.document).drill,
  }));
}

/** The first stored drill's projected document - most specs only ever have one. */
export async function storedDrill(page: Page): Promise<Drill> {
  const [first] = await storedDrills(page);
  return first.document;
}

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

/**
 * Dismiss the first-run hint, if it is showing.
 *
 * A fresh e2e context has no `phicecraft.firstRunHintDone` in localStorage, so
 * the three-step hint chip appears in build mode the moment a new drill has
 * no drawn routes yet - which is every spec that opens a fresh editor and
 * has not yet drawn one. It shares the same top-of-rink lane as the pending
 * action chip, so a spec whose first taps land near there should dismiss it
 * first rather than risk the tap landing on the hint instead of the rink.
 */
export async function dismissFirstRunHint(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss hint' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    await expect(dismiss).toBeHidden();
  }
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

/**
 * Whether the board is turned a quarter turn for this viewport.
 *
 * This mirrors `fitsBetterRotated` in `src/camera/cameraMath.ts`. The helper
 * deliberately reproduces the app's fit rather than importing it, so that a
 * change to the real maths shows up as a FAILING test here rather than as two
 * copies quietly agreeing with each other. If these ever disagree, the specs
 * that address the rink by world coordinate stop landing where they aim.
 */
function boardIsVertical(box: { width: number; height: number }): boolean {
  const flat = Math.min(
    (box.width - FIT_PADDING * 2) / RINK_WIDTH,
    (box.height - FIT_PADDING * 2) / RINK_HEIGHT
  );
  const turned = Math.min(
    (box.width - FIT_PADDING * 2) / RINK_HEIGHT,
    (box.height - FIT_PADDING * 2) / RINK_WIDTH
  );
  return turned > flat * 1.15;
}

export async function worldToScreen(page: Page, wx: number, wy: number) {
  const box = await rinkBox(page);
  const vertical = boardIsVertical(box);

  // Turned, the rink's long axis runs DOWN the screen, so its footprint is
  // 425 wide by 1000 tall and the rotation has to be applied about the rink
  // centre exactly as `cameraMatrix` does.
  const zoom = vertical
    ? Math.min(
        (box.width - FIT_PADDING * 2) / RINK_HEIGHT,
        (box.height - FIT_PADDING * 2) / RINK_WIDTH
      )
    : Math.min(
        (box.width - FIT_PADDING * 2) / RINK_WIDTH,
        (box.height - FIT_PADDING * 2) / RINK_HEIGHT
      );

  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const dx = wx - RINK_WIDTH / 2;
  const dy = wy - RINK_HEIGHT / 2;

  // rotation = -90deg: (dx, dy) -> (dy, -dx)
  const rx = vertical ? dy : dx;
  const ry = vertical ? -dx : dy;

  return { x: centreX + rx * zoom, y: centreY + ry * zoom };
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

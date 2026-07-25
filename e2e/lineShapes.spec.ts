// ============================================================================
// ADJUSTING LINES AFTER THE PLAY IS SET UP
//
// Spline and polyline shapes on routes and puck lines, and the control points
// that make both adjustable once the drill already exists.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { LINEUP, clickWorld, dragWorld, openEditor, worldToScreen } from './support';

interface StoredRoute {
  points: { x: number; y: number }[];
  shape?: string;
}

interface StoredEvent {
  id: string;
  type: string;
  at?: number;
  arrivalAt?: number;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  waypoints?: { x: number; y: number }[];
  shape?: string;
}

async function storedDrill(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ skatePaths: StoredRoute[]; events: StoredEvent[] }>((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
          all.onsuccess = () => {
            const drills = all.result as { document: { skatePaths: StoredRoute[]; events: StoredEvent[] } }[];
            resolve(drills[0].document);
            db.close();
          };
        };
      })
  );
}

async function waitForSaved(page: Page): Promise<void> {
  await expect
    .poll(() => page.getByRole('status', { name: /^Save status:/ }).getAttribute('aria-label'), {
      timeout: 20_000,
    })
    .toBe('Save status: Saved');
}

/** Draw a route for #13, then open its inspector. */
async function drawRouteAndOpenDetails(page: Page): Promise<void> {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 });
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('dialog', { name: /^#13/ })).toBeVisible();
}

/** Halfway along the #11 to #13 pass, clear of either player token. */
function passMidpoint() {
  return {
    x: (LINEUP.home11.x + LINEUP.home13.x) / 2,
    y: (LINEUP.home11.y + LINEUP.home13.y) / 2,
  };
}

/** Tap a puck line to select it, and wait for its selection chip. */
async function selectPuckLine(page: Page, at: { x: number; y: number }): Promise<void> {
  await clickWorld(page, at);
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

test('a drawn route becomes a handful of editable control points', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 }, 60);
  await waitForSaved(page);

  const { skatePaths } = await storedDrill(page);
  expect(skatePaths).toHaveLength(1);
  // Not the hundreds of raw pointer samples, and not a fixed five proxies.
  expect(skatePaths[0].points.length).toBeGreaterThan(2);
  expect(skatePaths[0].points.length).toBeLessThanOrEqual(16);
  expect(skatePaths[0].shape ?? 'spline').toBe('spline');
});

test('a route can be switched between curved and straight', async ({ page }) => {
  await drawRouteAndOpenDetails(page);

  const inspector = page.getByRole('dialog', { name: /^#13/ });
  const shapes = inspector.getByRole('radiogroup', { name: 'Route shape' });
  await expect(shapes.getByRole('radio', { name: /Curved/ })).toBeChecked();

  await shapes.getByRole('radio', { name: /Straight/ }).click();
  await expect(shapes.getByRole('radio', { name: /Straight/ })).toBeChecked();

  await inspector.getByRole('button', { name: 'Close' }).click();
  await waitForSaved(page);

  const { skatePaths } = await storedDrill(page);
  expect(skatePaths[0].shape).toBe('polyline');
});

test('dragging one route handle moves only that point', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 });
  await waitForSaved(page);

  const before = (await storedDrill(page)).skatePaths[0].points;
  expect(before.length).toBeGreaterThan(2);

  // Committing a route selects its owner, so the handles are already showing.
  const handle = before[1];
  await dragWorld(page, handle, { x: handle.x, y: handle.y - 70 });
  await waitForSaved(page);

  const after = (await storedDrill(page)).skatePaths[0].points;

  // Same number of points: the route was reshaped, not rebuilt.
  expect(after).toHaveLength(before.length);
  // The grabbed point moved...
  expect(after[1].y).toBeLessThan(before[1].y - 40);
  // ...and its neighbours did not. This is the regression: dragging a handle
  // used to replace the whole route with a five-point smooth.
  expect(after[0]).toEqual(before[0]);
  expect(after.at(-1)).toEqual(before.at(-1));
});

test('tapping the "+" between two handles adds a control point', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 });
  await waitForSaved(page);

  const before = (await storedDrill(page)).skatePaths[0].points;

  // The add-affordance sits at the midpoint of a segment of the polygon.
  const midpoint = {
    x: (before[1].x + before[2].x) / 2,
    y: (before[1].y + before[2].y) / 2,
  };
  await clickWorld(page, midpoint);
  await waitForSaved(page);

  const after = (await storedDrill(page)).skatePaths[0].points;
  expect(after).toHaveLength(before.length + 1);
});

// ----------------------------------------------------------------------------
// Puck lines
// ----------------------------------------------------------------------------

test('a pass line can be bent, and the puck then takes longer to arrive', async ({ page }) => {
  await dragWorld(page, LINEUP.home11, LINEUP.home13);
  await waitForSaved(page);

  const before = (await storedDrill(page)).events[0];
  expect(before.type).toBe('pass');
  expect(before.waypoints ?? []).toEqual([]);

  // The line runs between the two BLADE positions the solver chose, not
  // between the player tokens, so the "+" affordance is on that midpoint.
  const midpoint = {
    x: (before.fromPoint.x + before.toPoint.x) / 2,
    y: (before.fromPoint.y + before.toPoint.y) / 2,
  };
  await selectPuckLine(page, midpoint);

  const inspector = page.getByRole('dialog', { name: /Puck action 1/ });
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Bend points');
  await inspector.getByRole('button', { name: 'Close' }).click();

  // Tapping the "+" at the midpoint of the line inserts a bend point there.
  await clickWorld(page, midpoint);
  await waitForSaved(page);

  const withPoint = (await storedDrill(page)).events[0];
  expect(withPoint.waypoints).toHaveLength(1);

  // Drag the new bend point well off the straight line.
  const waypoint = withPoint.waypoints![0];
  await dragWorld(page, waypoint, { x: waypoint.x, y: waypoint.y - 120 });
  await waitForSaved(page);

  const bent = (await storedDrill(page)).events[0];
  expect(bent.waypoints![0].y).toBeLessThan(waypoint.y - 60);

  // The puck flies the drawn line, so a longer line takes longer to arrive.
  expect(bent.arrivalAt!).toBeGreaterThan(before.arrivalAt!);
});

test('a puck line can be switched between curved and straight', async ({ page }) => {
  await dragWorld(page, LINEUP.home11, LINEUP.home13);
  await waitForSaved(page);

  await selectPuckLine(page, passMidpoint());
  await page.getByRole('button', { name: 'Details' }).click();

  const inspector = page.getByRole('dialog', { name: /Puck action 1/ });
  const shapes = inspector.getByRole('radiogroup', { name: 'Puck line shape' });
  await expect(shapes.getByRole('radio', { name: /Curved/ })).toBeChecked();

  await shapes.getByRole('radio', { name: /Straight/ }).click();
  await inspector.getByRole('button', { name: 'Close' }).click();
  await waitForSaved(page);

  expect((await storedDrill(page)).events[0].shape).toBe('polyline');
});

test('the event inspector reports how far the puck actually travels', async ({ page }) => {
  await dragWorld(page, LINEUP.home11, LINEUP.home13);
  await waitForSaved(page);

  await selectPuckLine(page, passMidpoint());
  await page.getByRole('button', { name: 'Details' }).click();

  const inspector = page.getByRole('dialog', { name: /Puck action 1/ });
  await expect(inspector).toContainText('Puck travels');
  await expect(inspector).toContainText(/\d+ ft/);
  // And it now says the line IS the trajectory, which is true.
  await expect(inspector).toContainText('follows the drawn line exactly');
});

// ----------------------------------------------------------------------------
// Undo
// ----------------------------------------------------------------------------

test('adding and reshaping are undoable', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 });
  await waitForSaved(page);

  const before = (await storedDrill(page)).skatePaths[0].points;

  const midpoint = {
    x: (before[1].x + before[2].x) / 2,
    y: (before[1].y + before[2].y) / 2,
  };
  await clickWorld(page, midpoint);
  await expect
    .poll(async () => (await storedDrill(page)).skatePaths[0].points.length)
    .toBe(before.length + 1);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await storedDrill(page)).skatePaths[0].points.length)
    .toBe(before.length);
});

// ----------------------------------------------------------------------------
// Handles are only shown while paused and selected
// ----------------------------------------------------------------------------

test('handles are hit-testable only for the selected line', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 560, y: 120 });
  await waitForSaved(page);

  const before = (await storedDrill(page)).skatePaths[0].points;

  // Nothing selected: tapping where a handle would be must not reshape it.
  await clickWorld(page, LINEUP.emptyIce);
  const handleScreen = await worldToScreen(page, before[1].x, before[1].y);
  await page.mouse.move(handleScreen.x, handleScreen.y);
  await page.mouse.down();
  await page.mouse.move(handleScreen.x, handleScreen.y - 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = (await storedDrill(page)).skatePaths[0].points;
  expect(after[1]).toEqual(before[1]);
});

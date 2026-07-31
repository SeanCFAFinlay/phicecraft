// ============================================================================
// VISUAL REGRESSION
//
// Deterministic captures of every required state. Motion is disabled by the
// project config, the drill is a fixed fixture, and the playhead is parked at
// a fixed progress, so two runs on the same platform produce the same pixels.
//
// Baselines are per-platform (Playwright suffixes them), and this repo carries
// the ones generated on the machine the repair was done on. See
// docs/repair/PHICECRAFT_REPAIR_COMPLETION.md for why this project is run
// separately from CI.
//
// `visual-webgl-shell` (Phase 3 Task 5) reuses this same file rather than a
// duplicate: it opens the fixture with `?renderer=webgl` and keeps only
// "flat rink, default view" - the WebGL rink scene's own baseline, in its own
// directory (`e2e/__screenshots__/visual-webgl-shell`), never diffed against
// the Canvas2D one above. Everything else in this file is skipped for that
// project; a later task (the dynamic-layer port) grows the WebGL list.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { LINEUP, clickWorld, dismissFirstRunHint, dragWorld } from './support';

const WEBGL_PROJECT = 'visual-webgl-shell';
const WEBGL_ONLY_TEST = 'flat rink, default view';

function isWebglProject(): boolean {
  return test.info().project.name === WEBGL_PROJECT;
}

// Playwright requires the first parameter to be an object-destructuring
// pattern (it's how it detects which fixtures a hook needs) even when none
// are used, which is exactly what `no-empty-pattern` flags.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name === WEBGL_PROJECT && testInfo.title !== WEBGL_ONLY_TEST) {
    testInfo.skip();
  }
});

/**
 * A fixed drill, written straight into storage, so nothing about the capture
 * depends on generated IDs or the clock.
 */
const FIXTURE = {
  schemaVersion: 2,
  id: 'visual-fixture',
  name: 'Visual Fixture',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  players: [
    { id: 'h1', x: 360, y: 212.5, team: 'home', number: '11', role: 'C', hasPuck: true, visual: { handedness: 'right', visor: true } },
    { id: 'h2', x: 280, y: 122.5, team: 'home', number: '13', role: 'LW', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'h3', x: 190, y: 267.5, team: 'home', number: '5', role: 'D', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'a1', x: 640, y: 212.5, team: 'away', number: '87', role: 'C', hasPuck: false, visual: { handedness: 'left', visor: true } },
    { id: 'g1', x: 70, y: 212.5, team: 'home', number: '31', role: 'G', hasPuck: false, visual: { handedness: 'right', visor: false } },
  ],
  skatePaths: [
    {
      id: 'r1',
      ownerId: 'h2',
      team: 'home',
      mode: 'skate',
      finish: 'stop',
      points: [
        { x: 280, y: 122.5 },
        { x: 420, y: 110 },
        { x: 560, y: 140 },
      ],
    },
  ],
  events: [],
  coaches: [],
  settings: {
    assistance: 'standard',
    recovery: 'nearest-teammate',
    timeLimitSeconds: 8,
    reducedEffects: true,
  },
};

/** Seed a fixture before the app boots, and open it. */
async function openFixture(page: Page, overrides: Partial<typeof FIXTURE> = {}): Promise<void> {
  const seeded = { ...FIXTURE, ...overrides };
  await page.addInitScript(fixture => {
    const FLAG = '__phicecraft_visual_seeded';
    if (sessionStorage.getItem(FLAG)) return;
    sessionStorage.setItem(FLAG, '1');

    indexedDB.deleteDatabase('phicecraft');
    const open = indexedDB.open('phicecraft', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      const drills = db.createObjectStore('drills', { keyPath: 'id' });
      drills.createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('meta');
      db.createObjectStore('recovery', { keyPath: 'id' });
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['drills', 'meta'], 'readwrite');
      tx.objectStore('drills').put({
        id: fixture.id,
        name: fixture.name,
        updatedAt: fixture.updatedAt,
        document: fixture,
      });
      tx.objectStore('meta').put(fixture.id, 'currentDrillId');
      tx.objectStore('meta').put(fixture.updatedAt, 'legacyMigrationCompletedAt');
      tx.oncomplete = () => db.close();
    };
  }, seeded);

  const webgl = isWebglProject();
  await page.goto(webgl ? '/?renderer=webgl' : '/');
  await expect(page.getByRole('button', { name: /^Play name: Visual Fixture/ })).toBeVisible();
  // The fixture has a route but no puck events, so the first-run hint would
  // otherwise sit in the same top-of-rink lane as the tabletop toggle and the
  // pending-action chip, on a fresh context's empty localStorage. A visual
  // baseline should show the steady-state chrome, not a coach's first-run
  // nudge, so it is dismissed before anything is captured.
  await dismissFirstRunHint(page);
  if (webgl) {
    // `selectRenderer` dynamic-imports the WebGL chunk and waits on two Pixi
    // renderers' own async `init()` before its first frame lands - a fixed
    // timeout here was flaky under load (a screenshot taken before the first
    // `drawStatic()`/`drawDynamic()` call landed captured a blank canvas).
    // `window.__phicecraftPaint` (paintCounters.ts) is the same renderer-
    // agnostic paint signal perf.spec.ts already relies on, so this waits on
    // actual evidence of a first paint instead of guessing how long one takes.
    await page.waitForFunction(() => {
      const paint = window.__phicecraftPaint;
      return !!paint && paint.staticPaints > 0 && paint.dynamicPaints > 0;
    });
    // Paint counts alone can't tell a genuine WebGL capture from a silent
    // Canvas2D degrade (the webgl2 probe or the chunk import can fail, and
    // selectRenderer falls back to a Canvas2DRenderer that paints just fine).
    // Without this, a future --update-snapshots run could write a Canvas2D
    // screenshot straight into this WebGL-only baseline directory without
    // anything failing first. `window.__phicecraftPaint.kind` (paintCounters.ts)
    // records which BoardRenderer actually won selection.
    const kind = await page.evaluate(() => window.__phicecraftPaint?.kind);
    expect(kind, 'the active renderer for this capture').toBe('webgl');
  }
  // Let the sprite atlas settle onto its final frame.
  await page.waitForTimeout(600);
}

const SHOT_OPTIONS = { animations: 'disabled' as const, caret: 'hide' as const };

test('flat rink, default view', async ({ page }) => {
  await openFixture(page);
  await expect(page).toHaveScreenshot('flat-rink.png', SHOT_OPTIONS);
});

test('tabletop rink', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: /tabletop 3D view/ }).click();
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot('tabletop-rink.png', SHOT_OPTIONS);
});

test('selected player chip', async ({ page }) => {
  await openFixture(page);
  await clickWorld(page, { x: 360, y: 212.5 });
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();
  await expect(page).toHaveScreenshot('selected-player-chip.png', SHOT_OPTIONS);
});

test('active pass action', async ({ page }) => {
  await openFixture(page);
  await clickWorld(page, { x: 360, y: 212.5 });
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' })
    .click();
  await expect(page.getByText('Pass from #11')).toBeVisible();
  await expect(page).toHaveScreenshot('active-pass-action.png', SHOT_OPTIONS);
});

test('active route action', async ({ page }) => {
  await openFixture(page);
  await clickWorld(page, { x: 190, y: 267.5 });
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Skate' })
    .click();
  await expect(page.getByText('Route for #5')).toBeVisible();
  await expect(page).toHaveScreenshot('active-route-action.png', SHOT_OPTIONS);
});

test('player inspector sheet', async ({ page }) => {
  await openFixture(page);
  await clickWorld(page, { x: 360, y: 212.5 });
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('dialog', { name: /^#11/ })).toBeVisible();
  await expect(page).toHaveScreenshot('player-inspector.png', SHOT_OPTIONS);
});

test('compact playback', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByRole('progressbar', { name: 'Playback position' })).toBeVisible();
  await expect(page.locator('body')).toHaveScreenshot('compact-playback.png', SHOT_OPTIONS);
});

test('expanded playback sheet', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  await expect(page.getByRole('dialog', { name: 'Playback' })).toBeVisible();
  await expect(page).toHaveScreenshot('expanded-playback.png', SHOT_OPTIONS);
});

test('validation blocked state', async ({ page }) => {
  // Two puck events whose timings overlap: the second leaves before the first
  // has arrived, which is a blocking mechanics error.
  await openFixture(page, {
    events: [
      {
        id: 'e1',
        type: 'pass',
        fromPlayerId: 'h1',
        toPlayerId: 'h2',
        fromPoint: { x: 360, y: 212.5 },
        toPoint: { x: 420, y: 110 },
        team: 'home',
        at: 0.5,
        arrivalAt: 0.9,
      },
      {
        id: 'e2',
        type: 'pass',
        fromPlayerId: 'h2',
        toPlayerId: 'h3',
        fromPoint: { x: 420, y: 110 },
        toPoint: { x: 190, y: 267.5 },
        team: 'home',
        at: 0.15,
        arrivalAt: 0.3,
      },
    ],
  } as Partial<typeof FIXTURE>);

  await page.getByRole('button', { name: 'Play drill' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveScreenshot('validation-blocked.png', SHOT_OPTIONS);
});

test('save failure state', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patched(...args: unknown[]) {
      if (String(args[0]).includes('drills') && args[1] === 'readwrite') {
        throw Object.assign(new Error('injected'), { name: 'QuotaExceededError' });
      }
      return original.apply(this, args as never);
    } as typeof IDBDatabase.prototype.transaction;
  });

  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'Save play' }).click();
  await page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Save failed' }).first()).toBeVisible();
  await expect(page).toHaveScreenshot('save-failure.png', SHOT_OPTIONS);
});

test('main menu sheet', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await expect(page.getByRole('dialog', { name: 'PhiceCraft' })).toBeVisible();
  await expect(page).toHaveScreenshot('main-menu.png', SHOT_OPTIONS);
});

test('drawn route on the rink', async ({ page }) => {
  await openFixture(page);
  await dragWorld(page, LINEUP.home5, { x: 420, y: 300 });
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot('drawn-route.png', SHOT_OPTIONS);
});

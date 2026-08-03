// ============================================================================
// PLAYWRIGHT
//
// One Chromium project per required viewport. The viewport matrix is the point
// of this suite: the shell has to survive 320px and a 375px-tall landscape
// phone, not just a desktop window.
// ============================================================================

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The required viewports, named so failures say which one broke. */
export const VIEWPORTS = {
  'phone-320-portrait': { width: 320, height: 568 },
  'phone-360-portrait': { width: 360, height: 800 },
  'phone-390-portrait': { width: 390, height: 844 },
  'phone-667-landscape': { width: 667, height: 375 },
  'phone-844-landscape': { width: 844, height: 390 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1366': { width: 1366, height: 768 },
} as const;

// WebGL became the default renderer on 2026-07-31 (docs/v2/PROGRESS.md,
// Phase 3), so a DEFAULT local run (no `RENDERER` env set) now creates a real
// (or headless-software) WebGL2 context per test, same as an explicit
// `RENDERER=webgl` run always did. Running the full functional matrix at this
// repo's previous uncapped local worker count (one Chromium instance per CPU
// core) creates enough concurrent GPU-context-creation contention to
// occasionally miss this suite's own timeouts - reproduced locally as a
// handful of scattered, non-reproducing-in-isolation failures across
// different projects (flows, puck-actions, line-shapes, viewport-*) on
// consecutive full runs, the same class already documented for
// `visual-webgl-shell`/`board3d`'s own `--workers=1` invocations.
// Capping local workers to match CI's own cap eliminated it across repeated
// full-matrix runs. `RENDERER=canvas2d` runs are exempt: Canvas2D never opens
// a GPU context, so there is nothing to contend over and no reason to give up
// the parallelism.
const LOCAL_WORKERS = process.env.RENDERER === 'canvas2d' ? undefined : 2;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : LOCAL_WORKERS,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['list']],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Font rendering differs slightly between machines; the assertions here
      // are about layout, not sub-pixel text.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Deterministic rendering for the visual comparisons.
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },

  projects: [
    // The functional flows only need to run once; they are viewport-agnostic.
    {
      name: 'flows',
      testMatch: /flows\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Installable, and genuinely usable with the network gone.
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Finding a drill: search, filters, favourites and use-as-template.
    {
      name: 'library',
      testMatch: /library\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Pass, Shoot and Move: reachability, chaining and the four-pass cap.
    {
      name: 'puck-actions',
      testMatch: /puckActions\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Adjusting a route or puck line after the play is set up.
    {
      name: 'line-shapes',
      testMatch: /lineShapes\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Mobile flows exercise the phone-specific disclosure model.
    {
      name: 'mobile-flows',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS['phone-390-portrait'],
        hasTouch: true,
        isMobile: true,
      },
    },
    // The viewport matrix, one project per size.
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name: `viewport-${name}`,
      testMatch: /viewports\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        hasTouch: viewport.width < 1024,
      },
    })),
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // Visual baselines are per-platform. The committed ones were generated on
    // the machine the repair was done on, so this project is run explicitly
    // (`npm run test:visual`) rather than as part of the default suite.
    ...Object.entries({
      shell: VIEWPORTS['desktop-1366'],
      'phone-portrait': VIEWPORTS['phone-390-portrait'],
      'phone-landscape': VIEWPORTS['phone-844-landscape'],
    }).map(([name, viewport]) => ({
      name: `visual-${name}`,
      testMatch: /visual\.spec\.ts/,
      snapshotPathTemplate: `e2e/__screenshots__/{projectName}/{arg}{ext}`,
      use: { ...devices['Desktop Chrome'], viewport, hasTouch: viewport.width < 1024 },
    })),
    // The WebGL renderer's own baseline (Phase 3 Task 5, grown to the full
    // scenario set in Task 6 alongside the dynamic-layer port) - its own
    // directory, its own capture, never diffed against the Canvas2D baseline
    // (a different pipeline is expected to differ, deliberately).
    //
    // `npm run test:visual` runs this project in its OWN `playwright test`
    // invocation with `--workers=1`, after the Canvas2D visual projects
    // finish: real GPU context creation (even the software one headless
    // Chromium falls back to) is expensive enough that launching several
    // Chromium instances at once starves it - under contention the async
    // WebGL init this test waits on (`selectRenderer`'s dynamic import + two
    // Pixi renderers' own `init()`) can miss the test timeout entirely rather
    // than merely running slower.
    {
      name: 'visual-webgl-shell',
      testMatch: /visual\.spec\.ts/,
      snapshotPathTemplate: `e2e/__screenshots__/{projectName}/{arg}{ext}`,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    // True 3D is the unconditional tabletop presentation (Phase 4 Task 6) -
    // a real Chromium tab, no screenshot baseline (that's visual.spec.ts's
    // 'tabletop rink' scenario). Grouped with the other functional projects,
    // not the visual ones: it asserts on the Board3D mount/unmount contract,
    // its own readiness counters and pixel content, not on layout pixels that
    // drift per platform. Same real-GPU-context rationale as the pseudo-3D
    // project this replaces: run with its own `--workers=1` invocation.
    {
      name: 'board3d',
      testMatch: /board3d\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['desktop-1366'] },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      // Motion is deliberately NOT reduced here: the point is to measure the
      // real playback loop.
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS['desktop-1366'],
        reducedMotion: 'no-preference',
      },
    },
  ],

  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

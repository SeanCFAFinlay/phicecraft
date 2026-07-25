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

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
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

// ============================================================================
// SPRITE-ATLAS BAKE
//
// Regenerates assets-src/hockey-sprite-atlas.png from the repo's own rigged
// GLB models (public/assets/models/hockey_player.glb, hockey_goalie.glb)
// instead of the unknown-provenance photographic crops it used to contain
// (docs/licenses/ASSET_REGISTER.md, "Open blockers" item 2).
//
// Method: launch a headless Playwright Chromium tab, serve a tiny virtual
// origin (https://bake.local/) via page.route with the harness page
// (bake-sprites-page.html), three.js itself, the GLTFLoader addon, and the
// two GLBs - nothing here touches the real network. The page's
// `window.bake(spec)` loads a GLB, tints its `jersey`/`accent` materials,
// poses it at a fixed animation sample time, frames it with an orthographic
// top-down camera and renders a transparent PNG. This script calls it once
// per (model, team) pair - four renders total - then uses sharp to composite
// each render into the atlas at the exact region rect and anchor pixel
// `HOCKEY_SPRITES` (src/canvas/HockeySpriteAtlas.ts) already defines, so no
// consumer of that contract (SkaterRenderer/GoalieRenderer, spriteAtlas.ts)
// needs to change.
//
// Determinism: every input to a render (clip sample time, lights, camera,
// tint hex) is a fixed literal below - no randomness, no wall-clock, no
// viewport-dependent layout. Two consecutive `node scripts/bake-sprites.mjs`
// runs are expected to produce pixel-identical composites; see the bottom of
// this file for the self-check this script runs when invoked with
// `--verify-determinism`.
//
// Run with `node scripts/bake-sprites.mjs`, then `npm run assets:optimize` to
// regenerate the shipped webp.
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_PATH = path.join(root, 'scripts', 'bake-sprites-page.html');
const THREE_BUILD_DIR = path.join(root, 'node_modules', 'three', 'build');
const JSM_DIR = path.join(root, 'node_modules', 'three', 'examples', 'jsm');
const MODELS_DIR = path.join(root, 'public', 'assets', 'models');
const OUTPUT_PATH = path.join(root, 'assets-src', 'hockey-sprite-atlas.png');
const ATLAS_SOURCE_TS = path.join(root, 'src', 'canvas', 'HockeySpriteAtlas.ts');

const ORIGIN = 'https://bake.local';

// ----------------------------------------------------------------------------
// The atlas contract. Mirrors src/canvas/HockeySpriteAtlas.ts's `HOCKEY_SPRITES`
// exactly - this script cannot `import` the .ts source directly (it runs as
// plain node ESM, no TS loader), so `assertMatchesSourceOfTruth()` below reads
// that file as text and cross-checks every number against these literals, so
// a future edit to the real contract fails this script loudly instead of
// silently baking into the wrong rects.
// ----------------------------------------------------------------------------
const HOCKEY_SPRITES = {
  homeSkater: { x: 0, y: 60, width: 470, height: 440, anchorX: 285, anchorY: 220 },
  awaySkater: { x: 627, y: 60, width: 470, height: 440, anchorX: 280, anchorY: 220 },
  homeGoalie: { x: 20, y: 680, width: 510, height: 450, anchorX: 260, anchorY: 220 },
  awayGoalie: { x: 647, y: 680, width: 510, height: 450, anchorX: 255, anchorY: 220 },
};
const ATLAS_WIDTH = 1157;
const ATLAS_HEIGHT = 1130;

// Team defaults, matching SkaterRenderer.ts / GoalieRenderer.ts's own
// `defaultHex` literals - the sprite atlas has to depict the same jerseys the
// Canvas2D vector fallback draws, or the atlas/fallback swap becomes visible.
const TEAM_JERSEY = { home: '#e63946', away: '#2f80ed' };

/** A ~20% darker variant of `hex`, used for the `accent` (trim) material. */
function darken(hex, factor = 0.8) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

// Supersample factor: renders happen at this multiple of the final region
// pixel size, then sharp downsamples - cheap anti-aliasing insurance beyond
// whatever the WebGL context itself provides.
const SUPERSAMPLE = 2;

// Camera framing, tuned by eye against the preview PNGs this script writes
// (assets-src/bake-preview-*.png, gitignored): steep-but-not-vertical so the
// stick and stride read as more than a flat silhouette. The frame itself is
// sized per-pose by the harness page's two-pass measure-then-render (see
// bake-sprites-page.html) rather than a fixed pad factor here, since the
// T-pose bounding box is a poor proxy for a mid-stride skate or a crouched
// goalie idle.
const SKATER_CAMERA = { tiltDeg: 22, yawDeg: 35, fillFraction: 0.8 };
const GOALIE_CAMERA = { tiltDeg: 20, yawDeg: 30, fillFraction: 0.8 };

const VARIANTS = [
  {
    name: 'homeSkater',
    region: HOCKEY_SPRITES.homeSkater,
    modelUrl: '/models/hockey_player.glb',
    clipName: 'skate',
    sampleFraction: 0.4,
    jerseyHex: TEAM_JERSEY.home,
    accentHex: darken(TEAM_JERSEY.home),
    camera: SKATER_CAMERA,
  },
  {
    name: 'awaySkater',
    region: HOCKEY_SPRITES.awaySkater,
    modelUrl: '/models/hockey_player.glb',
    clipName: 'skate',
    sampleFraction: 0.4,
    jerseyHex: TEAM_JERSEY.away,
    accentHex: darken(TEAM_JERSEY.away),
    camera: SKATER_CAMERA,
  },
  {
    name: 'homeGoalie',
    region: HOCKEY_SPRITES.homeGoalie,
    modelUrl: '/models/hockey_goalie.glb',
    clipName: 'goalie_idle',
    sampleFraction: 0,
    jerseyHex: TEAM_JERSEY.home,
    accentHex: darken(TEAM_JERSEY.home),
    camera: GOALIE_CAMERA,
  },
  {
    name: 'awayGoalie',
    region: HOCKEY_SPRITES.awayGoalie,
    modelUrl: '/models/hockey_goalie.glb',
    clipName: 'goalie_idle',
    sampleFraction: 0,
    jerseyHex: TEAM_JERSEY.away,
    accentHex: darken(TEAM_JERSEY.away),
    camera: GOALIE_CAMERA,
  },
];

/**
 * Cross-checks the literal `HOCKEY_SPRITES`/`ATLAS_WIDTH`/`ATLAS_HEIGHT`
 * above against the actual TypeScript source of truth, by regexing the
 * numbers back out of it. Throws (rather than silently diverging) if a
 * future edit to the contract isn't mirrored here.
 */
async function assertMatchesSourceOfTruth() {
  const text = await readFile(ATLAS_SOURCE_TS, 'utf8');
  for (const [name, region] of Object.entries(HOCKEY_SPRITES)) {
    const re = new RegExp(
      `${name}:\\s*\\{\\s*x:\\s*(-?\\d+),\\s*y:\\s*(-?\\d+),\\s*width:\\s*(\\d+),\\s*height:\\s*(\\d+),\\s*anchorX:\\s*(-?\\d+),\\s*anchorY:\\s*(-?\\d+)\\s*\\}`
    );
    const match = text.match(re);
    if (!match) throw new Error(`bake-sprites.mjs: could not find region "${name}" in ${ATLAS_SOURCE_TS} to verify against`);
    const actual = { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]), anchorX: Number(match[5]), anchorY: Number(match[6]) };
    for (const key of Object.keys(region)) {
      if (actual[key] !== region[key]) {
        throw new Error(
          `bake-sprites.mjs: region "${name}".${key} is ${region[key]} here but ${actual[key]} in ` +
            `${path.relative(root, ATLAS_SOURCE_TS)} - the atlas contract changed. Update HOCKEY_SPRITES above.`
        );
      }
    }
  }
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

/** Serves the virtual https://bake.local/ origin entirely from local files. */
async function routeBakeOrigin(route) {
  const url = new URL(route.request().url());
  const pathname = url.pathname;

  try {
    if (pathname === '/' || pathname === '/index.html') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: await readFile(PAGE_PATH) });
    }
    // three.module.js imports sibling chunks (three.core.js etc.) by relative
    // path, so every top-level /three*.js request is served from the same
    // build/ directory, not just the entry point.
    if (/^\/three[\w.]*\.js$/.test(pathname)) {
      const filePath = path.join(THREE_BUILD_DIR, pathname.slice(1));
      if (!filePath.startsWith(THREE_BUILD_DIR)) return route.fulfill({ status: 403, body: 'forbidden' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(filePath) });
    }
    if (pathname.startsWith('/addons/')) {
      const relative = pathname.slice('/addons/'.length);
      const filePath = path.join(JSM_DIR, relative);
      if (!filePath.startsWith(JSM_DIR)) return route.fulfill({ status: 403, body: 'forbidden' });
      return route.fulfill({ status: 200, contentType: contentTypeFor(filePath), body: await readFile(filePath) });
    }
    if (pathname.startsWith('/models/')) {
      const relative = pathname.slice('/models/'.length);
      const filePath = path.join(MODELS_DIR, relative);
      if (!filePath.startsWith(MODELS_DIR)) return route.fulfill({ status: 403, body: 'forbidden' });
      return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: await readFile(filePath) });
    }
    if (process.env.BAKE_DEBUG) console.log(`  [404] ${pathname}`);
    return route.fulfill({ status: 404, body: `no route for ${pathname}` });
  } catch (error) {
    return route.fulfill({ status: 500, body: String(error?.stack ?? error) });
  }
}

/** Fraction of `png`'s pixels with non-zero alpha - a cheap "is this blank" check. */
async function alphaCoverage(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let opaque = 0;
  const pixelCount = data.length / channels;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i + channels - 1] > 0) opaque += 1;
  }
  return opaque / pixelCount;
}

/** Renders every variant, returning `{ variant, buffer, anchorPxX, anchorPxY }[]` (PNG buffers at SUPERSAMPLE resolution). */
async function renderVariants(page) {
  const renders = [];
  for (const variant of VARIANTS) {
    const spec = {
      modelUrl: variant.modelUrl,
      clipName: variant.clipName,
      sampleFraction: variant.sampleFraction,
      jerseyHex: variant.jerseyHex,
      accentHex: variant.accentHex,
      canvasWidth: variant.region.width * SUPERSAMPLE,
      canvasHeight: variant.region.height * SUPERSAMPLE,
      tiltDeg: variant.camera.tiltDeg,
      yawDeg: variant.camera.yawDeg,
      fillFraction: variant.camera.fillFraction,
    };

    // Sequential (not Promise.all): each bake depends on a fresh page-side
    // GLTF load, and sequential keeps a failure attributable to one variant.
    const result = await page.evaluate(spec => window.bake(spec), spec);
    const base64 = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1);
    const buffer = Buffer.from(base64, 'base64');

    const metadata = await sharp(buffer).metadata();
    if (metadata.width !== spec.canvasWidth || metadata.height !== spec.canvasHeight) {
      throw new Error(
        `bake-sprites.mjs: ${variant.name} rendered ${metadata.width}x${metadata.height}, expected ${spec.canvasWidth}x${spec.canvasHeight}`
      );
    }

    const coverage = await alphaCoverage(buffer);
    if (process.env.BAKE_DEBUG && result.debugDataUrl) {
      const debugBase64 = result.debugDataUrl.slice(result.debugDataUrl.indexOf(',') + 1);
      await writeFile(path.join(root, 'assets-src', `bake-debug-${variant.name}.png`), Buffer.from(debugBase64, 'base64'));
    }
    if (coverage <= 0.05) {
      const message = `bake-sprites.mjs: ${variant.name} render is blank (alpha coverage ${(coverage * 100).toFixed(2)}%, need > 5%)`;
      if (!process.env.BAKE_DEBUG) throw new Error(message);
      console.error(`  ${message}`);
    }

    console.log(`  ${variant.name.padEnd(12)} ${metadata.width}x${metadata.height}  alpha coverage ${(coverage * 100).toFixed(1)}%  anchor px (${result.anchorPxX.toFixed(1)}, ${result.anchorPxY.toFixed(1)})`);
    renders.push({ variant, buffer, anchorPxX: result.anchorPxX, anchorPxY: result.anchorPxY });
  }
  return renders;
}

/** Downsamples each render to its region's 1x pixel size and previews it (assets-src/bake-preview-*.png, gitignored). */
async function downsampleAndPreview(renders) {
  const previews = [];
  for (const { variant, buffer, anchorPxX, anchorPxY } of renders) {
    const resized = await sharp(buffer)
      .resize(variant.region.width, variant.region.height, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    const previewPath = path.join(root, 'assets-src', `bake-preview-${variant.name}.png`);
    await writeFile(previewPath, resized);
    // The anchor pixel scales down by the same SUPERSAMPLE factor the
    // downsample itself just applied (uniform on both axes - the resize
    // target exactly matches the region's 1x aspect, so this is a pure
    // scale, never a crop).
    previews.push({ variant, buffer: resized, anchorPxX: anchorPxX / SUPERSAMPLE, anchorPxY: anchorPxY / SUPERSAMPLE });
  }
  return previews;
}

/** Composites every downsampled render into the 1157x1130 atlas so each render's own measured anchor pixel lands on its region's anchor pixel. */
async function compositeAtlas(previews) {
  const composites = previews.map(({ variant, buffer, anchorPxX, anchorPxY }) => {
    const { region } = variant;
    const left = Math.round(region.x + region.anchorX - anchorPxX);
    const top = Math.round(region.y + region.anchorY - anchorPxY);
    return { input: buffer, left, top };
  });

  const atlas = await sharp({
    create: { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const metadata = await sharp(atlas).metadata();
  if (metadata.width !== ATLAS_WIDTH || metadata.height !== ATLAS_HEIGHT) {
    throw new Error(`bake-sprites.mjs: composited atlas is ${metadata.width}x${metadata.height}, expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
  }

  return atlas;
}

/** Runs the whole render+composite pipeline on `page`, returning the atlas PNG buffer without writing anything to disk. */
async function produceAtlas(page) {
  const renders = await renderVariants(page);
  const previews = await downsampleAndPreview(renders);
  return compositeAtlas(previews);
}

async function withBakePage(browser, run) {
  const page = await browser.newPage();
  if (process.env.BAKE_DEBUG) {
    page.on('console', msg => console.log(`  [page:${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.error('  [pageerror]', error));
  }
  await page.route(`${ORIGIN}/**`, routeBakeOrigin);
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => window.__bakeReady === true, undefined, { timeout: 10_000 });
  if (process.env.BAKE_DEBUG) await page.evaluate(() => { window.__BAKE_DEBUG__ = true; });
  return run(page);
}

async function bake() {
  await assertMatchesSourceOfTruth();

  console.log(`Team jerseys: home ${TEAM_JERSEY.home} (accent ${darken(TEAM_JERSEY.home)}), away ${TEAM_JERSEY.away} (accent ${darken(TEAM_JERSEY.away)})\n`);

  const browser = await chromium.launch({ headless: true });
  try {
    console.log('Rendering variants...');
    const atlas = await withBakePage(browser, produceAtlas);

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, atlas);
    // Also drop a full-atlas preview for convenience (gitignored, matches the
    // bake-preview-*.png glob) - downsampleAndPreview already wrote the
    // per-variant previews as a side effect of the render above.
    await writeFile(path.join(root, 'assets-src', 'bake-preview-atlas.png'), atlas);

    console.log(`\nWrote ${path.relative(root, OUTPUT_PATH)} (${ATLAS_WIDTH}x${ATLAS_HEIGHT}).`);
    console.log('Run `npm run assets:optimize` next to regenerate the shipped webp.');
  } finally {
    await browser.close();
  }
}

/**
 * Runs the full pipeline twice, end to end (two fresh pages, two fresh GLTF
 * loads each), and asserts the two atlas buffers are byte-identical. This is
 * the determinism claim in the file header made checkable, rather than
 * asserted in a comment: `node scripts/bake-sprites.mjs --verify-determinism`.
 * Does not touch assets-src/hockey-sprite-atlas.png itself (only `bake()`,
 * the default command, does that) - it does still refresh the per-variant
 * assets-src/bake-preview-*.png eyeball files, harmlessly, as a side effect
 * of calling the same `downsampleAndPreview` the real bake uses.
 */
async function verifyDeterminism() {
  await assertMatchesSourceOfTruth();
  console.log('Verifying determinism: running the full bake twice...\n');

  const browser = await chromium.launch({ headless: true });
  try {
    console.log('Run 1...');
    const first = await withBakePage(browser, produceAtlas);
    console.log('Run 2...');
    const second = await withBakePage(browser, produceAtlas);

    const [firstMeta, secondMeta] = await Promise.all([sharp(first).metadata(), sharp(second).metadata()]);
    if (firstMeta.width !== secondMeta.width || firstMeta.height !== secondMeta.height) {
      throw new Error(
        `bake-sprites.mjs --verify-determinism: dimensions differ between runs (${firstMeta.width}x${firstMeta.height} vs ${secondMeta.width}x${secondMeta.height})`
      );
    }
    if (!first.equals(second)) {
      throw new Error('bake-sprites.mjs --verify-determinism: the two runs produced different bytes');
    }
    console.log(`\nDeterministic: two independent runs produced byte-identical ${firstMeta.width}x${firstMeta.height} PNGs.`);
  } finally {
    await browser.close();
  }
}

const run = process.argv.includes('--verify-determinism') ? verifyDeterminism : bake;
run().catch(error => {
  console.error(error);
  process.exit(1);
});

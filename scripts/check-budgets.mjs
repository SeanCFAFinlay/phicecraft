// ============================================================================
// BUDGET CHECK
//
// Fails the build when the things that used to be wrong start going wrong
// again: multi-megabyte runtime images, source-only artwork shipped to
// production, source maps served publicly, or an unnoticed bundle blowout.
//
// Run after `npm run build`.
// ============================================================================

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const baselinePath = path.join(root, 'scripts', 'budget-baseline.json');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg']);

/**
 * Budgets, each with the reason it exists.
 */
const BUDGETS = {
  // Everything an image the app actually loads at runtime, added together.
  runtimeImagesBytes: 1024 * 1024,
  // A 36px badge does not need more than this.
  logoBytes: 50 * 1024,
  // How far production JS/CSS may grow past the recorded baseline before a
  // human has to decide it was intentional.
  bundleGrowthRatio: 1.15,
};

/** Source-only artwork must live outside public/, or Vite copies it verbatim. */
const SOURCE_ONLY_MARKERS = ['-source', '.psd', '.ai', '.xcf'];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function walk(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function main() {
  if (!existsSync(distDir)) {
    console.error('No dist/ directory. Run `npm run build` first.');
    process.exit(1);
  }

  const distFiles = await walk(distDir);
  const sizes = new Map();
  for (const file of distFiles) sizes.set(file, (await stat(file)).size);

  // --------------------------------------------------------------------------
  // Runtime images
  // --------------------------------------------------------------------------

  const images = distFiles.filter(file => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const imageBytes = images.reduce((sum, file) => sum + sizes.get(file), 0);

  notes.push(`runtime images      ${formatBytes(imageBytes).padStart(10)} (budget ${formatBytes(BUDGETS.runtimeImagesBytes)})`);
  check(
    imageBytes <= BUDGETS.runtimeImagesBytes,
    `Runtime images are ${formatBytes(imageBytes)}, over the ${formatBytes(
      BUDGETS.runtimeImagesBytes
    )} budget.`
  );

  for (const image of images) {
    const name = path.basename(image);
    if (!name.includes('logo')) continue;
    const size = sizes.get(image);
    notes.push(`logo                ${formatBytes(size).padStart(10)} (budget ${formatBytes(BUDGETS.logoBytes)})`);
    check(
      size <= BUDGETS.logoBytes,
      `${name} is ${formatBytes(size)}, over the ${formatBytes(BUDGETS.logoBytes)} logo budget.`
    );
  }

  // --------------------------------------------------------------------------
  // Source-only assets must not be under public/
  // --------------------------------------------------------------------------

  if (existsSync(publicDir)) {
    const publicFiles = await walk(publicDir);
    for (const file of publicFiles) {
      const name = path.basename(file).toLowerCase();
      if (SOURCE_ONLY_MARKERS.some(marker => name.includes(marker))) {
        failures.push(
          `${path.relative(root, file)} looks like source-only artwork but sits under public/, ` +
            'so it is copied into every production build. Move it to assets-src/.'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Source maps must not be served
  // --------------------------------------------------------------------------

  const sourceMaps = distFiles.filter(file => file.endsWith('.map'));
  check(
    sourceMaps.length === 0,
    `dist/ contains ${sourceMaps.length} source map(s). Production source maps publish the whole ` +
      'readable source tree; build with PHICECRAFT_SOURCEMAP=true only when you need them.'
  );

  // --------------------------------------------------------------------------
  // Bundle size against the recorded baseline
  // --------------------------------------------------------------------------

  const jsBytes = distFiles
    .filter(file => file.endsWith('.js'))
    .reduce((sum, file) => sum + sizes.get(file), 0);
  const cssBytes = distFiles
    .filter(file => file.endsWith('.css'))
    .reduce((sum, file) => sum + sizes.get(file), 0);

  notes.push(`production JS       ${formatBytes(jsBytes).padStart(10)}`);
  notes.push(`production CSS      ${formatBytes(cssBytes).padStart(10)}`);

  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const limitJs = Math.round(baseline.jsBytes * BUDGETS.bundleGrowthRatio);
    const limitCss = Math.round(baseline.cssBytes * BUDGETS.bundleGrowthRatio);

    check(
      jsBytes <= limitJs,
      `Production JS is ${formatBytes(jsBytes)}, more than ${Math.round(
        (BUDGETS.bundleGrowthRatio - 1) * 100
      )}% above the ${formatBytes(baseline.jsBytes)} baseline. If that is intentional, update ` +
        'scripts/budget-baseline.json in the same commit.'
    );
    check(
      cssBytes <= limitCss,
      `Production CSS is ${formatBytes(cssBytes)}, above the ${formatBytes(limitCss)} allowance.`
    );
  } else {
    notes.push('no bundle baseline recorded yet (scripts/budget-baseline.json)');
  }

  // --------------------------------------------------------------------------

  console.log('Budgets\n');
  for (const note of notes) console.log(`  ${note}`);

  if (failures.length > 0) {
    console.error('\nBudget failures:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nAll budgets pass.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

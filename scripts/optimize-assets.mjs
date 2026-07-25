// ============================================================================
// ASSET OPTIMIZER
//
// Regenerates the committed runtime images from the sources in assets-src/.
// Run with `npm run assets:optimize`; the outputs are committed, so a normal
// build and a normal CI run never need sharp.
//
// The problem this fixes: the app shipped 5.99 MiB of images, including a
// 2 MB 1254x1254 PNG logo rendered at 36 CSS pixels, and a 1.5 MB artwork
// source that was never referenced at runtime but sat in public/ and was
// therefore copied verbatim into every production build.
// ============================================================================

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'assets-src');
const outputDir = path.join(root, 'public', 'assets');

/**
 * Each entry states WHY its size is what it is. A budget without a reason is
 * a number someone will raise the first time it fails.
 */
const TARGETS = [
  {
    source: 'ph-logo.png',
    output: 'ph-logo.webp',
    // Rendered at 32 CSS px. 96px covers a 3x display with room to spare.
    resize: { width: 96, height: 96, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } },
    format: 'webp',
    options: { quality: 90, effort: 6 },
    budgetBytes: 50 * 1024,
  },
  {
    source: 'arena-overhead.png',
    output: 'arena-overhead.webp',
    // A full-bleed CSS background behind a dark scrim; 1600px wide is past
    // the point where more resolution is visible through the overlay.
    resize: { width: 1600, withoutEnlargement: true },
    format: 'webp',
    options: { quality: 72, effort: 6 },
    budgetBytes: 350 * 1024,
  },
  {
    source: 'hockey-sprite-atlas.png',
    output: 'hockey-sprite-atlas.webp',
    // Sprites are drawn at roughly 1:1; halving the atlas would soften them,
    // so this is re-encoded at full size rather than downscaled.
    resize: null,
    format: 'webp',
    options: { quality: 88, effort: 6, alphaQuality: 90 },
    budgetBytes: 500 * 1024,
  },
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function sizeOf(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(
      `No ${path.relative(root, sourceDir)} directory.\n` +
        'Source artwork lives outside public/ so Vite never copies it into a\n' +
        'production build. Move the original PNGs there and re-run.'
    );
    process.exit(1);
  }

  await mkdir(outputDir, { recursive: true });

  let failures = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const target of TARGETS) {
    const sourcePath = path.join(sourceDir, target.source);
    if (!existsSync(sourcePath)) {
      console.error(`  MISSING  ${target.source} (expected in assets-src/)`);
      failures += 1;
      continue;
    }

    const before = await sizeOf(sourcePath);
    let pipeline = sharp(await readFile(sourcePath));
    if (target.resize) pipeline = pipeline.resize(target.resize);
    pipeline = pipeline[target.format](target.options);

    const buffer = await pipeline.toBuffer();
    const outputPath = path.join(outputDir, target.output);
    await writeFile(outputPath, buffer);

    totalBefore += before;
    totalAfter += buffer.length;

    const overBudget = buffer.length > target.budgetBytes;
    if (overBudget) failures += 1;

    console.log(
      `  ${overBudget ? 'OVER    ' : 'ok      '} ${target.output.padEnd(28)} ` +
        `${formatBytes(before).padStart(10)} -> ${formatBytes(buffer.length).padStart(10)} ` +
        `(budget ${formatBytes(target.budgetBytes)})`
    );
  }

  console.log(
    `\n  total    ${''.padEnd(28)} ${formatBytes(totalBefore).padStart(10)} -> ` +
      `${formatBytes(totalAfter).padStart(10)}`
  );

  if (failures > 0) {
    console.error(`\n${failures} asset(s) missing or over budget.`);
    process.exit(1);
  }
  console.log('\nAll assets optimized and within budget.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

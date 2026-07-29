// Rewrites the VERSION literal in dist/sw.js to a hash of the build manifest.
//
// Browsers refetch a service worker byte-for-byte: a deploy that changes app
// chunks but not sw.js never re-runs `install`, so the new lazy chunks are
// not precached and die on the next offline start. Hashing the manifest into
// VERSION makes the worker's bytes change exactly when the built assets do.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function stampServiceWorker(swSource, manifestSource) {
  const hash = createHash('sha256').update(manifestSource).digest('hex').slice(0, 12);
  const version = `build-${hash}`;
  const stamped = swSource.replace(
    /const VERSION = '[^']*';/,
    `const VERSION = '${version}';`
  );
  if (stamped === swSource) {
    throw new Error("dist/sw.js has no `const VERSION = '...';` declaration to stamp");
  }
  return { stamped, version };
}

// Same two candidate paths as public/sw.js:43 — Vite 4 writes manifest.json
// at the dist root, newer Vite writes .vite/manifest.json.
async function readManifest(distDir) {
  for (const candidate of ['manifest.json', path.join('.vite', 'manifest.json')]) {
    try {
      return await readFile(path.join(distDir, candidate), 'utf8');
    } catch {
      /* try the next path */
    }
  }
  throw new Error(`no build manifest found under ${distDir}; was \`vite build\` run with build.manifest enabled?`);
}

async function main() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const swPath = path.join(distDir, 'sw.js');
  const [swSource, manifestSource] = await Promise.all([
    readFile(swPath, 'utf8'),
    readManifest(distDir),
  ]);
  const { stamped, version } = stampServiceWorker(swSource, manifestSource);
  await writeFile(swPath, stamped);
  console.log(`stamped ${swPath} with ${version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

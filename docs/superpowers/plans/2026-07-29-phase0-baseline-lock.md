# Phase 0 — Baseline Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile stale documentation and make the service worker's cache version derive from the build, so an assets-only deployment reliably triggers a new precache.

**Architecture:** Two independent deliverables. (1) Documentation-only correction of `docs/licenses/ASSET_REGISTER.md`. (2) A post-build stamping script (`scripts/stamp-sw.mjs`) that rewrites `const VERSION = 'v1'` in `dist/sw.js` to a hash of the Vite build manifest, wired into the `build` npm script. The source `public/sw.js` keeps `'v1'` as the dev-server fallback.

**Tech Stack:** Node 18+ ESM script (matches existing `scripts/check-budgets.mjs` pattern), Vitest for the unit test, Vite 4 build manifest.

## Global Constraints

- `npm run lint` runs eslint with `--max-warnings 0` over `ts,tsx,mjs` — new `.mjs` files must lint clean.
- `npm run typecheck` (`tsc --noEmit`) must stay clean; keep Node-only script code out of `src/` so the browser TS project never sees it.
- Coverage gates: `src/persistence/**` 90% lines/branches, `src/commands/**` 90/85, project floor 80 — this plan touches none of those paths.
- Vite is v4 (`^4.3.9`): `build.manifest: true` emits `dist/manifest.json` (root), not `.vite/manifest.json`. The stamping script must try both paths, same as `public/sw.js:43` does.
- All 1,244 unit tests currently pass; every task ends with the suite still green.

---

### Task 1: Reconcile the asset register with the authored template catalogue

**Files:**
- Modify: `docs/licenses/ASSET_REGISTER.md:40` (Drill content table) and `:58` (Open blockers list)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by other tasks — documentation only.

Background for the implementer: the register row says the 24-template catalogue is "Not yet authored", but `docs/v2/PROGRESS.md` §Phase 5 records it as done, and `src/data/templates/` contains `passing.ts`, `smallArea.ts`, `transition.ts` (8 drills each) registered in `registry.ts` and validated by `registry.test.ts`. The templates are first-party original content, so the row flips to cleared.

- [ ] **Step 1: Update the Drill content row**

In `docs/licenses/ASSET_REGISTER.md`, replace the row:

```markdown
| The 24-template catalogue | Not yet authored | — | Must be **originally authored**. The names in review §11 are a starting list, not content to copy. No third-party diagram, screenshot or written description ships without a recorded permission. |
```

with:

```markdown
| The 24-template catalogue | First-party — originally authored in `src/data/templates/` (`passing.ts`, `smallArea.ts`, `transition.ts`, registered in `registry.ts`) | Owned | ✅ Clear. Authored as original content per the rule below; validated as coherent v3 documents by `src/data/templates/registry.test.ts`. No third-party diagram, screenshot or written description was copied. |
```

- [ ] **Step 2: Update the Open blockers list**

Replace blocker item 4:

```markdown
4. **Template content not authored**, so nothing to clear yet.
```

with:

```markdown
4. ~~Template content not authored.~~ Resolved: the 24-template catalogue is
   authored first-party in `src/data/templates/` and registered above.
```

- [ ] **Step 3: Verify no other stale claims about templates remain**

Run: `grep -rn "not yet authored\|Not yet authored" docs/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add docs/licenses/ASSET_REGISTER.md
git commit -m "docs: record the authored 24-template catalogue in the asset register"
```

---

### Task 2: Build-derived service-worker cache version

**Files:**
- Create: `scripts/stamp-sw.mjs`
- Test: `scripts/stamp-sw.test.mjs`
- Modify: `vite.config.ts:33` (test `include` array), `package.json:8` (`build` script), `public/sw.js:29` (comment only)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `stampServiceWorker(swSource: string, manifestSource: string) → { stamped: string, version: string }` exported from `scripts/stamp-sw.mjs`; the same file is a CLI (`node scripts/stamp-sw.mjs`) that rewrites `dist/sw.js` in place. Task 3 relies on the CLI being wired into `npm run build`.

Why: `public/sw.js` hard-codes `const VERSION = 'v1'`. Browsers re-run the SW `install` step (which precaches the current build manifest) only when the SW file's bytes change. If a deploy changes app chunks but not `sw.js`, no new install happens and newly built lazy chunks stay uncached until visited online — exactly the offline trap the file's own header comment warns about. Deriving VERSION from a hash of the build manifest makes the SW bytes change whenever the built assets change.

- [ ] **Step 1: Extend the Vitest include so a test under `scripts/` is picked up**

In `vite.config.ts`, change:

```ts
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
```

to:

```ts
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
```

(Plain `.mjs` keeps the Node-only script outside `tsc --noEmit`'s project, per Global Constraints.)

- [ ] **Step 2: Write the failing test**

Create `scripts/stamp-sw.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { stampServiceWorker } from './stamp-sw.mjs';

const SW_FIXTURE = [
  "const VERSION = 'v1';",
  'const SHELL_CACHE = `phicecraft-shell-${VERSION}`;',
].join('\n');

const MANIFEST_A = JSON.stringify({ 'index.html': { file: 'assets/index-abc.js' } });
const MANIFEST_B = JSON.stringify({ 'index.html': { file: 'assets/index-def.js' } });

describe('stampServiceWorker', () => {
  it('replaces the VERSION literal with a build-derived value', () => {
    const { stamped, version } = stampServiceWorker(SW_FIXTURE, MANIFEST_A);
    expect(version).toMatch(/^build-[0-9a-f]{12}$/);
    expect(stamped).toContain(`const VERSION = '${version}';`);
    expect(stamped).not.toContain("const VERSION = 'v1';");
  });

  it('is deterministic for the same manifest and differs when assets change', () => {
    const a1 = stampServiceWorker(SW_FIXTURE, MANIFEST_A);
    const a2 = stampServiceWorker(SW_FIXTURE, MANIFEST_A);
    const b = stampServiceWorker(SW_FIXTURE, MANIFEST_B);
    expect(a1.version).toBe(a2.version);
    expect(b.version).not.toBe(a1.version);
  });

  it('throws when the VERSION declaration is missing, rather than shipping unstamped', () => {
    expect(() => stampServiceWorker('// no version here', MANIFEST_A)).toThrow(/VERSION/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/stamp-sw.test.mjs`
Expected: FAIL — `stamp-sw.mjs` does not exist / `stampServiceWorker` is not a function.

- [ ] **Step 4: Implement `scripts/stamp-sw.mjs`**

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/stamp-sw.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Run lint on the new files**

Run: `npm run lint`
Expected: exit 0, zero warnings.

- [ ] **Step 7: Commit the script and test**

```bash
git add scripts/stamp-sw.mjs scripts/stamp-sw.test.mjs vite.config.ts
git commit -m "feat: derive the service-worker cache version from the build manifest"
```

---

### Task 3: Wire stamping into the build and document the dev fallback

**Files:**
- Modify: `package.json:8` (`build` script), `public/sw.js:29` (comment above VERSION)

**Interfaces:**
- Consumes: the `scripts/stamp-sw.mjs` CLI from Task 2.
- Produces: `npm run build` always emits a stamped `dist/sw.js`; nothing else consumes this.

- [ ] **Step 1: Chain the stamp into the build script**

In `package.json`, change:

```json
    "build": "tsc && vite build",
```

to:

```json
    "build": "tsc && vite build && node scripts/stamp-sw.mjs",
```

- [ ] **Step 2: Annotate the source fallback**

In `public/sw.js`, change line 29:

```js
const VERSION = 'v1';
```

to:

```js
// Dev-server fallback only. `npm run build` rewrites this literal to a hash
// of the build manifest (scripts/stamp-sw.mjs) so the worker's bytes — and
// therefore its install/precache step — change whenever the built assets do.
const VERSION = 'v1';
```

- [ ] **Step 3: Verify end to end on a real build**

Run: `npm run build && grep "const VERSION" dist/sw.js`
Expected: `const VERSION = 'build-<12 hex chars>';` — not `'v1'`.

- [ ] **Step 4: Verify the stamp tracks asset changes**

Run (from the repo root):

```bash
grep "const VERSION" dist/sw.js > /tmp/stamp-before.txt
npm run build
grep "const VERSION" dist/sw.js > /tmp/stamp-after.txt
diff /tmp/stamp-before.txt /tmp/stamp-after.txt && echo "IDENTICAL (expected: same inputs, same stamp)"
```

Expected: `IDENTICAL` — same source produces the same stamp (determinism). (An asset change producing a different stamp is covered by the unit test in Task 2.)

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test`
Expected: all tests pass (1,244 + the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add package.json public/sw.js
git commit -m "feat: stamp dist/sw.js during npm run build"
```

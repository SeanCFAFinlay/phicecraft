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

  it('re-stamping an already-stamped source is a no-op, not an error', () => {
    const first = stampServiceWorker(SW_FIXTURE, MANIFEST_A);
    const second = stampServiceWorker(first.stamped, MANIFEST_A);
    expect(second.version).toBe(first.version);
    expect(second.stamped).toBe(first.stamped);
  });
});

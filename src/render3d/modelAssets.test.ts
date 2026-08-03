// ============================================================================
// THE SHIPPED BINARY IS REAL
//
// This pins the actual GLB files under public/assets/models/, not a mock or a
// recorded fixture. If someone swaps in a re-export that drops the skin, mis-
// names the clip, or corrupts the container, this test fails on the exact
// bytes a browser would fetch.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MODEL_URLS } from './modelAssets';

// This file lives at src/render3d/; the repo root is two levels up, and
// `public` is where Vite (and the shipped app) resolves a leading `/` from.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const GLB_MAGIC = 0x46546c67; // 'glTF', little-endian, per the glTF 2.0 binary container spec
const JSON_CHUNK_TYPE = 0x4e4f534a; // 'JSON'

interface ParsedGlb {
  json: {
    skins?: unknown[];
    animations?: { name?: string }[];
    materials?: { name?: string }[];
  };
}

/** Minimal glTF 2.0 binary (.glb) container parser: header + first (JSON) chunk. */
function parseGlb(buffer: Buffer): ParsedGlb {
  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(`not a glTF binary: magic was 0x${magic.toString(16)}`);
  }
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== JSON_CHUNK_TYPE) {
    throw new Error(`first chunk was not JSON: type 0x${chunkType.toString(16)}`);
  }
  const jsonText = buffer.toString('utf8', 20, 20 + chunkLength);
  return { json: JSON.parse(jsonText) };
}

describe.each([
  { key: 'skater' as const, animation: 'skate' },
  { key: 'goalie' as const, animation: 'goalie_idle' },
])('$key model ($animation)', ({ key, animation }) => {
  const relativeUrl = MODEL_URLS[key];
  const absolutePath = path.join(REPO_ROOT, 'public', relativeUrl);

  it('exists under public/', () => {
    expect(existsSync(absolutePath), absolutePath).toBe(true);
  });

  it('is a glTF 2.0 binary with exactly one skin and the expected animation clip', () => {
    const buffer = readFileSync(absolutePath);

    // First 4 bytes are the glTF magic, checked both as the raw uint32 and as
    // the literal ASCII string, so a corrupted or truncated download fails
    // loudly rather than parsing into nonsense.
    expect(buffer.readUInt32LE(0)).toBe(GLB_MAGIC);
    expect(buffer.toString('ascii', 0, 4)).toBe('glTF');

    const { json } = parseGlb(buffer);

    expect(json.skins?.length).toBe(1);
    expect(json.animations?.map(a => a.name)).toContain(animation);
  });

  it('has the jersey/accent/pants materials tintActorMaterials.ts recolours per actor', () => {
    const buffer = readFileSync(absolutePath);
    const { json } = parseGlb(buffer);
    const materialNames = json.materials?.map(m => m.name) ?? [];

    // These three names are the exact keys `tintActorMaterials` (scene/
    // tintMaterials.ts) matches on to clone-and-recolour per actor; a
    // re-export that renames or drops one would silently stop tinting that
    // part instead of failing anywhere obvious - every actor would render in
    // the GLB's baked default colour.
    expect(materialNames).toEqual(expect.arrayContaining(['jersey', 'accent', 'pants']));
  });
});

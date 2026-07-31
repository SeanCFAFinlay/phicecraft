// ============================================================================
// SPRITE ATLAS — the shared hockey-sprite webp as a Pixi Spritesheet
//
// `HOCKEY_SPRITES` (src/canvas/HockeySpriteAtlas.ts) already describes the
// four regions (home/away skater, home/away goalie) that Canvas2D reads with
// `drawImage`'s nine-argument form. Pixi has no equivalent one-shot call from
// an arbitrary rect, so the same regions are wrapped as a `Spritesheet`:
// `sheet.textures.homeSkater` etc. become ordinary Pixi Textures, each with
// its own `defaultAnchor` (the anchor a `Sprite` built from it inherits
// automatically) - so a caller never has to re-derive the anchor math the
// Canvas2D renderer does inline in SkaterRenderer.ts/GoalieRenderer.ts.
//
// `buildHockeySpritesheetData`/`regionFrame`/`regionAnchor` are pure and
// tested standalone (spriteAtlas.test.ts). `getHockeySpritesheet` is the only
// piece that touches Pixi/the DOM: it lazily builds the sheet once the shared
// `<img>` (HockeySpriteAtlas.ts) has actually finished loading, mirroring the
// Canvas2D path's own `atlas.complete` gate - so gameScene.ts can poll this
// every frame and fall back to the vector skater until a texture exists,
// exactly like the Canvas2D fallback rule.
// ============================================================================

import { Spritesheet, Texture, type SpritesheetData, type SpritesheetFrameData } from 'pixi.js';
import { getHockeySpriteAtlas, HOCKEY_SPRITES } from '@/canvas/HockeySpriteAtlas';

export interface AtlasRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

/** The pixel rect, renamed to Pixi's `{x,y,w,h}` frame shape. */
export function regionFrame(region: AtlasRegion): SpritesheetFrameData['frame'] {
  return { x: region.x, y: region.y, w: region.width, h: region.height };
}

/** The pixel anchor, normalized to a 0..1 fraction of the region's own size. */
export function regionAnchor(region: AtlasRegion): { x: number; y: number } {
  return { x: region.anchorX / region.width, y: region.anchorY / region.height };
}

/**
 * The full Spritesheet JSON-equivalent for `HOCKEY_SPRITES`, given the source
 * image's pixel dimensions. Pure - no Pixi/DOM touched, which is what makes
 * this unit-testable on its own.
 */
export function buildHockeySpritesheetData(image: { width: number; height: number }): SpritesheetData {
  const frames: SpritesheetData['frames'] = {};
  for (const [name, region] of Object.entries(HOCKEY_SPRITES)) {
    frames[name] = { frame: regionFrame(region), anchor: regionAnchor(region) };
  }
  return {
    frames,
    meta: { size: { w: image.width, h: image.height }, scale: 1 },
  };
}

let cachedSheet: Spritesheet<SpritesheetData> | null = null;
/** The `<img>` element the cached sheet's base texture was built from, so a later reload isn't served a stale sheet. */
let cachedSource: HTMLImageElement | null = null;

/**
 * The lazily-built sheet, or `null` until the shared atlas image
 * (HockeySpriteAtlas.ts) has actually finished loading - the same gate
 * Canvas2D's `getHockeySpriteAtlas()` already applies. Safe to call every
 * frame: once built, the same Spritesheet instance is returned without any
 * further Pixi work.
 */
export function getHockeySpritesheet(): Spritesheet<SpritesheetData> | null {
  const atlas = getHockeySpriteAtlas();
  if (!atlas) return null;
  if (cachedSheet && cachedSource === atlas) return cachedSheet;

  const sheet = new Spritesheet(Texture.from(atlas), buildHockeySpritesheetData(atlas));
  sheet.parseSync();
  cachedSheet = sheet;
  cachedSource = atlas;
  return sheet;
}

/** Test-only: forces the next `getHockeySpritesheet()` call to rebuild. */
export function resetHockeySpritesheetCache(): void {
  cachedSheet = null;
  cachedSource = null;
}

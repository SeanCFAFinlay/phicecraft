let atlas: HTMLImageElement | null = null;

export function getHockeySpriteAtlas(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!atlas) {
    atlas = new Image();
    atlas.decoding = 'async';
    atlas.src = '/assets/hockey-sprite-atlas.png';
  }
  return atlas.complete && atlas.naturalWidth > 0 ? atlas : null;
}

export function subscribeToHockeySpriteAtlas(onReady: () => void): () => void {
  if (typeof Image === 'undefined') return () => undefined;
  if (!atlas) {
    atlas = new Image();
    atlas.decoding = 'async';
    atlas.src = '/assets/hockey-sprite-atlas.png';
  }
  if (atlas.complete && atlas.naturalWidth > 0) {
    onReady();
    return () => undefined;
  }
  atlas.addEventListener('load', onReady, { once: true });
  return () => atlas?.removeEventListener('load', onReady);
}

export const HOCKEY_SPRITES = {
  homeSkater: { x: 0, y: 60, width: 470, height: 440, anchorX: 285, anchorY: 220 },
  awaySkater: { x: 627, y: 60, width: 470, height: 440, anchorX: 280, anchorY: 220 },
  homeGoalie: { x: 20, y: 680, width: 510, height: 450, anchorX: 260, anchorY: 220 },
  awayGoalie: { x: 647, y: 680, width: 510, height: 450, anchorX: 255, anchorY: 220 },
} as const;

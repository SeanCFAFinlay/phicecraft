// ============================================================================
// CENTRE-ICE TEAM LOGO
//
// The home team's logo, painted at centre ice in place of the PHormation
// crest. One small store, because three painters draw centre ice - the
// Canvas2D rink, the WebGL rink scene and the baked 3D ice texture - and
// each has to repaint when the coach uploads or removes a logo.
//
// The image is decoded once here; painters read it synchronously and key
// their caches on `version`, which changes whenever the image does.
// ============================================================================

let source: string | null = null;
let image: HTMLImageElement | null = null;
let version = 0;
const listeners = new Set<() => void>();

function publish(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Set (a data URL) or clear (null) the centre-ice logo. */
export function setCentreIceLogo(dataUrl: string | null | undefined): void {
  const next = dataUrl || null;
  if (next === source) return;
  source = next;
  if (!next || typeof Image === 'undefined') {
    if (image) {
      image = null;
      publish();
    }
    return;
  }
  const loading = new Image();
  loading.onload = () => {
    // A newer logo may have been set while this one was decoding.
    if (source !== next) return;
    image = loading;
    publish();
  };
  loading.src = next;
}

/** The decoded logo, or null for the PHormation crest. */
export function centreIceLogo(): HTMLImageElement | null {
  return image;
}

/** Changes whenever the painted logo does. */
export function centreIceLogoVersion(): number {
  return version;
}

export function subscribeCentreIceLogo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fit `width x height` inside a circle of `radius`, keeping its shape. */
export function fitInCircle(width: number, height: number, radius: number): { width: number; height: number } {
  const diagonal = Math.hypot(width, height) || 1;
  const scale = (radius * 2) / diagonal;
  return { width: width * scale, height: height * scale };
}

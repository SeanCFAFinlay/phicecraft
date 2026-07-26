// ============================================================================
// THE PUCK AT A CARRIER'S BLADE
//
// One definition, shared by the skater, the goalie and the tabletop piece, so
// the carrier's puck cannot drift into three different sizes again.
//
// It used to be a 5.5x3.7 ellipse with a gold stroke and a 7px gold glow. At
// normal zoom that is wider than the stick blade and brighter than anything
// else on the ice, so the eye read it as a selection marker rather than as a
// puck. A real puck is a small, flat, matte-black disc; that is what this
// draws. Who has the puck is still stated explicitly by the "Puck #11" chip,
// which is the readout for that question - this is only the object.
// ============================================================================

/** Half-width and half-height of the marker, in world units. */
export const PUCK_MARKER_RX = 3;
export const PUCK_MARKER_RY = 2.1;

const PUCK_FILL = '#0a0d11';
const PUCK_EDGE = 'rgba(214, 226, 238, 0.34)';

/**
 * Draw the puck at `(x, y)`, lying flat and turned to `heading`.
 *
 * `scale` multiplies the marker for views that draw players at a size other
 * than world scale - the tabletop pieces, which shrink with depth.
 */
export function drawPuckMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  scale = 1
): void {
  ctx.save();
  // No shadow: the glow was most of what made the old marker shout, and a puck
  // sitting on the ice does not emit light.
  ctx.shadowBlur = 0;
  ctx.fillStyle = PUCK_FILL;
  ctx.strokeStyle = PUCK_EDGE;
  ctx.lineWidth = Math.max(0.6, 0.9 * scale);
  ctx.beginPath();
  ctx.ellipse(
    x,
    y,
    Math.max(1, PUCK_MARKER_RX * scale),
    Math.max(0.7, PUCK_MARKER_RY * scale),
    heading,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

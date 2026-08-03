// ============================================================================
// STATIC RINK LAYER
//
// Arena, ice, boards and markings. Redrawn only when the viewport, camera,
// quality or theme changes - never for a playback frame and never for a
// pointer move.
// ============================================================================

import type { Camera } from '@/core/types';
import { drawRink } from '@/canvas/RinkRenderer';
import { cameraMatrix } from '@/utils/geometry';

export interface StaticLayerInput {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
}

/** A key that changes exactly when the static layer needs repainting. */
export function staticLayerKey(input: StaticLayerInput): string {
  const { camera, width, height, dpr } = input;
  return [
    Math.round(camera.x * 100),
    Math.round(camera.y * 100),
    Math.round(camera.zoom * 1000),
    Math.round((camera.rotation ?? 0) * 1000),
    Math.round((camera.tilt ?? 0) * 1000),
    width,
    height,
    Math.round(dpr * 100),
  ].join(':');
}

export function drawStaticLayer(ctx: CanvasRenderingContext2D, input: StaticLayerInput): void {
  const { camera, width, height, dpr } = input;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Transparent, so the arena artwork behind the canvas stays visible around
  // the regulation playing surface.
  ctx.clearRect(0, 0, width, height);

  const matrix = cameraMatrix(camera);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  drawRink(ctx);
  ctx.restore();
}

// ============================================================================
// BOARD3D
//
// The three.js presentation for true-3D (Phase 4). This task builds the
// static arena (ice, boards, glass, arena floor, lights) into the scene on
// mount - no actors yet (later tasks in this phase build those on top).
//
// Its job here is the mount/unmount lifecycle: a real WebGL context is
// created once per mount, resized to fill the stage, repainted synchronously
// whenever the camera store changes (a pan, a pinch, or ViewControls'
// rAF-driven tilt animation), and torn down completely - GPU context
// released, DOM canvas removed, arena geometry/materials/textures disposed -
// when the coach steps back to 2D. Nothing here is async (unlike
// selectRenderer.ts's WebGL claim), so React 18 StrictMode's dev-only
// double-invoke (setup -> cleanup -> setup, all synchronous) is naturally
// safe with no shared-claim cache needed.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import type { RenderQuality } from '@/render/quality';
import { orbitFromCamera } from './orbit';
import { buildArena } from './scene/buildArena';
import { createIceTexture } from './scene/iceTexture';

/** Same cap the 2D canvas path applies (useCanvasLayers.ts) - a 3x/4x phone gains nothing past this. */
const MAX_DEVICE_PIXEL_RATIO = 2;
const CAMERA_FOV_DEGREES = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;

export interface Board3DProps {
  /**
   * Gates the arena's shadow-casting light (see `buildArena`'s option of the
   * same name). Defaulted rather than read from the live render-quality tier
   * useCanvasLayers.ts computes for the 2D path - wiring that through is
   * Task 5/6's job once Board3D takes over as the unconditional 3D renderer;
   * until then this only ever mounts as the 3D preview behind the `?board3d`
   * flag, so a fixed 'high' keeps this task's scope to the arena itself.
   */
  quality?: RenderQuality;
}

export default function Board3D({ quality = 'high' }: Board3DProps = {}) {
  const { camera: cameraStore } = useEditorRuntime();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO));
    renderer.shadowMap.enabled = quality === 'high';
    // Transparent: the scene sits over the container's own CSS gradient
    // (`.board3d-stage`, src/styles/index.css) around the arena floor's own
    // edges, rather than a solid clear.
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const iceTexture = createIceTexture();
    const arena = buildArena(iceTexture.canvas, { quality });
    scene.add(arena.root);

    const perspectiveCamera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEGREES,
      1,
      CAMERA_NEAR,
      CAMERA_FAR
    );

    /** Positions the three.js camera from the current camera-store snapshot. */
    const applyOrbit = () => {
      const snapshot = cameraStore.getSnapshot();
      const { azimuth, polar, distance, target } = orbitFromCamera(
        snapshot.camera,
        snapshot.viewport
      );
      // polar is elevation above the horizon (PI/2 = overhead), so the
      // vertical component scales with sin(polar) and the horizontal radius
      // (what azimuth spins around) scales with cos(polar).
      const horizontalRadius = distance * Math.cos(polar);
      perspectiveCamera.position.set(
        target.x + horizontalRadius * Math.sin(azimuth),
        target.y + distance * Math.sin(polar),
        target.z + horizontalRadius * Math.cos(azimuth)
      );
      perspectiveCamera.lookAt(target.x, target.y, target.z);
    };

    const render = () => {
      applyOrbit();
      renderer.render(scene, perspectiveCamera);
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      perspectiveCamera.aspect = width / height;
      perspectiveCamera.updateProjectionMatrix();
      render();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Re-render on every camera change: a pan, a pinch, or ViewControls'
    // rAF-driven spin/tilt animation, all synchronously - the same contract
    // CanvasSurface's own camera subscription follows.
    const unsubscribe = cameraStore.subscribe(render);
    render();

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      renderer.dispose();
      arena.dispose();
      iceTexture.dispose();
      scene.clear();
    };
  }, [cameraStore, quality]);

  return (
    <div
      ref={containerRef}
      className="board3d-stage absolute inset-0 overflow-hidden"
      // No actors, no gestures yet (later tasks in this phase) - nothing here
      // is interactive or informative for a screen reader today.
      aria-hidden="true"
    />
  );
}

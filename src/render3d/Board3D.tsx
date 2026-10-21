// ============================================================================
// BOARD3D
//
// The three.js presentation for true-3D (Phase 4). Builds the static arena
// (ice, boards, glass, arena floor, lights - Task 4) and now the animated
// actors on top of it: one skater/goalie per drill player, a marker per
// coach, and the puck, all driven by the playback frame stream.
//
// Separate lifecycles keep editing responsive:
//   - the FIRST owns the expensive, one-per-mount lifecycle: the real WebGL
//     context, the static arena, the orbit camera. It depends only on
//     `cameraStore`/`quality`; a quality change recreates the scene.
//   - the SECOND owns the actors: it rebuilds only when roster identity or
//     appearance changes and repaints synchronously on every playback frame. It
//     never touches the renderer/canvas lifecycle - only the actor group the
//     first effect leaves parented under `scene`.
//   - Routes and equipment update independently of the player models.
//
// React 18 StrictMode's dev-only double-invoke (setup -> cleanup -> setup,
// all synchronous) is naturally safe for both: the first effect has no
// shared-claim cache to worry about (see the original module note this
// replaced), and the second's model cache is idempotent - loading the same
// URL twice returns the same in-flight/resolved promise.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { useAppState, useAppServices, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import type { RenderQuality } from '@/render/quality';
import type { Drill, ID, Point, Player } from '@/core/types';
import { jerseyColor } from '@/core/types';
import { orbitFromCamera, ORBIT_FOV_DEGREES } from './orbit';
import { RINK_SCALE, rinkToWorld, worldToRink } from './worldMap';
import { buildArena } from './scene/buildArena';
import { createIceTexture } from './scene/iceTexture';
import { createGoalNets } from './scene/goalNet';
import { createRouteOverlay3D } from './scene/routeOverlay';
import { createEquipmentOverlay3D } from './scene/equipment3D';
import { actorSignature } from './actorSignature';
import { getTargetNet } from '@/engine/puck';
import {
  createActor,
  createCoachMarker,
  createPuck,
  isProgressWrap,
  resolveMixerDelta,
  type Actor,
  type MarkerActor,
} from './scene/actors';
import { loadModel } from './modelCache';
import { markBoard3DActorsBuilt, recordBoard3DFrame } from './board3dCounters';
import {
  pointerDistance,
  rotationFromDrag,
  zoomFromPinch,
  zoomFromWheel,
  type PointerPoint,
} from './orbitGestures';

/** Same cap the 2D canvas path applies (useCanvasLayers.ts) - a 3x/4x phone gains nothing past this. */
const MAX_DEVICE_PIXEL_RATIO = 2;
const CAMERA_FOV_DEGREES = ORBIT_FOV_DEGREES;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
/** Every non-goalie skater's accent trim - white, matching the 2D palette's `trim` colour for both teams (`skaterPalette.ts`). */
const ACCENT_COLOR = '#ffffff';
/**
 * How far in front of the holder (world metres, along their heading) the
 * carried puck renders when no `frame.puck` position exists yet - matches
 * the 2D convention (`PlayerRenderer.ts`: `bladeX + bodyR * 0.35`) so the
 * puck sits outside the actor's silhouette instead of inside/occluded by it.
 */
const CARRIED_PUCK_OFFSET_METERS = 0.45;

export interface Board3DProps {
  /**
   * Gates the arena's shadow-casting light (see `buildArena`'s option of the
   * same name). AppShell.tsx reads the live auto-degrade tier
   * (`qualityStore.ts` - shared with the 2D canvas path, see its own header)
   * and passes it here on every mount. The 'high' default only matters for a
   * caller that mounts Board3D directly without going through AppShell (a
   * unit test, a future Storybook-style harness).
   */
  quality?: RenderQuality;
}

export default function Board3D({ quality = 'high' }: Board3DProps = {}) {
  const { camera: cameraStore, playback } = useEditorRuntime();
  const { state } = useAppState();
  const commands = useCommands();
  const { announcer } = useAppServices();
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const draggingPlayerRef = useRef<{ id: ID; hasMoved: boolean } | null>(null);
  const icePlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());

  // The actor effect reads the CURRENT drill every frame (60x/second while
  // playing) without re-subscribing to the frame stream on every edit - it
  // depends on the roster signature to know when to rebuild the actor set.
  const drillRef = useRef<Drill>(state.drill);
  drillRef.current = state.drill;
  const rosterSignature = actorSignature(state.drill);

  // --------------------------------------------------------------------------
  // Renderer / arena / camera - created once per mount.
  // --------------------------------------------------------------------------

  const sceneRef = useRef<THREE.Scene | null>(null);
  const routesRef = useRef<THREE.Group | null>(null);
  const routesVisibleRef = useRef(true);
  routesVisibleRef.current = state.ui.mode === 'build';
  const renderRef = useRef<() => void>(() => {});
  // Bumped every time the renderer effect below (re)creates the
  // THREE.Scene - included in the actor effect's deps so it re-runs and
  // re-reads `sceneRef.current` instead of going on adding actors to a scene
  // object the renderer effect has already torn down. Load-bearing now that
  // `quality` is a live prop (AppShell.tsx reads the shared auto-degrade
  // tier - see `Board3DProps.quality`'s own doc comment): the renderer
  // effect's deps are `[cameraStore, quality]`, so a quality change tears
  // down and rebuilds the whole scene, and without this the actor effect
  // would keep adding to the torn-down scene object instead of the new one.
  const [sceneEpoch, setSceneEpoch] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // preserveDrawingBuffer: this renderer has no ticker - like WebGLRenderer
    // (the 2D pipeline's Pixi renderer, src/render/webgl/WebGLRenderer.ts),
    // it only calls render() on an actual camera change or playback frame
    // tick, so it can sit for a long time between draws (e.g. a static camera
    // with no route authored). Without this flag the browser is free to
    // clear the drawing buffer after compositing a frame; a caller reading
    // the canvas back afterward (e2e/board3d.spec.ts's pixel sample, a
    // `toHaveScreenshot()` capture) could see it go blank even though nothing
    // ever told it to clear - see WebGLRenderer.ts's own comment on the same
    // flag for the worked-out reasoning.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'medium' ? 1.5 : MAX_DEVICE_PIXEL_RATIO));
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // Transparent: the scene sits over the container's own CSS gradient
    // (`.board3d-stage`, src/styles/index.css) around the arena floor's own
    // edges, rather than a solid clear.
    renderer.setClearColor(0x000000, 0);
    // A stable hook for e2e (board3d.spec.ts) and the "tabletop rink" visual
    // baseline to find this canvas by, independent of DOM order - unlike the
    // flat 2D pair, there is exactly one of these and it is the only canvas
    // mounted while the 3D view is active.
    renderer.domElement.setAttribute('data-board3d', '');
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const iceTexture = createIceTexture();
    const arena = buildArena(iceTexture.canvas, { quality });
    scene.add(arena.root);
    const goalNets = createGoalNets(quality);
    scene.add(goalNets.root);
    sceneRef.current = scene;
    setSceneEpoch(epoch => epoch + 1);

    const perspectiveCamera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEGREES,
      1,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    cameraRef.current = perspectiveCamera;

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
      const start = performance.now();
      renderer.render(scene, perspectiveCamera);
      recordBoard3DFrame(performance.now() - start, renderer.info.render.calls, renderer.info.render.triangles);
    };
    renderRef.current = render;

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

    // A lost-then-restored WebGL context (a mobile GPU reclaiming memory
    // from a backgrounded tab, a driver reset) leaves every buffer/texture
    // three.js uploaded gone, but fires no render of its own - without this,
    // the canvas stays blank until SOME other event happens to trigger a
    // camera change or playback frame. `render` re-issues the same draw
    // calls three.js already re-uploads resources for on `contextrestored`
    // internally, so nothing else needs to be rebuilt here.
    const onContextRestored = () => render();
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    if (typeof window !== 'undefined') {
      (window as unknown as { __BOARD3D__: unknown }).__BOARD3D__ = {
        camera: perspectiveCamera,
        scene,
        renderer,
        drillRef,
      };
    }

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      // `dispose()` frees GPU resources but does NOT release the WebGL
      // context itself - repeatedly toggling 2D<->3D (or a quality change,
      // which tears down and rebuilds this same effect) would otherwise
      // accumulate live contexts until the browser's per-page limit is hit
      // and new ones silently fail to acquire one. `forceContextLoss` can
      // throw if the context is already lost (e.g. the tab backgrounded it
      // first) - harmless, since the goal (no live context left behind) is
      // already met in that case.
      try {
        renderer.forceContextLoss();
      } catch {
        /* already lost - nothing left to release */
      }
      goalNets.dispose();
      arena.dispose();
      iceTexture.dispose();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      renderRef.current = () => {};
    };
  }, [cameraStore, quality]);

  // --------------------------------------------------------------------------
  // Actors - rebuilt when identities or appearance change; repainted synchronously on every playback frame.
  // `sceneEpoch` is in the deps purely so this effect re-runs and re-reads
  // `sceneRef.current` whenever the renderer effect (re)creates the scene -
  // see `sceneEpoch`'s own doc comment above.
  // --------------------------------------------------------------------------

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;
    const actorGroup = new THREE.Group();
    actorGroup.name = 'actors';
    scene.add(actorGroup);

    const skaterActors = new Map<ID, Actor>();
    const coachMarkers = new Map<ID, MarkerActor>();
    const puckActor = createPuck();
    puckActor.root.visible = false;
    actorGroup.add(puckActor.root);
    const haloGeometry = new THREE.RingGeometry(0.57, 0.67, 40);
    const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ffd45c', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const possessionHalo = new THREE.Mesh(haloGeometry, haloMaterial);
    possessionHalo.rotation.x = -Math.PI / 2;
    possessionHalo.name = 'possession-halo';
    possessionHalo.visible = false;
    actorGroup.add(possessionHalo);

    const selectHaloGeometry = new THREE.RingGeometry(0.72, 0.84, 40);
    const selectHaloMaterial = new THREE.MeshBasicMaterial({ color: '#00e5ff', side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const selectionHalo = new THREE.Mesh(selectHaloGeometry, selectHaloMaterial);
    selectionHalo.rotation.x = -Math.PI / 2;
    selectionHalo.name = 'selection-halo';
    selectionHalo.visible = false;
    actorGroup.add(selectionHalo);

    // dt for the mixers is a PROGRESS delta times duration, not wall-clock
    // time - see the module header: scrubbing the timeline must move the
    // stride exactly as far as playing it would, and a paused rAF clock
    // still needs frame N+1 to render at a real dt of >0 relative to frame N.
    // The delta is signed: a backward scrub is a legitimate reverse delta
    // and must play the stride backward, not freeze it - `resolveMixerDelta`
    // only zeroes it out across a loop-wrap jump (see its own doc comment).
    let lastProgress = playback.getFrame().progress;

    const disposeActors = () => {
      for (const actor of skaterActors.values()) {
        actorGroup.remove(actor.root);
        actor.dispose();
      }
      skaterActors.clear();
      for (const marker of coachMarkers.values()) {
        actorGroup.remove(marker.root);
        marker.dispose();
      }
      coachMarkers.clear();
    };

    /** The puck's rink position, or null while no puck action has fired and no player is carrying one either. */
    const resolvePuckPosition = (): Point | null => {
      const frame = playback.getFrame();
      if (frame.puck) return { x: frame.puck.x, y: frame.puck.y };

      // `frame.puck` is null here because the live frame is `EMPTY_FRAME`
      // (playback.setDrill -> reset(), PlaybackStore.ts) - i.e. right after
      // tilting in or after a drill/edit swap, before the first real seek -
      // NOT "before the drill's first puck action" as this comment used to
      // claim: `samplePuck` (sampleFrame.ts) seeds possession from
      // `hasPuck` immediately, so `frame.puck` is non-null in every real
      // seeked frame, including frame 0.
      //
      // The holder's own actor is not necessarily rendered yet either in
      // this state (`frame.playerFrames` is `{}`), so there is no heading to
      // read - default to 0, the same fallback `Actor.update` itself uses
      // for a missing frame. Offset forward of the holder along that
      // heading so the puck renders outside the actor's silhouette instead
      // of inside/occluded by it, mirroring the 2D convention
      // (`PlayerRenderer.ts`: `bladeX + bodyR * 0.35`).
      const holder = drillRef.current.players.find(player => player.hasPuck);
      if (!holder) return null;
      const holderFrame = frame.playerFrames[holder.id];
      const pos = holderFrame?.bladePosition ?? { x: holder.x, y: holder.y };
      const heading = holderFrame?.heading ?? 0;
      const offset = CARRIED_PUCK_OFFSET_METERS / RINK_SCALE;
      return { x: pos.x + Math.cos(heading) * offset, y: pos.y + Math.sin(heading) * offset };
    };

    /**
     * Repositions every existing actor from the CURRENT playback frame, then
     * repaints synchronously - the frame listener's job, but also what a
     * freshly-built actor needs immediately, once, before its first frame
     * tick: without this, a just-created actor sits at its `Object3D`
     * default of world (0, 0, 0) (dead centre ice) until the next frame
     * fires, which never happens on its own for a drill that is not
     * currently playing or being scrubbed.
     */
    const renderFrame = () => {
      const frame = playback.getFrame();
      // `wrapped` is the same test `resolveMixerDelta` used internally to
      // zero out `dt` on a loop wrap, computed again here because a wrapped
      // dt=0 and a genuinely-paused dt=0 must be told apart downstream: a
      // pause should hold a clip crossfade mid-blend, a wrap should snap it
      // (see actors.ts's `isProgressWrap` doc comment).
      const wrapped = isProgressWrap(frame.progress, lastProgress);
      const dt = resolveMixerDelta(frame.progress, lastProgress, frame.durationSeconds);
      lastProgress = frame.progress;

      const drill = drillRef.current;
      const carrierId = frame.puck?.carrierId ?? (frame.progress === 0 ? drill.players.find(player => player.hasPuck)?.id : undefined);
      const carrier = drill.players.find(player => player.id === carrierId);
      possessionHalo.visible = Boolean(carrier);
      if (carrier) {
        const world = rinkToWorld(frame.positions[carrier.id] ?? { x: carrier.x, y: carrier.y });
        possessionHalo.position.set(world.x, 0.025, world.z);
      }

      const selectedId = state.selection.selectedPlayerId;
      const selected = selectedId ? drill.players.find(p => p.id === selectedId) : null;
      selectionHalo.visible = Boolean(selected);
      if (selected) {
        const world = rinkToWorld(frame.positions[selected.id] ?? { x: selected.x, y: selected.y });
        selectionHalo.position.set(world.x, 0.02, world.z);
      }
      for (const player of drill.players) {
        const actor = skaterActors.get(player.id);
        if (!actor) continue;
        const pos = frame.positions[player.id] ?? { x: player.x, y: player.y };
        actor.update(pos, frame.playerFrames[player.id], dt, wrapped);
      }

      for (const coach of drill.coaches ?? []) {
        coachMarkers.get(coach.id)?.setPosition({ x: coach.x, y: coach.y });
      }

      const puckPosition = resolvePuckPosition();
      puckActor.root.visible = puckPosition !== null;
      if (puckPosition) puckActor.setPosition(puckPosition);

      renderRef.current();
    };

    const buildActors = async () => {
      let skaterModel: Awaited<ReturnType<typeof loadModel>>;
      let goalieModel: Awaited<ReturnType<typeof loadModel>>;
      try {
        [skaterModel, goalieModel] = await Promise.all([loadModel('skater'), loadModel('goalie')]);
      } catch (error) {
        // A GLB fetch failure (offline with the app shell cached but the
        // model asset not, a dropped connection) must not leave a silent
        // empty arena for the rest of the session - modelCache.ts's own
        // rejection handling makes a LATER attempt (a fresh drill swap, a
        // future mount) retry rather than staying poisoned, but this mount
        // still has nothing to show for it, so it says so and leaves the
        // static arena visible rather than pretending nothing happened.
        if (!cancelled) {
          console.warn('phicecraft: Board3D actor models failed to load', error);
          announcer.announce('3D players unavailable; the rink stays visible');
        }
        return;
      }
      if (cancelled) return;

      const drill = drillRef.current;
      for (const player of drill.players) {
        const source = player.role === 'G' ? goalieModel : skaterModel;
        const cloned = cloneSkeleton(source.scene);
        const actor = createActor(
          { scene: cloned, animations: source.animations },
          {
            kind: player.role === 'G' ? 'goalie' : 'skater',
            jersey: jerseyColor(player.team, drill.settings),
            accent: player.visual?.jerseyTrim ?? ACCENT_COLOR,
            number: player.number,
            name: player.name,
            quality,
          }
        );
        actorGroup.add(actor.root);
        skaterActors.set(player.id, actor);
      }

      for (const coach of drill.coaches ?? []) {
        const marker = createCoachMarker();
        actorGroup.add(marker.root);
        coachMarkers.set(coach.id, marker);
      }

      // Position every actor just built from the current frame - see
      // `renderFrame`'s own doc comment for why this cannot just be
      // `renderRef.current()`.
      renderFrame();
      markBoard3DActorsBuilt();
    };

    void buildActors();
    const unsubscribeFrames = playback.subscribeToFrames(renderFrame);
    renderFrame();

    return () => {
      cancelled = true;
      unsubscribeFrames();
      disposeActors();
      puckActor.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      scene.remove(actorGroup);
    };
  }, [playback, rosterSignature, sceneEpoch, announcer, quality]);

  // Editing a route or a coaching note must never clone every animated model.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const routes = createRouteOverlay3D(drillRef.current);
    routesRef.current = routes.root;
    routes.root.visible = routesVisibleRef.current;
    scene.add(routes.root);
    renderRef.current();
    return () => { routesRef.current = null; scene.remove(routes.root); routes.dispose(); };
  }, [state.drill.skatePaths, state.drill.events, state.drill.settings?.jerseys, sceneEpoch]);

  useEffect(() => {
    if (routesRef.current) routesRef.current.visible = state.ui.mode === 'build';
    renderRef.current();
  }, [state.ui.mode, state.playback.isPlaying]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const equipment = createEquipmentOverlay3D(drillRef.current, quality);
    scene.add(equipment.root);
    renderRef.current();
    return () => { scene.remove(equipment.root); equipment.dispose(); };
  }, [state.drill.equipment, sceneEpoch, quality]);

  const transientRouteGroupRef = useRef<THREE.Group | null>(null);
  const transientRouteMeshRef = useRef<THREE.Mesh | null>(null);
  const drawingRouteRef = useRef<Point[] | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = new THREE.Group();
    group.name = 'transient-routes';
    scene.add(group);
    transientRouteGroupRef.current = group;
    return () => {
      if (transientRouteMeshRef.current) {
        group.remove(transientRouteMeshRef.current);
        transientRouteMeshRef.current.geometry.dispose();
        (transientRouteMeshRef.current.material as THREE.Material).dispose();
        transientRouteMeshRef.current = null;
      }
      scene.remove(group);
      transientRouteGroupRef.current = null;
    };
  }, [sceneEpoch]);

  const updateTransientRoute = useCallback((pts: Point[]) => {
    const group = transientRouteGroupRef.current;
    if (!group || pts.length < 2) return;
    if (transientRouteMeshRef.current) {
      group.remove(transientRouteMeshRef.current);
      transientRouteMeshRef.current.geometry.dispose();
      (transientRouteMeshRef.current.material as THREE.Material).dispose();
      transientRouteMeshRef.current = null;
    }
    const worldPoints = pts.map(p => {
      const w = rinkToWorld(p);
      return new THREE.Vector3(w.x, 0.03, w.z);
    });
    const curve = new THREE.CatmullRomCurve3(worldPoints);
    const geometry = new THREE.TubeGeometry(curve, Math.max(16, pts.length * 2), 0.04, 6, false);
    const material = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    transientRouteMeshRef.current = mesh;
    renderRef.current();
  }, []);

  const clearTransientRoute = useCallback(() => {
    const group = transientRouteGroupRef.current;
    if (!group || !transientRouteMeshRef.current) return;
    group.remove(transientRouteMeshRef.current);
    transientRouteMeshRef.current.geometry.dispose();
    (transientRouteMeshRef.current.material as THREE.Material).dispose();
    transientRouteMeshRef.current = null;
    renderRef.current();
  }, []);

  // --------------------------------------------------------------------------
  // Orbit gestures - drag to spin, wheel/pinch to zoom. View-only: nothing
  // here selects a player or edits the drill (that stays CanvasSurface's
  // job - see the `aria-hidden` div below); it only ever writes `rotation`
  // or `zoom` onto the SAME camera store the flat 2D board and ViewControls
  // already share, via `setCamera({...camera, ...})` - so it never derives
  // or overwrites `tilt`, which is what keeps this view tabletop at all (see
  // `orbitGestures.ts`'s own header). The pure math lives there so it is
  // unit-testable without a DOM; this is just the imperative pointer/wheel
  // plumbing, the same split CanvasSurface.tsx uses for its own wheel/pinch.
  // --------------------------------------------------------------------------

  const pointersRef = useRef(new Map<number, PointerPoint>());
  const dragRef = useRef<{ pointerId: number; startX: number; startRotation: number } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const beginPinchFromCurrentPointers = useCallback(() => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return;
    dragRef.current = null;
    pinchRef.current = {
      startDistance: pointerDistance(points[0], points[1]),
      startZoom: cameraStore.camera.zoom,
    };
  }, [cameraStore]);

  const getIceIntersection = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    camera.updateMatrixWorld();
    mouseVecRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVecRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseVecRef.current, camera);
    const target = new THREE.Vector3();
    return raycasterRef.current.ray.intersectPlane(icePlaneRef.current, target);
  }, []);

  const findPlayerNear = useCallback((icePoint: THREE.Vector3, thresholdMeters = 3.5): Player | null => {
    const drill = drillRef.current;
    let closest: Player | null = null;
    let closestDistSq = thresholdMeters * thresholdMeters;
    for (const p of drill.players) {
      const world = rinkToWorld(p);
      const dx = world.x - icePoint.x;
      const dz = world.z - icePoint.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closest = p;
      }
    }
    return closest;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture fallback */
      }
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size >= 2) {
        draggingPlayerRef.current = null;
        if (drawingRouteRef.current) {
          drawingRouteRef.current = null;
          clearTransientRoute();
        }
        beginPinchFromCurrentPointers();
        return;
      }

      pinchRef.current = null;

      // 3D Raycasting against ice & players
      const iceHit = getIceIntersection(event.clientX, event.clientY);
      const tool = state.ui.currentTool;
      const pending = state.pendingAction;
      const selectedPlayerId = state.selection.selectedPlayerId;

      if (iceHit) {
        const rinkPt = worldToRink({ x: iceHit.x, z: iceHit.z });

        // If in 'draw-route' mode, start authoring a route in 3D
        if (pending.kind === 'draw-route' && !state.playback.isPlaying) {
          drawingRouteRef.current = [rinkPt];
          dragRef.current = null;
          return;
        }

        // If in 'pass' mode in 3D
        if (pending.kind === 'pass' && !state.playback.isPlaying) {
          const hitPlayer = findPlayerNear(iceHit);
          const passer = drillRef.current.players.find(p => p.id === pending.playerId);
          if (hitPlayer) {
            if (hitPlayer.id === pending.playerId) return;
            if (passer && hitPlayer.team === passer.team) {
              commands.requestPass(pending.playerId, hitPlayer.id);
              commands.cancelPendingAction();
            } else {
              commands.guide('Cannot pass to an opponent.');
            }
          } else {
            const targetNet = passer ? getTargetNet(passer.team) : null;
            const distToNet = targetNet ? Math.hypot(rinkPt.x - targetNet.x, rinkPt.y - targetNet.y) : 999;
            if (distToNet < 25) {
              commands.requestShot(pending.playerId, rinkPt);
            } else {
              commands.requestDump(pending.playerId, rinkPt);
            }
            commands.cancelPendingAction();
          }
          dragRef.current = null;
          return;
        }

        // Placement tools: tap ice in 3D to drop player or equipment
        if (tool === 'home' || tool === 'away' || tool === 'goalie') {
          commands.addPlayer(rinkPt, tool);
          return;
        }
        if (tool === 'coach') {
          commands.addCoach(rinkPt);
          return;
        }
        if (tool === 'cone' || tool === 'tire' || tool === 'mini-net' || tool === 'barrier') {
          commands.addEquipment(tool, rinkPt);
          return;
        }

        // Player selection & dragging on 3D ice
        if (!state.playback.isPlaying) {
          const hitPlayer = findPlayerNear(iceHit);
          if (hitPlayer) {
            if (selectedPlayerId === hitPlayer.id) {
              commands.openPlayerInspector(hitPlayer.id);
            } else {
              commands.selectPlayer(hitPlayer.id);
            }
            draggingPlayerRef.current = { id: hitPlayer.id, hasMoved: false };
            dragRef.current = null;
            return;
          } else if (selectedPlayerId) {
            commands.selectPlayer(null);
            commands.cancelPendingAction();
          }
        }
      }

      draggingPlayerRef.current = null;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startRotation: cameraStore.camera.rotation ?? 0,
      };
    },
    [
      cameraStore,
      beginPinchFromCurrentPointers,
      getIceIntersection,
      findPlayerNear,
      state.ui.currentTool,
      state.pendingAction,
      state.selection.selectedPlayerId,
      state.playback.isPlaying,
      commands,
      clearTransientRoute,
    ]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const zoom = zoomFromPinch(pinch.startZoom, pinch.startDistance, pointerDistance(a, b));
        cameraStore.setCamera({ ...cameraStore.camera, zoom });
        return;
      }

      // If drawing a route in 3D
      if (drawingRouteRef.current && !state.playback.isPlaying) {
        const iceHit = getIceIntersection(event.clientX, event.clientY);
        if (iceHit) {
          const rinkPt = worldToRink({ x: iceHit.x, z: iceHit.z });
          const last = drawingRouteRef.current[drawingRouteRef.current.length - 1];
          if (Math.hypot(rinkPt.x - last.x, rinkPt.y - last.y) >= 2.0) {
            drawingRouteRef.current.push(rinkPt);
            updateTransientRoute(drawingRouteRef.current);
          }
          return;
        }
      }

      // If dragging a player in 3D
      if (draggingPlayerRef.current && !state.playback.isPlaying) {
        const iceHit = getIceIntersection(event.clientX, event.clientY);
        if (iceHit) {
          const rinkPt = worldToRink({ x: iceHit.x, z: iceHit.z });
          commands.movePlayerTo(draggingPlayerRef.current.id, rinkPt.x, rinkPt.y);
          draggingPlayerRef.current.hasMoved = true;
          return;
        }
      }

      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        const rotation = rotationFromDrag(drag.startRotation, event.clientX - drag.startX);
        cameraStore.setCamera({ ...cameraStore.camera, rotation });
      }
    },
    [
      cameraStore,
      getIceIntersection,
      commands,
      state.playback.isPlaying,
      updateTransientRoute,
    ]
  );

  /** Shared by pointerup/pointercancel: drop the finger, and resume whatever gesture the remaining fingers (if any) imply. */
  const endPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* pointer release fallback */
      }

      // If drawing a route finished in 3D
      if (drawingRouteRef.current) {
        if (drawingRouteRef.current.length >= 2 && state.pendingAction?.kind === 'draw-route') {
          commands.commitRoute(state.pendingAction.playerId, drawingRouteRef.current);
          commands.cancelPendingAction();
        }
        drawingRouteRef.current = null;
        clearTransientRoute();
      }

      draggingPlayerRef.current = null;

      if (pointersRef.current.size >= 2) {
        beginPinchFromCurrentPointers();
        return;
      }

      pinchRef.current = null;
      const remaining = [...pointersRef.current.entries()][0];
      dragRef.current = remaining
        ? { pointerId: remaining[0], startX: remaining[1].x, startRotation: cameraStore.camera.rotation ?? 0 }
        : null;
    },
    [cameraStore, beginPinchFromCurrentPointers, state.pendingAction, commands, clearTransientRoute]
  );

  // Native, not React's onWheel: React's synthetic wheel listener is passive
  // and cannot preventDefault, so the page would scroll while zooming - the
  // same reason CanvasSurface.tsx's own wheel handler is a native listener.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoom = zoomFromWheel(cameraStore.camera.zoom, event.deltaY);
      cameraStore.setCamera({ ...cameraStore.camera, zoom });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [cameraStore]);

  return (
    <div
      ref={containerRef}
      className="board3d-stage rink-surface touch-none absolute inset-0 overflow-hidden"
      // Editing affordances (selection, drag, route handles) are a later
      // task's job - this task is view-only, so nothing here is interactive
      // or informative for a screen reader today. The pointer handlers below
      // only ever orbit/zoom the camera - see the section header above.
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    />
  );
}

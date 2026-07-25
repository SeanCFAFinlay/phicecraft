// ============================================================================
// CANVAS SURFACE - Main canvas component with rendering and interaction
// ============================================================================

import { useRef, useEffect, useCallback } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { drawRink, drawArenaBase, drawArenaWalls } from '@/canvas/RinkRenderer';
import { drawPlayers, drawArenaPlayers } from '@/canvas/PlayerRenderer';
import { drawCoachTopDown, drawArenaCoaches } from '@/canvas/CoachRenderer';
import { drawMechanicsDiagnostics } from '@/canvas/DiagnosticsRenderer';
import {
  drawSkatePaths,
  drawRawSkate,
  drawEvents,
  drawDragPreview,
  drawGhostTrails,
  drawAnimatedPuck,
  drawPassFromHighlight,
  drawRouteEditHandles,
  drawEventEditHandles,
  eventBendPoint,
} from '@/canvas/PathRenderer';
import {
  RINK,
  PLAYER_HIT_RADIUS,
  PATH_HIT_DISTANCE,
  MOVE_THRESHOLD,
  ROUTE_HANDLE_OFFSET,
  ROUTE_HANDLE_RADIUS,
  WHEEL_ZOOM_SENSITIVITY,
  TABLETOP_MIN_TILT,
  TABLETOP_MAX_TILT,
} from '@/core/constants';
import {
  screenToWorld,
  distance,
  closestPointOnPolyline,
  processRawPath,
  cameraMatrix,
  routeControlPoints,
  routeFromControls,
} from '@/utils/geometry';
import { createPlayer, createSkatePath, createCoach, randomPlayerNumber, randomGoalieNumber } from '@/engine/drill';
import {
  validatePass,
  validateShot,
  getCurrentPuckHolder,
  canAddEvents,
  getTargetNet,
  getAimedNetTarget,
  playerHasPuck,
} from '@/engine/puck';
import type { Player, SkatePath, Point, Camera, ID, CoachMarker, DrillEvent } from '@/core/types';
import { jerseyColor } from '@/core/types';

/** Hit radius for grabbing an edit handle, in screen pixels. */
const HANDLE_HIT = 20;
/** Distance from a net (world units) at which a carrier drag becomes a shot. */
const SHOT_SNAP_DISTANCE = 22 * 5;
import { compileDrill } from '@/sim/compileDrill';
import { getCompiledEventEndpoints } from '@/sim/sampleFrame';
import { subscribeToHockeySpriteAtlas } from '@/canvas/HockeySpriteAtlas';

/** A two-finger gesture in progress */
interface PinchGesture {
  kind: 'pinch';
  startDistance: number;
  startMidpoint: Point;
  startCamera: Camera;
}

/** A drag on empty ice, moving the camera */
interface PanGesture {
  kind: 'pan';
  startPointer: Point;
  startCamera: Camera;
}

/** A drag on empty ice while the tabletop is tilted, spinning/leaning the view */
interface OrbitGesture {
  kind: 'orbit';
  startPointer: Point;
  startCamera: Camera;
}

/** Dragging the coach figure to reposition it */
interface CoachMoveGesture {
  kind: 'coachMove';
  id: ID;
}

/** Dragging a control handle on a skate route to reshape it */
interface RoutePointGesture {
  kind: 'routePoint';
  pathId: ID;
  index: number;
  controls: Point[];
}

/** Dragging a puck line's bend handle, or a shot/dump endpoint */
interface EventEditGesture {
  kind: 'eventBend' | 'eventEnd';
  eventId: ID;
}

type Gesture =
  | PinchGesture
  | PanGesture
  | OrbitGesture
  | CoachMoveGesture
  | RoutePointGesture
  | EventEditGesture
  | null;

export function CanvasSurface() {
  const { state, dispatch, actions } = useAppState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);

  // Live state for callbacks that must stay referentially stable (the render
  // loop especially - see the playback effect below).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Active pointers, for distinguishing a drag from a two-finger pinch
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture>(null);

  // ==========================================================================
  // CANVAS SETUP
  // ==========================================================================

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const setupCanvas = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      dispatch({ type: 'SET_CANVAS_SIZE', width, height });
    };

    setupCanvas();
    const observer = new ResizeObserver(setupCanvas);
    observer.observe(container);
    return () => observer.disconnect();
  }, [dispatch]);

  // ==========================================================================
  // HIT TESTING
  // ==========================================================================

  const getPointerPosition = useCallback((event: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const findPlayerAt = useCallback((screenX: number, screenY: number): Player | null => {
    const s = stateRef.current;
    const { camera, drill } = s;
    const world = screenToWorld(screenX, screenY, camera);
    // Topmost first, matching draw order. When the play is paused mid-scrub the
    // tokens are drawn at their interpolated positions, so hit-test there too -
    // otherwise you couldn't grab the player you can actually see.
    for (let i = drill.players.length - 1; i >= 0; i--) {
      const p = drill.players[i];
      const at = s.playbackPositions[p.id] ?? p;
      if (distance(at, world) < PLAYER_HIT_RADIUS) return p;
    }
    return null;
  }, []);

  /**
   * Passing is deliberately more forgiving than selecting a token. A coach
   * can release near the skater OR anywhere along that skater's route and the
   * gesture still locks to the intended receiver. Open ice remains a dump.
   */
  const findPassReceiverAt = useCallback((
    screenX: number,
    screenY: number,
    excludePlayerId?: ID
  ): Player | null => {
    const { camera, drill } = stateRef.current;
    const world = screenToWorld(screenX, screenY, camera);
    let best: { player: Player; screenDistance: number } | null = null;

    for (const player of drill.players) {
      if (player.id === excludePlayerId) continue;
      const screenDistance = distance(player, world) * camera.zoom;
      if (screenDistance <= 68 && (!best || screenDistance < best.screenDistance)) {
        best = { player, screenDistance };
      }
    }

    for (const path of drill.skatePaths) {
      if (path.ownerId === excludePlayerId || path.points.length < 2) continue;
      const owner = drill.players.find(player => player.id === path.ownerId);
      if (!owner) continue;
      const routeDistance = closestPointOnPolyline(path.points, world).distance * camera.zoom;
      // Prefer a direct token hit, but make a clearly targeted route a valid
      // receiver gesture as well.
      const weightedDistance = routeDistance + 12;
      if (routeDistance <= 42 && (!best || weightedDistance < best.screenDistance)) {
        best = { player: owner, screenDistance: weightedDistance };
      }
    }

    return best?.player ?? null;
  }, []);

  const findPathAt = useCallback(
    (screenX: number, screenY: number): { path: SkatePath; point: Point; t: number } | null => {
      const { camera, drill } = stateRef.current;
      const world = screenToWorld(screenX, screenY, camera);
      for (const path of drill.skatePaths) {
        if (!path.points || path.points.length < 2) continue;
        const result = closestPointOnPolyline(path.points, world);
        if (result.distance * camera.zoom < PATH_HIT_DISTANCE) {
          return { path, point: result.point, t: result.t };
        }
      }
      return null;
    },
    []
  );

  const findEventAt = useCallback((screenX: number, screenY: number) => {
    const s = stateRef.current;
    const world = screenToWorld(screenX, screenY, s.camera);
    for (let i = s.drill.events.length - 1; i >= 0; i--) {
      const event = s.drill.events[i];
      const hit = closestPointOnPolyline([event.fromPoint, event.toPoint], world);
      if (hit.distance * s.camera.zoom <= PATH_HIT_DISTANCE) return event;
    }
    return null;
  }, []);

  const findCoachAt = useCallback((screenX: number, screenY: number): CoachMarker | null => {
    const { camera, drill } = stateRef.current;
    const world = screenToWorld(screenX, screenY, camera);
    const coaches = drill.coaches ?? [];
    for (let i = coaches.length - 1; i >= 0; i--) {
      if (distance(coaches[i], world) < PLAYER_HIT_RADIUS * 1.2) return coaches[i];
    }
    return null;
  }, []);

  // A control handle on the currently selected player's route.
  const findRouteControlAt = useCallback(
    (screenX: number, screenY: number): { path: SkatePath; index: number; controls: Point[] } | null => {
      const s = stateRef.current;
      if (s.playback.isPlaying) return null;
      const ownerId = s.selection.selectedPlayerId;
      if (!ownerId) return null;
      const path = s.drill.skatePaths.find(sp => sp.ownerId === ownerId);
      if (!path || path.points.length < 2) return null;
      const controls = routeControlPoints(path.points);
      const world = screenToWorld(screenX, screenY, s.camera);
      // Skip index 0 - it is pinned to the player.
      for (let i = 1; i < controls.length; i++) {
        if (distance(controls[i], world) * s.camera.zoom < HANDLE_HIT) {
          return { path, index: i, controls };
        }
      }
      return null;
    },
    []
  );

  // A bend or endpoint handle on the currently selected event.
  const findEventHandleAt = useCallback(
    (screenX: number, screenY: number): { event: DrillEvent; part: 'eventBend' | 'eventEnd' } | null => {
      const s = stateRef.current;
      if (s.playback.isPlaying) return null;
      const id = s.selection.selectedEventId;
      if (!id) return null;
      const event = s.drill.events.find(e => e.id === id);
      if (!event) return null;
      const world = screenToWorld(screenX, screenY, s.camera);
      if ((event.type === 'shot' || event.type === 'dump') &&
        distance(event.toPoint, world) * s.camera.zoom < HANDLE_HIT) {
        return { event, part: 'eventEnd' };
      }
      if (distance(eventBendPoint(event), world) * s.camera.zoom < HANDLE_HIT) {
        return { event, part: 'eventBend' };
      }
      return null;
    },
    []
  );

  const getFinalPlayerPoint = useCallback((player: Player): Point => {
    const path = stateRef.current.drill.skatePaths.find(sp => sp.ownerId === player.id);
    return path?.points.length ? path.points[path.points.length - 1] : { x: player.x, y: player.y };
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  // Stable identity: reads everything through stateRef so it never needs to be
  // a dependency of anything.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    const { camera, drill, interaction, selection, playback } = s;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep the canvas transparent so the arena artwork beneath it remains
    // visible around the regulation playing surface.
    ctx.clearRect(0, 0, width, height);

    // Tabletop view: the sheet is leaned/spun, so the boards become raised
    // walls. The far half of the arena is painted behind the play, the near
    // half after it, and the ground plane uses the full affine camera matrix.
    const tabletop = (camera.tilt ?? 0) > TABLETOP_MIN_TILT;
    const matrix = cameraMatrix(camera);

    if (tabletop) {
      drawArenaBase(ctx, { camera, dpr });
      drawArenaWalls(ctx, { camera, dpr }, 'far');
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);

    drawRink(ctx, { elevated: tabletop });

    // Coaches sit on the ice under the play. In the tabletop view they stand up
    // as pieces (drawn later, in screen space); here they are the flat marker.
    const coaches = drill.coaches ?? [];
    if (!tabletop) {
      for (const coach of coaches) {
        drawCoachTopDown(ctx, coach, false);
      }
    }

    // While playing or scrubbing, players render at their interpolated
    // positions. The drill itself is never touched. An empty map means the
    // playhead is at rest, so the drill's own positions are the truth.
    const scrubbing = Object.keys(s.playbackPositions).length > 0;
    const players = scrubbing
      ? drill.players.map(p => {
          const pos = s.playbackPositions[p.id];
          return pos ? { ...p, x: pos.x, y: pos.y } : p;
        })
      : drill.players;

    if (playback.isPlaying) {
      drawGhostTrails(ctx, s.ghostTrails, players);
    }

    drawSkatePaths(ctx, drill.skatePaths);

    if (interaction.drawingSkate && interaction.skateRawPoints.length >= 2) {
      drawRawSkate(ctx, interaction.skateRawPoints, interaction.skateOwner?.team ?? 'home');
    }

    const compiledDrill = compileDrill(drill);
    const renderedEvents = compiledDrill.events.map(compiledEvent => ({
      ...compiledEvent.source,
      ...(() => {
        const endpoints = getCompiledEventEndpoints(compiledDrill, compiledEvent);
        return { fromPoint: endpoints.from, toPoint: endpoints.to };
      })(),
    }));
    drawEvents(ctx, renderedEvents, selection.selectedEventId);

    // Drag preview for pass/shoot
    if (
      interaction.dragType !== 'none' &&
      interaction.dragFromPlayer &&
      interaction.dragCurrentPosition &&
      interaction.pointerMoved
    ) {
      const toWorld = screenToWorld(
        interaction.dragCurrentPosition.x,
        interaction.dragCurrentPosition.y,
        camera
      );
      const targetPlayer =
        interaction.dragType === 'pass'
          ? findPassReceiverAt(
              interaction.dragCurrentPosition.x,
              interaction.dragCurrentPosition.y,
              interaction.dragFromPlayer.id
            )
          : null;

      // A pass started from a path node originates at the node, not the player.
      const fromPoint =
        interaction.nodeActive && interaction.nodeWorldPoint
          ? interaction.nodeWorldPoint
          : interaction.dragType === 'shoot'
            ? getFinalPlayerPoint(interaction.dragFromPlayer)
            : { x: interaction.dragFromPlayer.x, y: interaction.dragFromPlayer.y };

      drawDragPreview(
        ctx,
        interaction.dragType as 'pass' | 'shoot',
        fromPoint,
        targetPlayer ? { x: targetPlayer.x, y: targetPlayer.y } : toWorld,
        targetPlayer !== interaction.dragFromPlayer ? targetPlayer : null,
        RINK.height
      );
    }

    // Path-node pass preview
    if (
      interaction.nodeActive &&
      interaction.nodeWorldPoint &&
      interaction.nodeDragPosition &&
      interaction.pointerMoved
    ) {
      const toWorld = screenToWorld(
        interaction.nodeDragPosition.x,
        interaction.nodeDragPosition.y,
        camera
      );
      const receiver = findPassReceiverAt(
        interaction.nodeDragPosition.x,
        interaction.nodeDragPosition.y,
        interaction.nodePath?.ownerId
      );
      drawDragPreview(
        ctx,
        'pass',
        interaction.nodeWorldPoint,
        receiver ? { x: receiver.x, y: receiver.y } : toWorld,
        receiver,
        RINK.height
      );
    }

    if (selection.passFromPlayerId) {
      const passFrom = players.find(p => p.id === selection.passFromPlayerId);
      if (passFrom) drawPassFromHighlight(ctx, passFrom);
    }

    const playerOptions = {
      selectedPlayerId: selection.selectedPlayerId,
      passFromPlayerId: selection.passFromPlayerId,
      dragFromPlayer: interaction.dragFromPlayer,
      movingPlayer: interaction.movingPlayer,
      nodeActiveOwnerId:
        interaction.nodeActive && interaction.nodePath ? interaction.nodePath.ownerId : null,
      // Whenever the animated puck is on screen it is the single source of
      // truth for where the puck is - don't draw a second one on a player.
      showPuckIndicator: !s.animatedPuck,
      skatePaths: drill.skatePaths,
      playbackProgress: scrubbing || playback.isPlaying ? playback.progress : undefined,
      receivingPlayerId: s.animatedPuck?.state === 'in_flight'
        ? s.animatedPuck.intendedReceiverId
        : undefined,
      playerFrames: scrubbing || playback.isPlaying ? s.playbackPlayerFrames : undefined,
      reducedEffects: drill.settings?.reducedEffects ?? false,
      trackedPuck: s.animatedPuck,
      jerseys: {
        home: jerseyColor('home', drill.settings),
        away: jerseyColor('away', drill.settings),
      },
    };

    // In the tabletop view the skaters become upright standing pieces, drawn in
    // screen space after the ground layer so they sit *on* the ice, not in it.
    if (!tabletop) {
      drawPlayers(ctx, players, drill.events, playerOptions);
    }

    // Edit handles: reshape the selected player's route or bend/re-aim the
    // selected puck line. Hidden during playback.
    if (!playback.isPlaying) {
      if (selection.selectedPlayerId) {
        const selRoute = drill.skatePaths.find(sp => sp.ownerId === selection.selectedPlayerId);
        if (selRoute && selRoute.points.length >= 2) drawRouteEditHandles(ctx, selRoute.points);
      }
      if (selection.selectedEventId) {
        const selEvent = drill.events.find(e => e.id === selection.selectedEventId);
        if (selEvent) drawEventEditHandles(ctx, selEvent);
      }
    }

    if (s.animatedPuck?.visible) {
      drawAnimatedPuck(ctx, s.animatedPuck.x, s.animatedPuck.y, s.animatedPuck.state);
    }

    if (s.ui.showDiagnostics) {
      drawMechanicsDiagnostics(ctx, players, s.playbackPlayerFrames, s.animatedPuck);
    }

    ctx.restore();

    if (tabletop) {
      const jerseys = {
        home: jerseyColor('home', drill.settings),
        away: jerseyColor('away', drill.settings),
      };
      drawArenaPlayers(ctx, { camera, dpr }, players, drill.events, playerOptions, jerseys);
      drawArenaCoaches(ctx, { camera, dpr }, coaches, null);
      // Near boards/glass sit in front of the skaters closest to the camera.
      drawArenaWalls(ctx, { camera, dpr }, 'near');
    }
  }, [findPassReceiverAt, getFinalPlayerPoint]);

  // Redraw after every committed render. Canvas painting is cheap next to the
  // React work that produced the new state, and this keeps a single draw path
  // rather than scattering draw() calls through the event handlers.
  useEffect(draw);

  // The generated hockey sprite atlas loads asynchronously. Trigger one
  // immediate repaint when it becomes available so setup mode upgrades from
  // the procedural fallback without waiting for another user interaction.
  useEffect(() => subscribeToHockeySpriteAtlas(draw), [draw]);

  // ==========================================================================
  // PLAYBACK LOOP
  // ==========================================================================

  useEffect(() => {
    if (!state.playback.isPlaying) return;

    let frame = 0;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      const { speed, duration, progress: current } = stateRef.current.playback;
      const total = duration / speed;

      // Seed the clock from wherever the playhead already is, so pressing play
      // after scrubbing resumes instead of jumping back to zero.
      if (startTime === null) startTime = timestamp - current * total * 1000;

      const elapsed = (timestamp - startTime) / 1000;
      const progress = Math.min(elapsed / total, 1);

      dispatch({ type: 'SET_PLAYBACK_PROGRESS', progress });

      if (progress >= 1) {
        dispatch({ type: 'STOP_PLAYBACK' });
        dispatch({ type: 'CLEAR_BANNERS' });
        const finalEvent = stateRef.current.drill.events[stateRef.current.drill.events.length - 1];
        const scored = finalEvent?.type === 'shot' && (finalEvent.result ?? 'goal') === 'goal';
        actions.showToast(scored ? 'Goal — drill complete!' : 'Drill complete — review the final frame', scored ? 'success' : 'info', 3600);
        return;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Only restart the loop when playback actually starts/stops or the speed
    // changes. Depending on `state` or an unmemoized `actions` here would tear
    // the loop down every frame and pin progress at zero.
  }, [state.playback.isPlaying, state.playback.speed, dispatch, actions]);

  // ==========================================================================
  // WHEEL ZOOM
  // ==========================================================================

  // Registered natively because React's onWheel is passive and can't preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      dispatch({ type: 'ZOOM_AT', factor, screenPoint: getPointerPosition(e) });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [dispatch, getPointerPosition]);

  // ==========================================================================
  // GESTURES
  // ==========================================================================

  const beginPinch = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;

    cancelHold();
    dispatch({ type: 'RESET_INTERACTION' });
    gestureRef.current = {
      kind: 'pinch',
      startDistance: Math.max(distance(pts[0], pts[1]), 1),
      startMidpoint: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      startCamera: { ...stateRef.current.camera },
    };
  }, [cancelHold, dispatch]);

  const updatePinch = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture?.kind !== 'pinch') return;

    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;

    const dist = Math.max(distance(pts[0], pts[1]), 1);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const scale = dist / gesture.startDistance;
    const { startCamera, startMidpoint } = gesture;

    // Zoom about the original midpoint, then follow the fingers as they move.
    dispatch({
      type: 'SET_CAMERA',
      camera: {
        ...startCamera,
        zoom: startCamera.zoom * scale,
        x: mid.x - (startMidpoint.x - startCamera.x) * scale,
        y: mid.y - (startMidpoint.y - startCamera.y) * scale,
      },
    });
  }, [dispatch]);

  // ==========================================================================
  // POINTER HANDLERS
  // ==========================================================================

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const pos = getPointerPosition(e);
      pointersRef.current.set(e.pointerId, pos);
      canvasRef.current?.setPointerCapture(e.pointerId);

      // Second finger down: this is a pinch, abandon whatever the first was doing.
      if (pointersRef.current.size === 2) {
        beginPinch();
        return;
      }
      if (pointersRef.current.size > 2) return;

      const s = stateRef.current;
      if (s.playback.isPlaying) return;

      const player = findPlayerAt(pos.x, pos.y);
      const { currentTool } = s.ui;

      actions.hideContextMenu();
      dispatch({
        type: 'SET_INTERACTION',
        interaction: { isPointerDown: true, pointerMoved: false, pointerDownPosition: pos },
      });

      if (currentTool === 'select' && s.selection.selectedPlayerId) {
        const selected = s.drill.players.find(p => p.id === s.selection.selectedPlayerId);
        const world = screenToWorld(pos.x, pos.y, s.camera);
        if (selected && distance(world, { x: selected.x + ROUTE_HANDLE_OFFSET, y: selected.y }) <= ROUTE_HANDLE_RADIUS * 1.45) {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              drawingSkate: true,
              skateOwner: selected,
              skateRawPoints: [{ x: selected.x, y: selected.y }],
            },
          });
          actions.setModeBanner(`Draw #${selected.number}'s skating route`);
          return;
        }
      }

      // ---- UNIFIED SELECT ----------------------------------------------------
      // One tool does it all by context: grab a handle to reshape a line, drag a
      // player to draw their route (or, if they hold the puck, to pass/shoot),
      // hold a player to reposition, drag the coach to move him, else pan/orbit.
      if (currentTool === 'select') {
        // Reshape/re-aim handles on the current selection.
        const evHandle = findEventHandleAt(pos.x, pos.y);
        if (evHandle) {
          actions.pushUndo();
          gestureRef.current = { kind: evHandle.part, eventId: evHandle.event.id };
          return;
        }
        const routeCtl = findRouteControlAt(pos.x, pos.y);
        if (routeCtl) {
          actions.pushUndo();
          gestureRef.current = {
            kind: 'routePoint',
            pathId: routeCtl.path.id,
            index: routeCtl.index,
            controls: routeCtl.controls,
          };
          return;
        }

        if (player) {
          actions.selectPlayer(player.id);
          actions.selectEvent(null);
          const isCarrier =
            playerHasPuck(player, s.drill.players, s.drill.events) && canAddEvents(s.drill.events);
          dispatch({
            type: 'SET_INTERACTION',
            interaction: isCarrier
              ? { dragType: 'pass', dragFromPlayer: player, dragCurrentPosition: pos, holdTarget: player }
              : {
                  drawingSkate: true,
                  skateOwner: player,
                  skateRawPoints: [{ x: player.x, y: player.y }],
                  holdTarget: player,
                },
          });
          actions.setModeBanner(
            isCarrier
              ? `Drag #${player.number} to pass/shoot · hold to move`
              : `Drag #${player.number} to draw a route · hold to move`
          );
          // Hold in place to reposition instead of drawing.
          cancelHold();
          holdTimerRef.current = window.setTimeout(() => {
            actions.beginPlayerMove();
            dispatch({
              type: 'SET_INTERACTION',
              interaction: {
                movingPlayer: player,
                holdActive: true,
                drawingSkate: false,
                dragType: 'none',
                dragFromPlayer: null,
                skateRawPoints: [],
              },
            });
            actions.setModeBanner(`Moving #${player.number} — release to drop`);
          }, 230);
          return;
        }

        const coach = findCoachAt(pos.x, pos.y);
        if (coach) {
          actions.selectPlayer(null);
          actions.selectEvent(null);
          actions.pushUndo();
          gestureRef.current = { kind: 'coachMove', id: coach.id };
          actions.setModeBanner('Moving coach — release to drop');
          return;
        }

        // Empty ice: pan (flat) or orbit (tabletop).
        const tabletopSelect = (s.camera.tilt ?? 0) > TABLETOP_MIN_TILT;
        gestureRef.current = {
          kind: tabletopSelect ? 'orbit' : 'pan',
          startPointer: pos,
          startCamera: { ...s.camera },
        };
        return;
      }

      if (currentTool === 'pass') {
        if (!canAddEvents(s.drill.events)) {
          actions.showToast('Pass unavailable — this drill ends with a shot or dump. Undo or clear it first.', 'warning', 5000);
          actions.setModeBanner('Drill complete — undo the final shot/dump to continue passing');
          return;
        }
        if (player) {
          const holder = getCurrentPuckHolder(s.drill.players, s.drill.events);
          if (!s.selection.passFromPlayerId) {
            if (holder && holder.id !== player.id) {
              actions.showToast(`#${player.number} doesn't have the puck`, 'warning');
              return;
            }
            actions.setPassFrom(player.id);
            actions.selectPlayer(player.id);
            actions.setModeBanner(`Pass from #${player.number} — drag to a teammate or open ice`);
          }
          dispatch({
            type: 'SET_INTERACTION',
            interaction: { dragType: 'pass', dragFromPlayer: player, dragCurrentPosition: pos },
          });
          return;
        }
      }

      if (currentTool === 'shoot') {
        if (player) {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: { dragType: 'shoot', dragFromPlayer: player, dragCurrentPosition: pos },
          });
        }
        return;
      }

      if (currentTool === 'skate') {
        if (player) {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              drawingSkate: true,
              skateOwner: player,
              skateRawPoints: [{ x: player.x, y: player.y }],
            },
          });
        }
        return;
      }

      // Placement / erase tools (home, away, goalie, coach, erase) act on tap,
      // handled in handleTap on pointer-up. Nothing to start on press.
    },
    [
      getPointerPosition,
      beginPinch,
      findPlayerAt,
      findCoachAt,
      findRouteControlAt,
      findEventHandleAt,
      cancelHold,
      dispatch,
      actions,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getPointerPosition(e);
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, pos);

      const gesture = gestureRef.current;

      if (gesture?.kind === 'pinch') {
        updatePinch();
        return;
      }

      if (gesture?.kind === 'pan') {
        dispatch({
          type: 'SET_CAMERA',
          camera: {
            ...gesture.startCamera,
            zoom: gesture.startCamera.zoom,
            x: gesture.startCamera.x + (pos.x - gesture.startPointer.x),
            y: gesture.startCamera.y + (pos.y - gesture.startPointer.y),
          },
        });
        return;
      }

      if (gesture?.kind === 'orbit') {
        const dx = pos.x - gesture.startPointer.x;
        const dy = pos.y - gesture.startPointer.y;
        const rotation = (gesture.startCamera.rotation ?? 0) + dx * 0.006;
        const tilt = Math.max(
          0,
          Math.min(TABLETOP_MAX_TILT, (gesture.startCamera.tilt ?? 0) - dy * 0.005)
        );
        dispatch({
          type: 'SET_CAMERA',
          camera: { ...gesture.startCamera, rotation, tilt },
        });
        return;
      }

      // Edit gestures reshape drill geometry live; changes are applied on each
      // move and were snapshotted for undo when the gesture began.
      if (gesture?.kind === 'coachMove') {
        const world = screenToWorld(pos.x, pos.y, stateRef.current.camera);
        actions.moveCoach(gesture.id, world.x, world.y);
        return;
      }
      if (gesture?.kind === 'routePoint') {
        const world = screenToWorld(pos.x, pos.y, stateRef.current.camera);
        const controls = gesture.controls.map((c, i) =>
          i === gesture.index ? { x: world.x, y: world.y } : c
        );
        actions.updateSkatePoints(gesture.pathId, routeFromControls(controls));
        return;
      }
      if (gesture?.kind === 'eventEnd') {
        const world = screenToWorld(pos.x, pos.y, stateRef.current.camera);
        actions.updateEventPath(gesture.eventId, { x: world.x, y: world.y });
        return;
      }
      if (gesture?.kind === 'eventBend') {
        const world = screenToWorld(pos.x, pos.y, stateRef.current.camera);
        actions.updateEventPath(gesture.eventId, undefined, { x: world.x, y: world.y });
        return;
      }

      const s = stateRef.current;
      if (s.playback.isPlaying || !s.interaction.isPointerDown) return;

      const moved = s.interaction.pointerDownPosition
        ? distance(pos, s.interaction.pointerDownPosition) > MOVE_THRESHOLD
        : false;

      // Moving off the press point means the user is drawing/passing, not
      // holding to reposition - so cancel the pending hold-to-move.
      if (moved && !s.interaction.holdActive) cancelHold();

      if (s.interaction.movingPlayer) {
        const world = screenToWorld(pos.x, pos.y, s.camera);
        dispatch({
          type: 'SET_INTERACTION',
          interaction: { pointerMoved: true, dragCurrentPosition: pos },
        });
        actions.movePlayer(s.interaction.movingPlayer.id, world.x, world.y);
        return;
      }

      const interaction: Partial<typeof s.interaction> = {
        pointerMoved: moved || s.interaction.pointerMoved,
        dragCurrentPosition: pos,
      };

      if (s.interaction.drawingSkate && s.interaction.skateOwner) {
        const world = screenToWorld(pos.x, pos.y, s.camera);
        interaction.skateRawPoints = [...s.interaction.skateRawPoints, world];
      }

      if (s.interaction.nodeActive) interaction.nodeDragPosition = pos;

      dispatch({ type: 'SET_INTERACTION', interaction });
    },
    [getPointerPosition, updatePinch, cancelHold, dispatch, actions]
  );

  const handleTap = useCallback(
    (screenX: number, screenY: number) => {
      const s = stateRef.current;
      const player = findPlayerAt(screenX, screenY);
      const world = screenToWorld(screenX, screenY, s.camera);
      const { currentTool } = s.ui;

      if (currentTool === 'select') {
        if (player) {
          actions.selectPlayer(player.id);
          actions.selectEvent(null);
          return;
        }
        const event = findEventAt(screenX, screenY);
        if (event) {
          actions.selectEvent(event.id);
          actions.selectPlayer(null);
          return;
        }
        // Tapping a skate line selects its owner so its route handles appear -
        // this is how you adjust a path while the play is paused.
        const pathHit = findPathAt(screenX, screenY);
        if (pathHit) {
          actions.selectPlayer(pathHit.path.ownerId);
          actions.selectEvent(null);
          return;
        }
        actions.selectPlayer(null);
        actions.selectEvent(null);
        actions.clearBanners();
        return;
      }

      if (currentTool === 'pass') {
        if (!player) {
          actions.setPassFrom(null);
          actions.clearBanners();
          return;
        }

        const { passFromPlayerId } = s.selection;

        if (passFromPlayerId && passFromPlayerId !== player.id) {
          const fromPlayer = s.drill.players.find(p => p.id === passFromPlayerId);
          if (fromPlayer) {
            const validation = validatePass(fromPlayer, player, s.drill.players, s.drill.events);
            if (validation.valid) {
              actions.addPass(fromPlayer, player);
              actions.showToast(`Pass ${s.drill.events.length + 1} -> #${player.number}`, 'success');
              actions.setPassFrom(null);
              actions.clearBanners();
            } else {
              actions.showToast(validation.error!, 'warning');
            }
          }
          return;
        }

        if (!passFromPlayerId) {
          const holder = getCurrentPuckHolder(s.drill.players, s.drill.events);
          if (holder && holder.id !== player.id) {
            actions.showToast(
              `#${player.number} doesn't have puck - #${holder.number} does`,
              'warning'
            );
            return;
          }
          actions.setPassFrom(player.id);
          actions.selectPlayer(player.id);
          actions.setModeBanner(`Pass from #${player.number} - tap a teammate`);
          return;
        }

        actions.setPassFrom(null);
        actions.clearBanners();
        return;
      }

      if (currentTool === 'shoot') {
        if (!player) return;
        const validation = validateShot(player, s.drill.players, s.drill.events);
        if (validation.valid) {
          actions.addShot(player, getTargetNet(player.team), getFinalPlayerPoint(player));
          actions.showToast('Shot on net!', 'success');
        } else {
          actions.showToast(validation.error!, 'warning');
        }
        return;
      }

      if (currentTool === 'home' || currentTool === 'away') {
        if (player) return;
        actions.addPlayer(createPlayer(world.x, world.y, currentTool, randomPlayerNumber(), 'F'));
        actions.showToast(`${currentTool === 'home' ? 'Home' : 'Away'} player placed`, 'success');
        return;
      }

      if (currentTool === 'goalie') {
        if (player) return;
        // Goalies belong to whichever end they're placed in.
        const team = world.x < RINK.x + RINK.width / 2 ? 'away' : 'home';
        actions.addPlayer(createPlayer(world.x, world.y, team, randomGoalieNumber(), 'G'));
        actions.showToast('Goalie placed', 'success');
        return;
      }

      if (currentTool === 'coach') {
        if (player || findCoachAt(screenX, screenY)) return;
        actions.addCoach(createCoach(world.x, world.y));
        actions.showToast('Coach placed — drag him with Select', 'success');
        return;
      }

      if (currentTool === 'erase') {
        if (player) {
          actions.removePlayer(player.id);
          actions.selectPlayer(null);
          actions.showToast('Player removed', 'success');
          return;
        }
        const coach = findCoachAt(screenX, screenY);
        if (coach) {
          actions.removeCoach(coach.id);
          actions.showToast('Coach removed', 'success');
          return;
        }
        const pathHit = findPathAt(screenX, screenY);
        if (pathHit) {
          actions.removeSkatePath(pathHit.path.id);
          actions.showToast('Path removed', 'success');
          return;
        }
        const event = findEventAt(screenX, screenY);
        if (event) {
          actions.removeEvent(event.id);
          actions.showToast(`${event.type} removed`, 'success');
        }
      }
    },
    [findPlayerAt, findPathAt, findEventAt, findCoachAt, actions, getFinalPlayerPoint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      canvasRef.current?.releasePointerCapture?.(e.pointerId);

      const gesture = gestureRef.current;

      // Lifting one finger of a pinch shouldn't turn the other into a tap.
      if (gesture?.kind === 'pinch') {
        if (pointersRef.current.size < 2) gestureRef.current = null;
        return;
      }

      if (gesture?.kind === 'pan' || gesture?.kind === 'orbit') {
        gestureRef.current = null;
        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      // Edit gestures already applied their changes live; just close them out.
      if (
        gesture?.kind === 'coachMove' ||
        gesture?.kind === 'routePoint' ||
        gesture?.kind === 'eventBend' ||
        gesture?.kind === 'eventEnd'
      ) {
        gestureRef.current = null;
        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      const s = stateRef.current;
      if (s.playback.isPlaying) return;

      cancelHold();
      const pos = getPointerPosition(e);

      if (s.interaction.movingPlayer) {
        actions.showToast('Moved', 'success', 1200);
        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      if (
        s.interaction.drawingSkate &&
        s.interaction.pointerMoved &&
        s.interaction.skateOwner &&
        s.interaction.skateRawPoints.length > 5
      ) {
        const path = createSkatePath(
          s.interaction.skateOwner.id,
          s.interaction.skateOwner.team,
          processRawPath(s.interaction.skateRawPoints)
        );
        actions.addSkatePath(path);
        // Keep the owner selected so its route handles appear for tweaking.
        actions.selectPlayer(s.interaction.skateOwner.id);
        actions.showToast('Route drawn — drag its handles to reshape', 'success', 3600);
        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      // Pass started from a point on a skate path
      if (s.interaction.nodeActive && s.interaction.nodePath && s.interaction.nodeWorldPoint) {
        const targetPlayer = findPassReceiverAt(
          pos.x,
          pos.y,
          s.interaction.nodePath.ownerId
        );
        const pathOwner = s.drill.players.find(p => p.id === s.interaction.nodePath!.ownerId);

        if (targetPlayer && pathOwner && targetPlayer.id !== pathOwner.id) {
          // Land the pass on the receiver's route if they have one.
          const targetPath = s.drill.skatePaths.find(sp => sp.ownerId === targetPlayer.id);
          const toPoint =
            targetPath && targetPath.points.length > 0
              ? closestPointOnPolyline(targetPath.points, screenToWorld(pos.x, pos.y, s.camera)).point
              : { x: targetPlayer.x, y: targetPlayer.y };

          actions.addPathPass(
            pathOwner.id,
            targetPlayer.id,
            s.interaction.nodeWorldPoint,
            toPoint,
            pathOwner.team
          );
          actions.showToast(`Pass from path -> #${targetPlayer.number}`, 'success');
          actions.clearBanners();
        } else if (!targetPlayer && pathOwner && s.interaction.pointerMoved) {
          const dumpPoint = screenToWorld(pos.x, pos.y, s.camera);
          actions.addDump(pathOwner, dumpPoint, s.interaction.nodeWorldPoint);
          actions.showToast('Dump placed — the line is the puck route', 'success');
          actions.clearBanners();
        }

        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      if (s.interaction.dragType !== 'none' && s.interaction.pointerMoved && s.interaction.dragFromPlayer) {
        const fromPlayer = s.interaction.dragFromPlayer;

        if (s.interaction.dragType === 'pass') {
          // A pass only lands on a teammate; dragging onto an opponent (or the
          // opposing goalie) is not a pass, so the net check below can turn it
          // into a shot instead.
          const receiver = findPassReceiverAt(pos.x, pos.y, fromPlayer.id);
          const targetPlayer = receiver && receiver.team === fromPlayer.team ? receiver : null;
          const release = screenToWorld(pos.x, pos.y, s.camera);
          if (targetPlayer && targetPlayer.id !== fromPlayer.id) {
            const validation = validatePass(fromPlayer, targetPlayer, s.drill.players, s.drill.events);
            if (validation.valid) {
              actions.addPass(fromPlayer, targetPlayer, { x: fromPlayer.x, y: fromPlayer.y }, { x: targetPlayer.x, y: targetPlayer.y });
              actions.showToast(`Pass to #${targetPlayer.number} — receiver will collect`, 'success');
              actions.setPassFrom(null);
              actions.clearBanners();
            } else {
              actions.showToast(validation.error!, 'warning');
            }
          } else {
            // Released near a net = shot; anywhere else on open ice = dump. This
            // folds pass, shoot and dump into the one carrier drag.
            const nearNet = Math.min(
              distance(release, { x: RINK.netLeftX, y: RINK.netLeftY }),
              distance(release, { x: RINK.netRightX, y: RINK.netRightY })
            ) < SHOT_SNAP_DISTANCE;
            if (nearNet) {
              const validation = validateShot(fromPlayer, s.drill.players, s.drill.events);
              if (validation.valid) {
                actions.addShot(fromPlayer, getAimedNetTarget(release), getFinalPlayerPoint(fromPlayer));
                actions.showToast('Shot on net!', 'success');
                actions.setPassFrom(null);
                actions.clearBanners();
              } else {
                actions.showToast(validation.error!, 'warning');
              }
            } else {
              actions.addDump(fromPlayer, release, { x: fromPlayer.x, y: fromPlayer.y });
              actions.showToast('Dump placed — the line is the puck route', 'success');
              actions.setPassFrom(null);
              actions.clearBanners();
            }
          }
        } else if (s.interaction.dragType === 'shoot') {
          const validation = validateShot(fromPlayer, s.drill.players, s.drill.events);
          if (validation.valid) {
            actions.addShot(
              fromPlayer,
              getAimedNetTarget(screenToWorld(pos.x, pos.y, s.camera)),
              getFinalPlayerPoint(fromPlayer)
            );
            actions.showToast('Shot on net!', 'success');
          } else {
            actions.showToast(validation.error!, 'warning');
          }
        }

        dispatch({ type: 'RESET_INTERACTION' });
        return;
      }

      if (!s.interaction.pointerMoved) handleTap(pos.x, pos.y);
      dispatch({ type: 'RESET_INTERACTION' });
    },
    [getPointerPosition, cancelHold, findPassReceiverAt, handleTap, dispatch, actions, getFinalPlayerPoint]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      gestureRef.current = null;
      cancelHold();
      dispatch({ type: 'RESET_INTERACTION' });
    },
    [cancelHold, dispatch]
  );

  return (
    <div
      ref={containerRef}
      className="arena-stage absolute inset-0 overflow-hidden bg-[#050e18]"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}

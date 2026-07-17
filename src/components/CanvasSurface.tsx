// ============================================================================
// CANVAS SURFACE - Main canvas component with rendering and interaction
// ============================================================================

import { useRef, useEffect, useCallback } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { drawRink } from '@/canvas/RinkRenderer';
import { drawPlayers } from '@/canvas/PlayerRenderer';
import { drawMechanicsDiagnostics } from '@/canvas/DiagnosticsRenderer';
import {
  drawSkatePaths,
  drawRawSkate,
  drawEvents,
  drawDragPreview,
  drawGhostTrails,
  drawAnimatedPuck,
  drawPassFromHighlight,
} from '@/canvas/PathRenderer';
import {
  RINK,
  PLAYER_HIT_RADIUS,
  PATH_HIT_DISTANCE,
  MOVE_THRESHOLD,
  ROUTE_HANDLE_OFFSET,
  ROUTE_HANDLE_RADIUS,
  WHEEL_ZOOM_SENSITIVITY,
} from '@/core/constants';
import { screenToWorld, distance, closestPointOnPolyline, processRawPath } from '@/utils/geometry';
import { createPlayer, createSkatePath, randomPlayerNumber, randomGoalieNumber } from '@/engine/drill';
import {
  validatePass,
  validateShot,
  getCurrentPuckHolder,
  canAddEvents,
  getTargetNet,
  getAimedNetTarget,
  playerHasPuck,
} from '@/engine/puck';
import type { Player, SkatePath, Point, Camera, ID } from '@/core/types';
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

type Gesture = PinchGesture | PanGesture | null;

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
    const { camera, drill } = stateRef.current;
    const world = screenToWorld(screenX, screenY, camera);
    // Topmost first, matching draw order.
    for (let i = drill.players.length - 1; i >= 0; i--) {
      const p = drill.players[i];
      if (distance(p, world) < PLAYER_HIT_RADIUS) return p;
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

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    drawRink(ctx);

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

    drawPlayers(ctx, players, drill.events, {
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
    });

    if (s.animatedPuck?.visible) {
      drawAnimatedPuck(ctx, s.animatedPuck.x, s.animatedPuck.y, s.animatedPuck.state);
    }

    if (s.ui.showDiagnostics) {
      drawMechanicsDiagnostics(ctx, players, s.playbackPlayerFrames, s.animatedPuck);
    }

    ctx.restore();
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

      // A puck carrier's route is itself an action surface. In Select or Pass
      // mode, press any point on it and drag the puck line to a teammate or to
      // open ice for a dump.
      const pathHit = findPathAt(pos.x, pos.y);
      if (!player && (currentTool === 'select' || currentTool === 'pass') && pathHit && canAddEvents(s.drill.events)) {
        const pathOwner = s.drill.players.find(p => p.id === pathHit.path.ownerId);
        if (pathOwner && playerHasPuck(pathOwner, s.drill.players, s.drill.events)) {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              nodeActive: true,
              nodePath: pathHit.path,
              nodeWorldPoint: pathHit.point,
              nodeDragPosition: pos,
              dragFromPlayer: pathOwner,
              dragType: 'pass',
            },
          });
          actions.setModeBanner(`Puck at #${pathOwner.number}'s route — drag to pass or dump`);
          return;
        }
        if (pathOwner) actions.showToast(`#${pathOwner.number} does not have the puck`, 'warning');
        return;
      }

      if (currentTool !== 'select') return;

      if (player) {
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            holdTarget: player,
          },
        });
        actions.selectPlayer(player.id);
        return;
      }

      gestureRef.current = {
        kind: 'pan',
        startPointer: pos,
        startCamera: { ...s.camera },
      };
    },
    [getPointerPosition, beginPinch, findPlayerAt, findPathAt, dispatch, actions]
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
            zoom: gesture.startCamera.zoom,
            x: gesture.startCamera.x + (pos.x - gesture.startPointer.x),
            y: gesture.startCamera.y + (pos.y - gesture.startPointer.y),
          },
        });
        return;
      }

      const s = stateRef.current;
      if (s.playback.isPlaying || !s.interaction.isPointerDown) return;

      const moved = s.interaction.pointerDownPosition
        ? distance(pos, s.interaction.pointerDownPosition) > MOVE_THRESHOLD
        : false;

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

      if (
        moved &&
        s.ui.currentTool === 'select' &&
        s.interaction.holdTarget &&
        !s.interaction.drawingSkate
      ) {
        const world = screenToWorld(pos.x, pos.y, s.camera);
        actions.beginPlayerMove();
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            pointerMoved: true,
            holdActive: true,
            movingPlayer: s.interaction.holdTarget,
            dragCurrentPosition: pos,
          },
        });
        actions.movePlayer(s.interaction.holdTarget.id, world.x, world.y);
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
        const event = findEventAt(screenX, screenY);
        if (event) {
          actions.selectEvent(event.id);
          return;
        }
        if (player) {
          actions.selectPlayer(player.id);
        } else {
          actions.selectPlayer(null);
        }
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

      if (currentTool === 'erase') {
        if (player) {
          actions.removePlayer(player.id);
          actions.selectPlayer(null);
          actions.showToast('Player removed', 'success');
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
    [findPlayerAt, findPathAt, findEventAt, actions, getFinalPlayerPoint]
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

      if (gesture?.kind === 'pan') {
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
        actions.showToast('Path drawn - tap path line to add a pass', 'success', 4000);
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
          const targetPlayer = findPassReceiverAt(pos.x, pos.y, fromPlayer.id);
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
            const dumpPoint = screenToWorld(pos.x, pos.y, s.camera);
            actions.addDump(
              fromPlayer,
              dumpPoint,
              { x: fromPlayer.x, y: fromPlayer.y }
            );
            actions.showToast('Dump placed — the line is the puck route', 'success');
            actions.setPassFrom(null);
            actions.clearBanners();
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

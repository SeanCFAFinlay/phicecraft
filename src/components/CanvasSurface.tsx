// ============================================================================
// CANVAS SURFACE - Main canvas component with rendering and interaction
// ============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useCanvas } from '@/hooks/useCanvas';
import { drawRink } from '@/canvas/RinkRenderer';
import { drawPlayers } from '@/canvas/PlayerRenderer';
import {
  drawSkatePaths,
  drawRawSkate,
  drawEvents,
  drawDragPreview,
  drawGhostTrails,
  drawAnimatedPuck,
  drawPassFromHighlight,
} from '@/canvas/PathRenderer';
import { COLORS, RINK, PLAYER_HIT_RADIUS, PATH_HIT_DISTANCE, MOVE_THRESHOLD, HOLD_DURATION } from '@/core/constants';
import { screenToWorld, distance, closestPointOnPolyline, processRawPath } from '@/utils/geometry';
import { createPlayer, createSkatePath, randomPlayerNumber, randomGoalieNumber } from '@/engine/drill';
import { validatePass, validateShot, getCurrentPuckHolder, canAddEvents, getTargetNet, getNearestNet } from '@/engine/puck';
import type { Player, SkatePath, Point } from '@/core/types';

export function CanvasSurface() {
  const { state, dispatch, actions } = useAppState();
  const holdTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const {
    canvasRef,
    containerRef,
    contextRef,
    getCanvasSize,
    getPointerPosition,
  } = useCanvas({
    onResize: useCallback((width: number, height: number) => {
      dispatch({ type: 'SET_CANVAS_SIZE', width, height });
    }, [dispatch]),
  });

  // Find player at screen position
  const findPlayerAt = useCallback((screenX: number, screenY: number): Player | null => {
    const world = screenToWorld(screenX, screenY, state.camera);

    for (let i = state.drill.players.length - 1; i >= 0; i--) {
      const p = state.drill.players[i];
      const dist = Math.sqrt((p.x - world.x) ** 2 + (p.y - world.y) ** 2);
      if (dist < PLAYER_HIT_RADIUS) {
        return p;
      }
    }
    return null;
  }, [state.camera, state.drill.players]);

  // Find skate path at screen position
  const findPathAt = useCallback((screenX: number, screenY: number): { path: SkatePath; point: Point; t: number } | null => {
    const world = screenToWorld(screenX, screenY, state.camera);

    for (const path of state.drill.skatePaths) {
      if (!path.points || path.points.length < 2) continue;
      const result = closestPointOnPolyline(path.points, world);
      if (result.distance * state.camera.zoom < PATH_HIT_DISTANCE) {
        return { path, point: result.point, t: result.t };
      }
    }
    return null;
  }, [state.camera, state.drill.skatePaths]);

  // Cancel hold timer
  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Draw the canvas
  const draw = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    const { width, height } = getCanvasSize();

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Apply camera transform
    ctx.save();
    ctx.translate(state.camera.x, state.camera.y);
    ctx.scale(state.camera.zoom, state.camera.zoom);

    // Draw rink
    drawRink(ctx);

    // Draw ghost trails (during playback)
    if (state.playback.isPlaying) {
      drawGhostTrails(ctx, state.ghostTrails, state.drill.players);
    }

    // Draw skate paths
    drawSkatePaths(ctx, state.drill.skatePaths);

    // Draw raw skate being drawn
    if (state.interaction.drawingSkate && state.interaction.skateRawPoints.length >= 2) {
      const team = state.interaction.skateOwner?.team ?? 'home';
      drawRawSkate(ctx, state.interaction.skateRawPoints, team);
    }

    // Draw events (passes/shots)
    drawEvents(ctx, state.drill.events);

    // Draw drag preview
    if (state.interaction.dragType !== 'none' &&
        state.interaction.dragFromPlayer &&
        state.interaction.dragCurrentPosition &&
        state.interaction.pointerMoved) {

      const toWorld = screenToWorld(
        state.interaction.dragCurrentPosition.x,
        state.interaction.dragCurrentPosition.y,
        state.camera
      );

      const targetPlayer = state.interaction.dragType === 'pass'
        ? findPlayerAt(state.interaction.dragCurrentPosition.x, state.interaction.dragCurrentPosition.y)
        : null;

      drawDragPreview(
        ctx,
        state.interaction.dragType as 'pass' | 'shoot',
        { x: state.interaction.dragFromPlayer.x, y: state.interaction.dragFromPlayer.y },
        toWorld,
        targetPlayer !== state.interaction.dragFromPlayer ? targetPlayer : null,
        RINK.height
      );
    }

    // Draw pass-from highlight
    if (state.selection.passFromPlayerId) {
      const passFromPlayer = state.drill.players.find(p => p.id === state.selection.passFromPlayerId);
      if (passFromPlayer) {
        drawPassFromHighlight(ctx, passFromPlayer);
      }
    }

    // Draw players
    const nodeActiveOwnerId = state.interaction.nodeActive && state.interaction.nodePath
      ? state.interaction.nodePath.ownerId
      : null;

    drawPlayers(
      ctx,
      state.drill.players,
      state.drill.events,
      state.selection.selectedPlayerId,
      state.selection.passFromPlayerId,
      state.interaction.dragFromPlayer,
      state.interaction.movingPlayer,
      nodeActiveOwnerId
    );

    // Draw animated puck
    if (state.animatedPuck && state.animatedPuck.visible) {
      drawAnimatedPuck(ctx, state.animatedPuck.x, state.animatedPuck.y);
    }

    ctx.restore();
  }, [state, getCanvasSize, findPlayerAt]);

  // Animation loop for playback
  useEffect(() => {
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!state.playback.isPlaying) return;

      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const duration = state.playback.duration / state.playback.speed;
      const progress = Math.min(elapsed / duration, 1);

      dispatch({ type: 'SET_PLAYBACK_PROGRESS', progress });

      // Update player positions
      state.drill.players.forEach(player => {
        const path = state.drill.skatePaths.find(sp => sp.ownerId === player.id);
        if (path && path.points.length > 1) {
          const t = Math.min(progress * 1.06, 1);
          // Calculate position along path
          const totalLen = path.points.reduce((acc, p, i) => {
            if (i === 0) return 0;
            return acc + distance(path.points[i - 1], p);
          }, 0);
          let targetDist = t * totalLen;
          let accumulated = 0;
          let px = path.points[0].x, py = path.points[0].y;

          for (let i = 1; i < path.points.length; i++) {
            const segLen = distance(path.points[i - 1], path.points[i]);
            if (accumulated + segLen >= targetDist) {
              const segT = (targetDist - accumulated) / segLen;
              px = path.points[i - 1].x + (path.points[i].x - path.points[i - 1].x) * segT;
              py = path.points[i - 1].y + (path.points[i].y - path.points[i - 1].y) * segT;
              break;
            }
            accumulated += segLen;
            px = path.points[i].x;
            py = path.points[i].y;
          }

          dispatch({ type: 'MOVE_PLAYER', id: player.id, x: px, y: py });
          dispatch({ type: 'UPDATE_GHOST_TRAIL', playerId: player.id, point: { x: px, y: py } });
        }
      });

      draw();

      if (progress >= 1) {
        actions.stopPlayback();
        actions.resetPlayback();
        actions.showToast('Drill complete!', 'success');
      } else {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (state.playback.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.playback.isPlaying, state.playback.speed, state.playback.duration, dispatch, draw, actions]);

  // Draw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Ensure initial draw after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      draw();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (state.playback.isPlaying) return;

    const pos = getPointerPosition(e);
    const player = findPlayerAt(pos.x, pos.y);
    const { currentTool } = state.ui;

    actions.hideContextMenu();

    dispatch({
      type: 'SET_INTERACTION',
      interaction: {
        isPointerDown: true,
        pointerMoved: false,
        pointerDownPosition: pos,
      },
    });

    // Tool-specific behavior
    if (currentTool === 'pass') {
      if (player) {
        const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
        if (!state.selection.passFromPlayerId) {
          // First tap - select passer
          if (holder && holder.id !== player.id) {
            actions.showToast(`#${player.number} doesn't have the puck`, 'warning');
            return;
          }
          actions.setPassFrom(player.id);
          actions.selectPlayer(player.id);
          actions.setModeBanner(`Pass from #${player.number} - tap a teammate`);
        }
        // Also start drag
        dispatch({
          type: 'SET_INTERACTION',
          interaction: { dragType: 'pass', dragFromPlayer: player, dragCurrentPosition: pos },
        });
      }
      return;
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

    if (currentTool === 'select') {
      if (player) {
        // Start skate drawing prep and hold timer
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            skateOwner: player,
            skateRawPoints: [{ x: player.x, y: player.y }],
            holdTarget: player,
          },
        });

        holdTimerRef.current = window.setTimeout(() => {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              holdActive: true,
              movingPlayer: player,
              drawingSkate: false,
              skateRawPoints: [],
            },
          });
          actions.selectPlayer(player.id);
          actions.showToast('Drag to move player', 'info', 0);
        }, HOLD_DURATION);
      } else {
        // Check for path tap
        const pathHit = findPathAt(pos.x, pos.y);
        if (pathHit && canAddEvents(state.drill.events)) {
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              nodeActive: true,
              nodePath: pathHit.path,
              nodeWorldPoint: pathHit.point,
              nodeDragPosition: pos,
            },
          });
          actions.setModeBanner('Drag to a player to add a pass from this point');
        }
      }
    }
  }, [state, dispatch, actions, getPointerPosition, findPlayerAt, findPathAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (state.playback.isPlaying) return;
    if (!state.interaction.isPointerDown) return;

    const pos = getPointerPosition(e);
    const moved = state.interaction.pointerDownPosition
      ? distance(pos, state.interaction.pointerDownPosition) > MOVE_THRESHOLD
      : false;

    if (moved && !state.interaction.holdActive) {
      cancelHold();
    }

    dispatch({
      type: 'SET_INTERACTION',
      interaction: {
        pointerMoved: moved || state.interaction.pointerMoved,
        dragCurrentPosition: pos,
      },
    });

    // Moving player
    if (state.interaction.movingPlayer) {
      const world = screenToWorld(pos.x, pos.y, state.camera);
      dispatch({ type: 'MOVE_PLAYER', id: state.interaction.movingPlayer.id, x: world.x, y: world.y });
      draw();
      return;
    }

    // Drawing skate
    if (state.ui.currentTool === 'select' && state.interaction.skateOwner && !state.interaction.holdActive && moved) {
      dispatch({
        type: 'SET_INTERACTION',
        interaction: { drawingSkate: true },
      });
      cancelHold();
    }

    if (state.interaction.drawingSkate && state.interaction.skateOwner) {
      const world = screenToWorld(pos.x, pos.y, state.camera);
      dispatch({
        type: 'SET_INTERACTION',
        interaction: {
          skateRawPoints: [...state.interaction.skateRawPoints, { x: world.x, y: world.y }],
        },
      });
    }

    // Node drag
    if (state.interaction.nodeActive) {
      dispatch({
        type: 'SET_INTERACTION',
        interaction: { nodeDragPosition: pos },
      });
    }

    draw();
  }, [state, dispatch, getPointerPosition, cancelHold, draw]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (state.playback.isPlaying) return;

    cancelHold();
    const pos = getPointerPosition(e);

    // Handle moving player end
    if (state.interaction.movingPlayer) {
      actions.showToast('Moved', 'success', 1200);
      dispatch({ type: 'SAVE_START_SNAPSHOT' });
      dispatch({ type: 'RESET_INTERACTION' });
      draw();
      return;
    }

    // Handle skate path completion
    if (state.interaction.drawingSkate && state.interaction.pointerMoved && state.interaction.skateRawPoints.length > 5) {
      const smoothed = processRawPath(state.interaction.skateRawPoints);
      const path = createSkatePath(
        state.interaction.skateOwner!.id,
        state.interaction.skateOwner!.team,
        smoothed
      );
      actions.addSkatePath(path);
      actions.showToast('Path drawn - tap path line to add a pass', 'success', 4000);
      dispatch({ type: 'RESET_INTERACTION' });
      draw();
      return;
    }

    // Handle drag completion
    if (state.interaction.dragType !== 'none' && state.interaction.pointerMoved && state.interaction.dragFromPlayer) {
      const targetPlayer = findPlayerAt(pos.x, pos.y);

      if (state.interaction.dragType === 'pass') {
        if (targetPlayer && targetPlayer.id !== state.interaction.dragFromPlayer.id) {
          const validation = validatePass(
            state.interaction.dragFromPlayer,
            targetPlayer,
            state.drill.players,
            state.drill.events
          );

          if (validation.valid) {
            actions.addPass(state.interaction.dragFromPlayer, targetPlayer);
            actions.showToast(`Pass ${state.drill.events.length + 1} -> #${targetPlayer.number}`, 'success');
            actions.setPassFrom(null);
            actions.clearBanners();
          } else {
            actions.showToast(validation.error!, 'warning');
          }
        } else {
          actions.showToast('Drag all the way to a teammate to pass', 'info');
        }
      } else if (state.interaction.dragType === 'shoot') {
        const world = screenToWorld(pos.x, pos.y, state.camera);
        const net = getNearestNet(world);
        const validation = validateShot(
          state.interaction.dragFromPlayer,
          state.drill.players,
          state.drill.events
        );

        if (validation.valid) {
          actions.addShot(state.interaction.dragFromPlayer, net);
          actions.showToast('Shot on net!', 'success');
        } else {
          actions.showToast(validation.error!, 'warning');
        }
      }

      dispatch({ type: 'RESET_INTERACTION' });
      draw();
      return;
    }

    // Handle tap (no movement)
    if (!state.interaction.pointerMoved) {
      handleTap(pos.x, pos.y);
    }

    dispatch({ type: 'RESET_INTERACTION' });
    draw();
  }, [state, dispatch, actions, getPointerPosition, cancelHold, findPlayerAt, draw]);

  const handleTap = useCallback((screenX: number, screenY: number) => {
    const player = findPlayerAt(screenX, screenY);
    const world = screenToWorld(screenX, screenY, state.camera);
    const { currentTool } = state.ui;

    if (currentTool === 'select') {
      if (player) {
        actions.selectPlayer(player.id);
        actions.showContextMenu({ x: screenX, y: screenY }, player.id);
      } else {
        actions.selectPlayer(null);
      }
      return;
    }

    if (currentTool === 'pass') {
      if (player) {
        if (state.selection.passFromPlayerId && state.selection.passFromPlayerId !== player.id) {
          // Second tap - receiver
          const fromPlayer = state.drill.players.find(p => p.id === state.selection.passFromPlayerId);
          if (fromPlayer) {
            const validation = validatePass(fromPlayer, player, state.drill.players, state.drill.events);
            if (validation.valid) {
              actions.addPass(fromPlayer, player);
              actions.showToast(`Pass ${state.drill.events.length + 1} -> #${player.number}`, 'success');
              actions.setPassFrom(null);
              actions.clearBanners();
            } else {
              actions.showToast(validation.error!, 'warning');
            }
          }
        } else if (!state.selection.passFromPlayerId) {
          // First tap - select passer
          const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
          if (holder && holder.id !== player.id) {
            actions.showToast(`#${player.number} doesn't have puck - #${holder.number} does`, 'warning');
            return;
          }
          actions.setPassFrom(player.id);
          actions.selectPlayer(player.id);
          actions.setModeBanner(`Pass from #${player.number} - tap a teammate`);
        } else {
          // Tapped same player - cancel
          actions.setPassFrom(null);
          actions.clearBanners();
        }
      } else {
        actions.setPassFrom(null);
        actions.clearBanners();
      }
      return;
    }

    if (currentTool === 'shoot') {
      if (player) {
        const net = getTargetNet(player.team);
        const validation = validateShot(player, state.drill.players, state.drill.events);
        if (validation.valid) {
          actions.addShot(player, net);
          actions.showToast('Shot on net!', 'success');
        } else {
          actions.showToast(validation.error!, 'warning');
        }
      }
      return;
    }

    if (currentTool === 'home') {
      if (!player) {
        const newPlayer = createPlayer(world.x, world.y, 'home', randomPlayerNumber(), 'F');
        actions.addPlayer(newPlayer);
        actions.showToast('Home player placed', 'success');
      }
      return;
    }

    if (currentTool === 'away') {
      if (!player) {
        const newPlayer = createPlayer(world.x, world.y, 'away', randomPlayerNumber(), 'F');
        actions.addPlayer(newPlayer);
        actions.showToast('Away player placed', 'success');
      }
      return;
    }

    if (currentTool === 'goalie') {
      if (!player) {
        const team = Math.random() > 0.5 ? 'home' : 'away';
        const newPlayer = createPlayer(world.x, world.y, team, randomGoalieNumber(), 'G');
        actions.addPlayer(newPlayer);
        actions.showToast('Goalie placed', 'success');
      }
      return;
    }

    if (currentTool === 'erase') {
      if (player) {
        actions.removePlayer(player.id);
        actions.selectPlayer(null);
        actions.showToast('Player removed', 'success');
      } else {
        const pathHit = findPathAt(screenX, screenY);
        if (pathHit) {
          actions.removeSkatePath(pathHit.path.id);
          actions.showToast('Path removed', 'success');
        }
      }
    }
  }, [state, actions, findPlayerAt, findPathAt]);

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-[#050e18]"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}

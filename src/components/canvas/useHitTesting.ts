// ============================================================================
// HIT TESTING
//
// World-coordinate hit tests, shared by the gesture machine and the keyboard
// paths. Everything reads live state through refs, so the tester identity is
// stable and never re-creates the gesture machine.
// ============================================================================

import { useMemo } from 'react';
import type { AppState, ID, Point, SkatePath } from '@/core/types';
import {
  PATH_HIT_DISTANCE,
  PLAYER_HIT_RADIUS,
  ROUTE_HANDLE_OFFSET,
  ROUTE_HANDLE_RADIUS,
} from '@/core/constants';
import { closestPointOnPolyline, distance, routeControlPoints, screenToWorld } from '@/utils/geometry';
import { eventBendPoint } from '@/canvas/PathRenderer';
import { getCurrentPuckHolder, canAddEvents } from '@/engine/puck';
import type { CameraStore } from '@/camera/CameraStore';
import type { PlaybackStore } from '@/playback/PlaybackStore';
import type { HitTester } from '@/editor/input/gestureTypes';

/** Screen-pixel radius for grabbing an edit handle. */
const HANDLE_HIT = 20;
/** How forgiving pass targeting is, in screen pixels. */
const PASS_TARGET_RADIUS = 68;
const PASS_ROUTE_RADIUS = 42;

export interface HitTestingOptions {
  getState: () => AppState;
  camera: CameraStore;
  playback: PlaybackStore;
}

export function useHitTesting({ getState, camera, playback }: HitTestingOptions): HitTester {
  return useMemo<HitTester>(() => {
    const toWorld = (point: Point): Point =>
      screenToWorld(point.x, point.y, camera.camera);

    /** Where a player is drawn right now: interpolated while scrubbing. */
    const drawnPosition = (playerId: ID, fallback: Point): Point =>
      playback.positionFor(playerId) ?? fallback;

    return {
      toWorld,

      playerAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        // Topmost first, matching draw order.
        for (let index = drill.players.length - 1; index >= 0; index--) {
          const player = drill.players[index];
          const at = drawnPosition(player.id, player);
          if (distance(at, world) < PLAYER_HIT_RADIUS) {
            const holder = getCurrentPuckHolder(drill.players, drill.events);
            return {
              id: player.id,
              isCarrier: holder?.id === player.id && canAddEvents(drill.events),
            };
          }
        }
        return null;
      },

      coachAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const coaches = drill.coaches ?? [];
        for (let index = coaches.length - 1; index >= 0; index--) {
          if (distance(coaches[index], world) < PLAYER_HIT_RADIUS * 1.2) return coaches[index].id;
        }
        return null;
      },

      routeAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        for (const path of drill.skatePaths) {
          if (!path.points || path.points.length < 2) continue;
          const hit = closestPointOnPolyline(path.points, world);
          if (hit.distance * zoom < PATH_HIT_DISTANCE) {
            return { pathId: path.id, ownerId: path.ownerId, point: hit.point };
          }
        }
        return null;
      },

      eventAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        for (let index = drill.events.length - 1; index >= 0; index--) {
          const event = drill.events[index];
          const hit = closestPointOnPolyline([event.fromPoint, event.toPoint], world);
          if (hit.distance * zoom <= PATH_HIT_DISTANCE) return event.id;
        }
        return null;
      },

      routeHandleAt(point) {
        const state = getState();
        if (state.playback.isPlaying) return null;
        const ownerId = state.selection.selectedPlayerId;
        if (!ownerId) return null;

        const path: SkatePath | undefined = state.drill.skatePaths.find(
          route => route.ownerId === ownerId
        );
        if (!path || path.points.length < 2) return null;

        const controls = routeControlPoints(path.points);
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        // Index 0 is pinned to the player and is not draggable.
        for (let index = 1; index < controls.length; index++) {
          if (distance(controls[index], world) * zoom < HANDLE_HIT) {
            return { pathId: path.id, index, controls };
          }
        }
        return null;
      },

      eventHandleAt(point) {
        const state = getState();
        if (state.playback.isPlaying) return null;
        const eventId = state.selection.selectedEventId;
        if (!eventId) return null;

        const event = state.drill.events.find(item => item.id === eventId);
        if (!event) return null;

        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        if (
          (event.type === 'shot' || event.type === 'dump') &&
          distance(event.toPoint, world) * zoom < HANDLE_HIT
        ) {
          return { eventId: event.id, part: 'end' };
        }
        if (distance(eventBendPoint(event), world) * zoom < HANDLE_HIT) {
          return { eventId: event.id, part: 'bend' };
        }
        return null;
      },

      routeAffordanceAt(point) {
        const state = getState();
        if (state.playback.isPlaying) return null;
        const selectedId = state.selection.selectedPlayerId;
        if (!selectedId) return null;

        const selected = state.drill.players.find(player => player.id === selectedId);
        if (!selected) return null;

        const world = toWorld(point);
        const handle = { x: selected.x + ROUTE_HANDLE_OFFSET, y: selected.y };
        return distance(world, handle) <= ROUTE_HANDLE_RADIUS * 1.45 ? selected.id : null;
      },

      /**
       * Passing is deliberately more forgiving than selecting a token: a coach
       * can release near the skater OR anywhere along that skater's route and
       * the gesture still locks to the intended receiver.
       */
      passReceiverAt(point, excludePlayerId) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        let best: { id: ID; screenDistance: number } | null = null;

        for (const player of drill.players) {
          if (player.id === excludePlayerId) continue;
          const screenDistance = distance(player, world) * zoom;
          if (screenDistance <= PASS_TARGET_RADIUS && (!best || screenDistance < best.screenDistance)) {
            best = { id: player.id, screenDistance };
          }
        }

        for (const path of drill.skatePaths) {
          if (path.ownerId === excludePlayerId || path.points.length < 2) continue;
          if (!drill.players.some(player => player.id === path.ownerId)) continue;
          const routeDistance = closestPointOnPolyline(path.points, world).distance * zoom;
          // Prefer a direct token hit, but make a clearly targeted route valid.
          const weighted = routeDistance + 12;
          if (routeDistance <= PASS_ROUTE_RADIUS && (!best || weighted < best.screenDistance)) {
            best = { id: path.ownerId, screenDistance: weighted };
          }
        }

        return best?.id ?? null;
      },
    };
  }, [getState, camera, playback]);
}

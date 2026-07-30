// ============================================================================
// PLAYBACK FRAME
//
// The deterministic sample: given a drill and a normalized progress, produce
// exactly the same frame every time. Extracted from the reducer unchanged, so
// scrubbing and animating still take the identical path.
// ============================================================================

import type {
  AnimatedPuck,
  Drill,
  DrillLifecycleState,
  ID,
  PlaybackPlayerFrame,
  Point,
} from '@/core/types';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';

export interface PlaybackFrame {
  progress: number;
  durationSeconds: number;
  firedEventIndices: number[];
  positions: Record<ID, Point>;
  playerFrames: Record<ID, PlaybackPlayerFrame>;
  puck: AnimatedPuck | null;
  lifecycle: DrillLifecycleState;
}

export const EMPTY_FRAME: PlaybackFrame = {
  progress: 0,
  durationSeconds: 0,
  firedEventIndices: [],
  positions: {},
  playerFrames: {},
  puck: null,
  lifecycle: 'ready',
};

export function derivePlaybackFrame(drill: Drill, progress: number, isPlaying: boolean): PlaybackFrame {
  const clamped = Math.max(0, Math.min(1, progress));
  const compiled = compileDrill(drill);
  const frame = sampleFrame(compiled, clamped * compiled.durationSeconds);

  const positions: Record<ID, Point> = {};
  for (const [id, playerFrame] of Object.entries(frame.players)) {
    positions[id] = playerFrame.position;
  }

  return {
    progress: clamped,
    durationSeconds: frame.durationSeconds,
    firedEventIndices: frame.firedEventIndices,
    positions,
    playerFrames: frame.players,
    puck: frame.puck,
    lifecycle: isPlaying && frame.lifecycle === 'ready' ? 'active' : frame.lifecycle,
  };
}

// ----------------------------------------------------------------------------
// Ghost trails
// ----------------------------------------------------------------------------

/** An allocation-free-per-call trail source, for a render path that cannot afford a Map or array per frame. */
export interface GhostTrailsSource {
  /**
   * Visit each player with an accumulated trail, oldest point first.
   *
   * The `points` array is reused across every callback invocation in the
   * SAME `forEach` call - it is only valid for the duration of that one
   * invocation. A consumer that needs the data afterward must copy it out
   * (e.g. `[...points]`), never retain the reference itself.
   */
  forEach(cb: (playerId: ID, points: readonly Point[]) => void): void;
}

/** No trails: the singleton passed in whenever playback is not running. */
export const EMPTY_TRAILS: GhostTrailsSource = {
  forEach: () => {},
};

/**
 * A fixed-capacity ring buffer per player.
 *
 * The old implementation cloned a Map and every point array once per player
 * per frame. This allocates once, writes in place, and is owned by the
 * renderer rather than the document reducer.
 */
export class GhostTrailBuffer implements GhostTrailsSource {
  private readonly buffers = new Map<ID, { points: Point[]; head: number; size: number }>();
  /** Reused by `forEach` across every player it visits in one pass - see `GhostTrailsSource`. */
  private readonly scratch: Point[] = [];

  constructor(private readonly capacity: number) {}

  push(playerId: ID, point: Point | undefined): void {
    if (!point) return;
    let buffer = this.buffers.get(playerId);
    if (!buffer) {
      buffer = { points: new Array<Point>(this.capacity), head: 0, size: 0 };
      this.buffers.set(playerId, buffer);
    }

    // Skip a sample that has not meaningfully moved, so a stationary player
    // does not fill the buffer with the same coordinate.
    const last = buffer.size > 0 ? buffer.points[(buffer.head - 1 + this.capacity) % this.capacity] : null;
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) return;

    buffer.points[buffer.head] = { x: point.x, y: point.y };
    buffer.head = (buffer.head + 1) % this.capacity;
    buffer.size = Math.min(buffer.size + 1, this.capacity);
  }

  /** Oldest-first points for one player. */
  read(playerId: ID): Point[] {
    const buffer = this.buffers.get(playerId);
    if (!buffer || buffer.size === 0) return [];

    const result: Point[] = new Array(buffer.size);
    const start = (buffer.head - buffer.size + this.capacity) % this.capacity;
    for (let index = 0; index < buffer.size; index++) {
      result[index] = buffer.points[(start + index) % this.capacity];
    }
    return result;
  }

  entries(): [ID, Point[]][] {
    return [...this.buffers.keys()].map(id => [id, this.read(id)]);
  }

  /** Allocation-free-per-call: see `GhostTrailsSource` for the reuse contract. */
  forEach(cb: (playerId: ID, points: readonly Point[]) => void): void {
    for (const [playerId, buffer] of this.buffers) {
      if (buffer.size === 0) continue;

      this.scratch.length = 0;
      const start = (buffer.head - buffer.size + this.capacity) % this.capacity;
      for (let index = 0; index < buffer.size; index++) {
        this.scratch.push(buffer.points[(start + index) % this.capacity]);
      }
      cb(playerId, this.scratch);
    }
  }

  clear(): void {
    this.buffers.clear();
  }
}

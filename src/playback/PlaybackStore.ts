// ============================================================================
// PLAYBACK STORE
//
// The frame store. The rAF loop writes here 60 times a second and the canvas
// reads it directly; React never sees a per-frame update. Panels that display
// a number (the clock, the timeline head) subscribe to a coarse snapshot that
// only changes when the displayed value would.
// ============================================================================

import type { Drill, ID, Point } from '@/core/types';
import { GHOST_TRAIL_MAX_LENGTH } from '@/core/constants';
import { EMPTY_FRAME, GhostTrailBuffer, derivePlaybackFrame, type PlaybackFrame } from './playbackFrame';

/** The single synthetic key `puckTrail` is stored/read under - see its own doc comment on the field below. */
export const PUCK_TRAIL_KEY = 'puck';

/** What React is allowed to see. Deliberately small and low-frequency. */
export interface PlaybackDisplaySnapshot {
  /** Progress rounded to 1%, so a panel re-renders ~100 times per play, not 60/s. */
  progressPercent: number;
  durationSeconds: number;
  lifecycle: PlaybackFrame['lifecycle'];
  firedEventCount: number;
}

export class PlaybackStore {
  private frame: PlaybackFrame = EMPTY_FRAME;
  private drill: Drill | null = null;
  private playing = false;

  /** Canvas-level subscribers: called on every frame. */
  private frameListeners = new Set<() => void>();
  /** React-level subscribers: called only when the display snapshot changes. */
  private displayListeners = new Set<() => void>();

  private display: PlaybackDisplaySnapshot = {
    progressPercent: 0,
    durationSeconds: 0,
    lifecycle: 'ready',
    firedEventCount: 0,
  };

  readonly trails = new GhostTrailBuffer(GHOST_TRAIL_MAX_LENGTH);
  /**
   * The puck's own trail, mirroring `trails`' exact lifecycle (same
   * `seek`/`setPlaying`/`reset` sites) so scrub/reset semantics can never
   * diverge between the two - see this class's own header. Keyed by a
   * single synthetic id (`PUCK_TRAIL_KEY`) since there is only ever one
   * puck, in the same `GhostTrailBuffer` shape the 3D renderer already
   * knows how to read (`puckTrail.ts`).
   */
  readonly puckTrail = new GhostTrailBuffer(GHOST_TRAIL_MAX_LENGTH);

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  subscribeToFrames = (listener: () => void): (() => void) => {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  };

  subscribe = (listener: () => void): (() => void) => {
    this.displayListeners.add(listener);
    return () => {
      this.displayListeners.delete(listener);
    };
  };

  getSnapshot = (): PlaybackDisplaySnapshot => this.display;

  getFrame = (): PlaybackFrame => this.frame;

  get isScrubbed(): boolean {
    return this.frame.progress > 0 || Object.keys(this.frame.positions).length > 0;
  }

  // --------------------------------------------------------------------------
  // Writing
  // --------------------------------------------------------------------------

  /** The document the clock samples. Changing it resets the frame. */
  setDrill(drill: Drill): void {
    if (this.drill === drill) return;
    this.drill = drill;
    this.reset();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (!playing) return;
    this.trails.clear();
    this.puckTrail.clear();
  }

  /**
   * Sample the deterministic engine at `progress` and publish the frame.
   * Called by the rAF loop and by scrubbing; both take the same path.
   */
  seek(progress: number): PlaybackFrame {
    if (!this.drill) return this.frame;

    const frame = derivePlaybackFrame(this.drill, progress, this.playing);
    this.frame = frame;

    // Trails accumulate only while actually playing - scrubbing must not smear.
    if (this.playing) {
      for (const player of this.drill.players) {
        const hasRoute = this.drill.skatePaths.some(route => route.ownerId === player.id);
        if (hasRoute) this.trails.push(player.id, frame.positions[player.id]);
      }
      // `frame.puck` is `visible` in every branch that produces one at all
      // (see `samplePuck`/`resolvePuckState`, sampleFrame.ts) - the explicit
      // check documents the same contract the 3D puck actor itself relies on
      // rather than assuming "non-null implies visible" silently.
      if (frame.puck?.visible) this.puckTrail.push(PUCK_TRAIL_KEY, frame.puck);
    }

    for (const listener of this.frameListeners) listener();
    this.publishDisplay(frame);
    return frame;
  }

  private publishDisplay(frame: PlaybackFrame): void {
    const next: PlaybackDisplaySnapshot = {
      progressPercent: Math.round(frame.progress * 100),
      durationSeconds: frame.durationSeconds,
      lifecycle: frame.lifecycle,
      firedEventCount: frame.firedEventIndices.length,
    };

    const changed =
      next.progressPercent !== this.display.progressPercent ||
      next.durationSeconds !== this.display.durationSeconds ||
      next.lifecycle !== this.display.lifecycle ||
      next.firedEventCount !== this.display.firedEventCount;

    if (!changed) return;
    this.display = next;
    for (const listener of this.displayListeners) listener();
  }

  reset(): void {
    this.frame = EMPTY_FRAME;
    this.trails.clear();
    this.puckTrail.clear();
    this.display = { progressPercent: 0, durationSeconds: 0, lifecycle: 'ready', firedEventCount: 0 };
    for (const listener of this.frameListeners) listener();
    for (const listener of this.displayListeners) listener();
  }

  /** Player positions for hit-testing while the playhead is not at rest. */
  positionFor(playerId: ID): Point | undefined {
    return this.frame.positions[playerId];
  }
}

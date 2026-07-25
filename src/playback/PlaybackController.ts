// ============================================================================
// PLAYBACK CONTROLLER
//
// The requestAnimationFrame clock. It samples the deterministic engine and
// writes into the frame store; it never dispatches a React action per frame.
// React hears from it exactly twice per play: started, and completed.
// ============================================================================

import type { PlaybackStore } from './PlaybackStore';

export interface PlaybackControllerEvents {
  onComplete: () => void;
}

export class PlaybackController {
  private rafHandle: number | null = null;
  private startedAt: number | null = null;
  private speed = 1;
  private running = false;

  constructor(
    private readonly store: PlaybackStore,
    private readonly events: PlaybackControllerEvents
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Start (or resume) from the store's current progress. */
  start(speed: number): void {
    this.stop();
    this.speed = speed > 0 ? speed : 1;
    this.running = true;
    this.startedAt = null;
    this.store.setPlaying(true);
    this.rafHandle = requestAnimationFrame(this.step);
  }

  setSpeed(speed: number): void {
    if (!this.running) {
      this.speed = speed > 0 ? speed : 1;
      return;
    }
    // Re-seed the clock so a mid-play speed change does not jump the playhead.
    const progress = this.store.getFrame().progress;
    this.speed = speed > 0 ? speed : 1;
    this.startedAt = null;
    void progress;
  }

  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.running = false;
    this.startedAt = null;
    this.store.setPlaying(false);
  }

  private step = (timestamp: number): void => {
    if (!this.running) return;

    const frame = this.store.getFrame();
    const duration = frame.durationSeconds > 0 ? frame.durationSeconds : 1;
    const total = duration / this.speed;

    // Seed from wherever the playhead already is, so pressing play after
    // scrubbing resumes instead of jumping back to zero.
    if (this.startedAt === null) {
      this.startedAt = timestamp - frame.progress * total * 1000;
    }

    const elapsed = (timestamp - this.startedAt) / 1000;
    const progress = Math.min(elapsed / total, 1);

    this.store.seek(progress);

    if (progress >= 1) {
      this.stop();
      this.events.onComplete();
      return;
    }

    this.rafHandle = requestAnimationFrame(this.step);
  };
}

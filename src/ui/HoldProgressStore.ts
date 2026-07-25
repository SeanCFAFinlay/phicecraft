// ============================================================================
// HOLD PROGRESS
//
// Hold-to-move needs a visible countdown, but that countdown ticks on every
// animation frame. It gets its own tiny store so only the progress ring
// re-renders, and only when the value visibly changes.
// ============================================================================

import type { ID } from '@/core/types';

export interface HoldProgressSnapshot {
  playerId: ID | null;
  fraction: number;
}

const IDLE: HoldProgressSnapshot = { playerId: null, fraction: 0 };

export class HoldProgressStore {
  private listeners = new Set<() => void>();
  private snapshot: HoldProgressSnapshot = IDLE;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): HoldProgressSnapshot => this.snapshot;

  get playerId(): ID | null {
    return this.snapshot.playerId;
  }

  begin(playerId: ID): void {
    this.snapshot = { playerId, fraction: 0 };
    this.emit();
  }

  set(fraction: number): void {
    if (!this.snapshot.playerId) return;
    // 5% granularity: this drives a progress ring, not a readout.
    const rounded = Math.round(fraction * 20) / 20;
    if (rounded === this.snapshot.fraction) return;
    this.snapshot = { ...this.snapshot, fraction: rounded };
    this.emit();
  }

  cancel(): void {
    if (this.snapshot === IDLE) return;
    this.snapshot = IDLE;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

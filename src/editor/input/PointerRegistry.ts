// ============================================================================
// POINTER REGISTRY
//
// Which pointers are down, where they are, and - critically - whether a
// multi-touch gesture is still unwinding.
//
// The bug this exists to prevent: a pinch used to clear its gesture as soon as
// the registry dropped below two pointers, so lifting the first finger turned
// the second finger's release into a TAP. With Erase active that deleted a
// player; with Add active it dropped one on the ice.
// ============================================================================

import type { Point } from '@/core/types';
import type { PointerSample } from './gestureTypes';

export class PointerRegistry {
  private pointers = new Map<number, PointerSample>();

  /**
   * Set the moment a second pointer arrives, and cleared ONLY when the last
   * pointer of that multi-touch lifecycle is released or cancelled.
   */
  private suppressTapUntilAllPointersReleased = false;

  get size(): number {
    return this.pointers.size;
  }

  get isMultiTouch(): boolean {
    return this.pointers.size >= 2;
  }

  /** True while a multi-touch lifecycle is still unwinding. */
  get tapsSuppressed(): boolean {
    return this.suppressTapUntilAllPointersReleased;
  }

  has(pointerId: number): boolean {
    return this.pointers.has(pointerId);
  }

  positions(): Point[] {
    return [...this.pointers.values()].map(pointer => pointer.position);
  }

  entries(): PointerSample[] {
    return [...this.pointers.values()];
  }

  down(sample: PointerSample): void {
    this.pointers.set(sample.pointerId, sample);
    if (this.pointers.size >= 2) {
      this.suppressTapUntilAllPointersReleased = true;
    }
  }

  move(pointerId: number, position: Point): boolean {
    const existing = this.pointers.get(pointerId);
    if (!existing) return false;
    this.pointers.set(pointerId, { ...existing, position });
    return true;
  }

  /**
   * Release a pointer. Returns whether a tap is allowed for THIS release.
   *
   * A release is only a tap if no multi-touch gesture happened at any point in
   * this lifecycle - including the release that takes the count from 2 to 1,
   * and the one that takes it from 1 to 0.
   */
  up(pointerId: number): { allowTap: boolean; remaining: number } {
    const wasSuppressed = this.suppressTapUntilAllPointersReleased;
    this.pointers.delete(pointerId);

    if (this.pointers.size === 0) {
      // The lifecycle is over; the next single-finger press starts clean.
      this.suppressTapUntilAllPointersReleased = false;
    }

    return { allowTap: !wasSuppressed, remaining: this.pointers.size };
  }

  /** A cancelled pointer is never a tap, and keeps suppression armed. */
  cancel(pointerId: number): { remaining: number } {
    this.pointers.delete(pointerId);
    if (this.pointers.size === 0) {
      this.suppressTapUntilAllPointersReleased = false;
    }
    return { remaining: this.pointers.size };
  }

  clear(): void {
    this.pointers.clear();
    this.suppressTapUntilAllPointersReleased = false;
  }
}

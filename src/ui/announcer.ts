// ============================================================================
// ANNOUNCER
//
// A single polite live region for things a sighted user learns from the canvas
// - "pass added", "action cancelled", "playing" - which would otherwise be
// invisible to a screen reader. Kept outside React state so an announcement
// never triggers an application-wide render.
// ============================================================================

export class Announcer {
  private listeners = new Set<() => void>();
  private message = '';
  private sequence = 0;
  /**
   * The snapshot carries the sequence number so announcing the same text twice
   * is still a change the live region will read out again.
   */
  private snapshot = '0:';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): string => this.snapshot;

  /** The text to render inside the live region. */
  getMessage = (): string => this.message;

  announce = (message: string): void => {
    this.message = message;
    this.sequence += 1;
    this.snapshot = `${this.sequence}:${message}`;
    for (const listener of this.listeners) listener();
  };

  clear = (): void => {
    if (!this.message) return;
    this.announce('');
  };
}

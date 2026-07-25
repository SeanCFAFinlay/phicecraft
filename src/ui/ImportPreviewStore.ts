// ============================================================================
// IMPORT PREVIEW STORE
//
// The parsed-but-not-yet-written import, held between `prepareImport` and the
// user's decision. It is a store rather than React state because the command
// layer produces it and a lazily-mounted sheet consumes it.
// ============================================================================

import type { ImportPreview } from '@/persistence';

export class ImportPreviewStore {
  private listeners = new Set<() => void>();
  private preview: ImportPreview | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ImportPreview | null => this.preview;

  set(preview: ImportPreview | null): void {
    this.preview = preview;
    for (const listener of this.listeners) listener();
  }

  clear(): void {
    this.set(null);
  }
}

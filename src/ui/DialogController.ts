// ============================================================================
// DIALOG CONTROLLER
//
// The command layer needs to ask the user things (confirm a destructive
// action, name a play, decide about an unsaved export) without importing React
// or knowing how a dialog looks. It calls these async methods; a single
// accessible <DialogHost /> renders whatever is pending and resolves it.
//
// This is an external store, read through useSyncExternalStore, so opening a
// dialog does not republish application state.
// ============================================================================

import type { ConfirmationRequest } from '@/commands/commandTypes';
import type { UnsavedExportChoice } from '@/persistence';
import type { PersistenceError } from '@/persistence';

export interface PromptRequest {
  id: string;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  maxLength?: number;
}

export type PendingDialog =
  | { kind: 'confirm'; key: number; request: ConfirmationRequest }
  | { kind: 'prompt'; key: number; request: PromptRequest }
  | { kind: 'unsaved-export'; key: number; error: PersistenceError };

type Entry =
  | { dialog: PendingDialog; resolve: (value: boolean) => void; kind: 'confirm' }
  | { dialog: PendingDialog; resolve: (value: string | null) => void; kind: 'prompt' }
  | { dialog: PendingDialog; resolve: (value: UnsavedExportChoice) => void; kind: 'unsaved-export' };

export class DialogController {
  private listeners = new Set<() => void>();
  private queue: Entry[] = [];
  private current: Entry | null = null;
  private nextKey = 1;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PendingDialog | null => this.current?.dialog ?? null;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private enqueue(entry: Entry): void {
    if (this.current) {
      this.queue.push(entry);
      return;
    }
    this.current = entry;
    this.emit();
  }

  private advance(): void {
    this.current = this.queue.shift() ?? null;
    this.emit();
  }

  confirm = (request: ConfirmationRequest): Promise<boolean> =>
    new Promise<boolean>(resolve => {
      this.enqueue({
        kind: 'confirm',
        dialog: { kind: 'confirm', key: this.nextKey++, request },
        resolve,
      });
    });

  promptForText = (request: PromptRequest): Promise<string | null> =>
    new Promise<string | null>(resolve => {
      this.enqueue({
        kind: 'prompt',
        dialog: { kind: 'prompt', key: this.nextKey++, request },
        resolve,
      });
    });

  confirmUnsavedExport = (error: PersistenceError): Promise<UnsavedExportChoice> =>
    new Promise<UnsavedExportChoice>(resolve => {
      this.enqueue({
        kind: 'unsaved-export',
        dialog: { kind: 'unsaved-export', key: this.nextKey++, error },
        resolve,
      });
    });

  /** Answer the open dialog. The value must match its kind. */
  resolve(value: boolean | string | null | UnsavedExportChoice): void {
    const entry = this.current;
    if (!entry) return;
    this.advance();

    switch (entry.kind) {
      case 'confirm':
        entry.resolve(value === true);
        break;
      case 'prompt':
        entry.resolve(typeof value === 'string' ? value : null);
        break;
      case 'unsaved-export':
        entry.resolve(value === 'export-anyway' ? 'export-anyway' : 'cancel');
        break;
    }
  }

  /** Dismiss with the safe answer: no, cancel, or don't export. */
  cancel(): void {
    const entry = this.current;
    if (!entry) return;
    this.advance();

    switch (entry.kind) {
      case 'confirm':
        entry.resolve(false);
        break;
      case 'prompt':
        entry.resolve(null);
        break;
      case 'unsaved-export':
        entry.resolve('cancel');
        break;
    }
  }
}

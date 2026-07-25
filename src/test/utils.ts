// ============================================================================
// TEST UTILITIES - fake storage, pointer sequences, viewport control
// ============================================================================

import { vi } from 'vitest';

// ----------------------------------------------------------------------------
// IndexedDB
// ----------------------------------------------------------------------------

/**
 * Reset `fake-indexeddb` to an empty state. Each test that touches the
 * repository calls this so stores never leak between cases.
 */
export async function resetFakeIndexedDb(): Promise<void> {
  // `/auto` installs every IDB* constructor as a global. The `idb` wrapper
  // instanceof-checks IDBRequest and IDBTransaction, so setting only
  // `indexedDB` is not enough.
  await import('fake-indexeddb/auto');
  const { IDBFactory } = await import('fake-indexeddb');
  globalThis.indexedDB = new IDBFactory();
}

/** Remove IndexedDB entirely, to exercise the `unavailable` path. */
export function removeIndexedDb(): void {
  // @ts-expect-error - deliberately simulating an environment without IDB.
  delete globalThis.indexedDB;
}

// ----------------------------------------------------------------------------
// localStorage
// ----------------------------------------------------------------------------

export interface FakeLocalStorage extends Storage {
  /** Make every subsequent write throw, simulating a full quota. */
  failWrites(error?: unknown): void;
  /** Allow writes again. */
  allowWrites(): void;
}

export function installFakeLocalStorage(initial: Record<string, string> = {}): FakeLocalStorage {
  const data = new Map<string, string>(Object.entries(initial));
  let writeError: unknown = null;

  const storage: FakeLocalStorage = {
    get length() {
      return data.size;
    },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      if (writeError) throw writeError;
      data.set(key, String(value));
    },
    removeItem: key => {
      data.delete(key);
    },
    clear: () => data.clear(),
    failWrites: (error = new DOMException('exceeded the quota', 'QuotaExceededError')) => {
      writeError = error;
    },
    allowWrites: () => {
      writeError = null;
    },
  };

  vi.stubGlobal('localStorage', storage);
  return storage;
}

// ----------------------------------------------------------------------------
// Viewport / media queries
// ----------------------------------------------------------------------------

export interface FakeViewport {
  width: number;
  height: number;
}

/**
 * Give jsdom a fixed viewport and a `matchMedia` that answers width/height/
 * orientation queries consistently with it.
 */
export function setViewport({ width, height }: FakeViewport): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });

  const matches = (query: string): boolean => {
    if (/prefers-reduced-motion:\s*reduce/.test(query)) return reducedMotion;
    const maxWidth = query.match(/max-width:\s*(\d+)px/);
    if (maxWidth && width > Number(maxWidth[1])) return false;
    const minWidth = query.match(/min-width:\s*(\d+)px/);
    if (minWidth && width < Number(minWidth[1])) return false;
    const maxHeight = query.match(/max-height:\s*(\d+)px/);
    if (maxHeight && height > Number(maxHeight[1])) return false;
    if (/orientation:\s*landscape/.test(query) && height > width) return false;
    if (/orientation:\s*portrait/.test(query) && width >= height) return false;
    return Boolean(maxWidth || minWidth || maxHeight || /orientation:/.test(query));
  };

  window.matchMedia = ((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    return {
      get matches() {
        return matches(query);
      },
      media: query,
      onchange: null,
      addListener: (cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeListener: (cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;

  window.dispatchEvent(new Event('resize'));
}

let reducedMotion = false;

/** Turn the OS-level reduced-motion preference on or off for a test. */
export function setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

export const VIEWPORTS = {
  phoneSmall: { width: 320, height: 568 },
  phonePortrait: { width: 390, height: 844 },
  phoneLandscapeSmall: { width: 667, height: 375 },
  phoneLandscape: { width: 844, height: 390 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1366, height: 768 },
} as const;

// ----------------------------------------------------------------------------
// Pointer / touch sequences
// ----------------------------------------------------------------------------

export interface PointerStep {
  pointerId: number;
  x: number;
  y: number;
  pointerType?: 'touch' | 'mouse' | 'pen';
}

function pointerEvent(type: string, step: PointerStep, extra: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: step.pointerId,
    pointerType: step.pointerType ?? 'touch',
    clientX: step.x,
    clientY: step.y,
    isPrimary: step.pointerId === 1,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    ...extra,
  });
  return event;
}

export const pointer = {
  down: (target: Element, step: PointerStep) => target.dispatchEvent(pointerEvent('pointerdown', step)),
  move: (target: Element, step: PointerStep) => target.dispatchEvent(pointerEvent('pointermove', step)),
  up: (target: Element, step: PointerStep) => target.dispatchEvent(pointerEvent('pointerup', step)),
  cancel: (target: Element, step: PointerStep) => target.dispatchEvent(pointerEvent('pointercancel', step)),
};

// ----------------------------------------------------------------------------
// Async helpers
// ----------------------------------------------------------------------------

/** Let queued microtasks and the current macrotask tick settle. */
export function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * A promise plus its resolve/reject, for holding an async operation open while
 * a test asserts on the intermediate state.
 */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ============================================================================
// INSTALLING AND UPDATING
//
// Registers the service worker and reports when a new build is waiting.
//
// The update is never applied silently. A coach mid-drill should not have the
// page reload underneath them because a deploy happened; they are told, and
// they choose when. That is also why the worker does not call `skipWaiting()`
// on its own - it waits to be asked.
//
// Registration is skipped in development, where a caching worker would serve
// stale modules and make every change look like it did not take effect.
// ============================================================================

export type UpdateListener = (state: UpdateState) => void;

export interface UpdateState {
  /** A newer build is downloaded and waiting to take over. */
  updateReady: boolean;
  /** The app has been cached and will now open without a network. */
  offlineReady: boolean;
}

const state: UpdateState = { updateReady: false, offlineReady: false };
const listeners = new Set<UpdateListener>();
let waitingWorker: ServiceWorker | null = null;

function publish(): void {
  for (const listener of listeners) listener({ ...state });
}

export function subscribeToUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getUpdateState(): UpdateState {
  return { ...state };
}

/** Apply the waiting build. The page reloads once it takes control. */
export function applyUpdate(): void {
  if (!waitingWorker) return;
  waitingWorker.postMessage('SKIP_WAITING');
}

/** True when this environment can run a service worker at all. */
export function serviceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export interface RegisterOptions {
  /** Registration is skipped unless this is true. */
  enabled: boolean;
  scriptUrl?: string;
}

export async function registerServiceWorker({
  enabled,
  scriptUrl = '/sw.js',
}: RegisterOptions): Promise<ServiceWorkerRegistration | null> {
  if (!enabled || !serviceWorkerSupported()) return null;

  try {
    // Whether anything was already in charge BEFORE this registration. The
    // first install claims the page immediately so it is cached from the very
    // first visit - which also fires `controllerchange`. Reloading on that
    // would make every first visit reload itself.
    const hadController = !!navigator.serviceWorker.controller;

    const registration = await navigator.serviceWorker.register(scriptUrl, { scope: '/' });

    if (registration.active && !navigator.serviceWorker.controller) {
      state.offlineReady = true;
      publish();
    }

    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        if (navigator.serviceWorker.controller) {
          // Something was already in charge, so this is an update rather than
          // a first install.
          waitingWorker = worker;
          state.updateReady = true;
        } else {
          state.offlineReady = true;
        }
        publish();
      });
    };

    if (registration.waiting) {
      waitingWorker = registration.waiting;
      state.updateReady = true;
      publish();
    }

    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration.installing));

    // A NEW worker has taken over from an old one: reload so the page and its
    // assets come from the same build. On a first install there is nothing to
    // be inconsistent with, and reloading would restart the app under the
    // coach on every first visit.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    return registration;
  } catch {
    // A browser with workers disabled, or a page served without HTTPS, simply
    // does not get offline support. It must not fail to start.
    return null;
  }
}

/** Test seam. */
export function __resetUpdateState(): void {
  state.updateReady = false;
  state.offlineReady = false;
  waitingWorker = null;
  listeners.clear();
}

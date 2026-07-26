// ============================================================================
// REGISTERING, AND NOT REGISTERING
//
// The failure modes matter more than the happy path here. A service worker
// that throws on registration, or that reloads the page under a coach who is
// mid-drill, is worse than no offline support at all.
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  __resetUpdateState,
  applyUpdate,
  getUpdateState,
  registerServiceWorker,
  serviceWorkerSupported,
  subscribeToUpdates,
} from './updateManager';

type Listener = () => void;

class FakeWorker {
  state = 'installing';
  posted: unknown[] = [];
  private listeners: Listener[] = [];

  addEventListener(_type: string, listener: Listener) {
    this.listeners.push(listener);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  become(state: string) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

class FakeRegistration {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  private listeners: Listener[] = [];

  addEventListener(_type: string, listener: Listener) {
    this.listeners.push(listener);
  }
  fireUpdateFound() {
    for (const listener of this.listeners) listener();
  }
}

let registration: FakeRegistration;
let register: ReturnType<typeof vi.fn>;
let containerListeners: Record<string, Listener[]>;

function installFakeServiceWorker(controller: unknown = null) {
  registration = new FakeRegistration();
  register = vi.fn().mockResolvedValue(registration);
  containerListeners = {};

  vi.stubGlobal('navigator', {
    serviceWorker: {
      register,
      controller,
      addEventListener: (type: string, listener: Listener) => {
        containerListeners[type] = [...(containerListeners[type] ?? []), listener];
      },
    },
  });
}

beforeEach(() => {
  __resetUpdateState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ----------------------------------------------------------------------------

describe('when it should not register at all', () => {
  it('does nothing in development', async () => {
    installFakeServiceWorker();
    expect(await registerServiceWorker({ enabled: false })).toBeNull();

    // A caching worker in development serves stale modules and makes every
    // change look as though it did not take effect.
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without service workers', async () => {
    vi.stubGlobal('navigator', {});
    expect(serviceWorkerSupported()).toBe(false);
    expect(await registerServiceWorker({ enabled: true })).toBeNull();
  });

  it('survives a registration that throws', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn().mockRejectedValue(new Error('insecure origin')),
        controller: null,
        addEventListener: () => undefined,
      },
    });

    // A page served without HTTPS simply does not get offline support. It must
    // not fail to start.
    await expect(registerServiceWorker({ enabled: true })).resolves.toBeNull();
  });
});

// ----------------------------------------------------------------------------

describe('a first install', () => {
  it('reports the app is now available offline', async () => {
    installFakeServiceWorker(null);
    const worker = new FakeWorker();
    registration.installing = worker;

    await registerServiceWorker({ enabled: true });
    worker.become('installed');

    expect(getUpdateState().offlineReady).toBe(true);
    expect(getUpdateState().updateReady).toBe(false);
  });

  it('does not call it an update, because nothing was replaced', async () => {
    installFakeServiceWorker(null);
    const worker = new FakeWorker();
    registration.installing = worker;

    await registerServiceWorker({ enabled: true });
    worker.become('installed');

    expect(getUpdateState().updateReady).toBe(false);
  });
});

// ----------------------------------------------------------------------------

describe('an update', () => {
  it('is reported when a worker was already in control', async () => {
    installFakeServiceWorker({ id: 'existing' });
    const worker = new FakeWorker();
    registration.installing = worker;

    await registerServiceWorker({ enabled: true });
    worker.become('installed');

    expect(getUpdateState().updateReady).toBe(true);
  });

  it('is reported for a build that was already waiting when the page loaded', async () => {
    installFakeServiceWorker({ id: 'existing' });
    registration.waiting = new FakeWorker();

    await registerServiceWorker({ enabled: true });

    expect(getUpdateState().updateReady).toBe(true);
  });

  it('is NOT applied until it is asked for', async () => {
    installFakeServiceWorker({ id: 'existing' });
    const worker = new FakeWorker();
    registration.waiting = worker;

    await registerServiceWorker({ enabled: true });

    // A coach mid-drill must not have the page reload underneath them because
    // a deploy happened.
    expect(worker.posted).toEqual([]);

    applyUpdate();
    expect(worker.posted).toEqual(['SKIP_WAITING']);
  });

  it('picks up a worker that appears after registration', async () => {
    installFakeServiceWorker({ id: 'existing' });
    await registerServiceWorker({ enabled: true });

    const worker = new FakeWorker();
    registration.installing = worker;
    registration.fireUpdateFound();
    worker.become('installed');

    expect(getUpdateState().updateReady).toBe(true);
  });
});

// ----------------------------------------------------------------------------

describe('subscribers', () => {
  it('are given the current state immediately', () => {
    const seen: unknown[] = [];
    subscribeToUpdates(state => seen.push(state));
    expect(seen).toEqual([{ updateReady: false, offlineReady: false }]);
  });

  it('are told when something changes, and stop after unsubscribing', async () => {
    installFakeServiceWorker({ id: 'existing' });
    let calls = 0;
    const unsubscribe = subscribeToUpdates(() => {
      calls += 1;
    });

    registration.waiting = new FakeWorker();
    await registerServiceWorker({ enabled: true });
    const afterUpdate = calls;
    expect(afterUpdate).toBeGreaterThan(1);

    unsubscribe();
    applyUpdate();
    expect(calls).toBe(afterUpdate);
  });
});

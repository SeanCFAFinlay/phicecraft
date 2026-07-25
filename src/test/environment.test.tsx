// Proves the jsdom project, Testing Library matchers, fake-indexeddb reset and
// viewport helpers are wired up. If this fails, every component and
// persistence suite below it is unreliable.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resetFakeIndexedDb, setViewport, VIEWPORTS, pointer } from './utils';

describe('test environment', () => {
  beforeEach(async () => {
    await resetFakeIndexedDb();
  });

  it('renders React into jsdom with jest-dom matchers available', () => {
    render(<button type="button">Play</button>);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('provides a working IndexedDB', async () => {
    expect(globalThis.indexedDB).toBeDefined();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('environment-probe', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('items');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(db.objectStoreNames.contains('items')).toBe(true);
    db.close();
  });

  it('answers media queries consistently with the fake viewport', () => {
    setViewport(VIEWPORTS.phoneLandscape);
    expect(window.matchMedia('(max-width: 767px)').matches).toBe(false);
    expect(window.matchMedia('(max-height: 500px)').matches).toBe(true);
    expect(window.matchMedia('(orientation: landscape)').matches).toBe(true);

    setViewport(VIEWPORTS.phonePortrait);
    expect(window.matchMedia('(max-width: 767px)').matches).toBe(true);
    expect(window.matchMedia('(orientation: landscape)').matches).toBe(false);
  });

  it('dispatches pointer sequences at a target', () => {
    const seen: string[] = [];
    render(<div data-testid="surface" />);
    const surface = screen.getByTestId('surface');
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      surface.addEventListener(type, () => seen.push(type));
    }

    pointer.down(surface, { pointerId: 1, x: 10, y: 10 });
    pointer.move(surface, { pointerId: 1, x: 30, y: 40 });
    pointer.up(surface, { pointerId: 1, x: 30, y: 40 });

    expect(seen).toEqual(['pointerdown', 'pointermove', 'pointerup']);
  });
});

// ============================================================================
// VIEW CONTROLS — handler-ordering test
//
// The one thing this file exists to pin: entering 3D must AWAIT
// `loadBoard3D()` before it ever animates the tilt (which is what flips
// `camera.tilt` past `TABLETOP_MIN_TILT`, which is what AppShell's `is3D`
// swaps CanvasSurface out on). Get that ordering backwards and a coach's
// first tilt-in of a session opens a real window where AppShell has already
// unmounted CanvasSurface but Board3D's lazy chunk has not resolved yet -
// Suspense falls back to a FRESH CanvasSurface whose own tilt is already past
// the threshold, and since Phase 4 Task 6 deleted CanvasSurface's pseudo-3D
// pass, that fallback would render a visibly broken flat-rink-on-dark-
// gradient frame instead of a graceful one.
//
// Its hook dependencies are mocked directly (rather than rendered inside the
// full app provider tree App.test.tsx uses) because the property under test -
// the ORDER two async-adjacent calls happen in - is about ViewControls' own
// handler body, not about wiring; a real CameraStore instance is used
// (imported directly, not mocked) so `setCamera` observes real camera values.
// `afterEach(cleanup)` is registered globally (src/test/setup.ts).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CameraStore } from '@/camera/CameraStore';
import { TABLETOP_MIN_TILT } from '@/core/constants';

const loadBoard3DMock = vi.fn();
vi.mock('@/render3d/loadBoard3D', () => ({
  loadBoard3D: () => loadBoard3DMock(),
}));

const announceSpy = vi.fn();
vi.mock('@/hooks/useAppState', () => ({
  useAppServices: () => ({ announcer: { announce: announceSpy } }),
}));

let store: CameraStore;
vi.mock('@/hooks/useEditorRuntime', () => ({
  useEditorRuntime: () => ({ camera: store }),
}));

vi.mock('@/ui/useResponsive', () => ({
  // Reduced motion: `animateTo` writes the camera synchronously, with no rAF
  // loop to await in the test - the property under test is ORDERING
  // (loadBoard3D resolves, THEN setCamera runs), which reduced motion isolates
  // from "did enough animation frames elapse", a separate concern.
  useResponsive: () => ({ prefersReducedMotion: true, isCompactLandscape: false }),
}));

const { ViewControls } = await import('./ViewControls');

beforeEach(() => {
  store = new CameraStore();
  store.setViewport(1366, 768);
  loadBoard3DMock.mockReset();
  announceSpy.mockClear();
});

describe('ViewControls — entering 3D', () => {
  it('awaits loadBoard3D() before the tilt animation ever changes the camera', async () => {
    let resolveLoad: () => void = () => {};
    loadBoard3DMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveLoad = resolve;
      })
    );
    const setCameraSpy = vi.spyOn(store, 'setCamera');

    render(<ViewControls />);
    const toggle = screen.getByRole('button', { name: /tabletop 3D view/i });
    fireEvent.click(toggle);

    // The chunk load has started but not resolved: the camera must not have
    // moved yet, and the control must say so (aria-busy, disabled).
    expect(loadBoard3DMock).toHaveBeenCalledTimes(1);
    expect(setCameraSpy).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(toggle).toBeDisabled();

    resolveLoad();
    await waitFor(() => expect(setCameraSpy).toHaveBeenCalled());

    const appliedCamera = setCameraSpy.mock.calls[0][0];
    expect(appliedCamera.tilt).toBeGreaterThan(TABLETOP_MIN_TILT);
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-busy', 'false');
  });

  it('stays in 2D and announces failure when the chunk fails to load', async () => {
    loadBoard3DMock.mockReturnValue(Promise.reject(new Error('chunk fetch failed')));
    const setCameraSpy = vi.spyOn(store, 'setCamera');

    render(<ViewControls />);
    const toggle = screen.getByRole('button', { name: /tabletop 3D view/i });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('3D view unavailable'))
    );

    expect(setCameraSpy).not.toHaveBeenCalled();
    expect(toggle).not.toBeDisabled();
    expect(store.camera.tilt ?? 0).toBeLessThanOrEqual(TABLETOP_MIN_TILT);
  });

  it('ignores a second tap while the first load is still in flight', async () => {
    let resolveLoad: () => void = () => {};
    loadBoard3DMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveLoad = resolve;
      })
    );

    render(<ViewControls />);
    const toggle = screen.getByRole('button', { name: /tabletop 3D view/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(loadBoard3DMock).toHaveBeenCalledTimes(1);

    resolveLoad();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /flat top-down view/i })).toBeInTheDocument()
    );
  });
});

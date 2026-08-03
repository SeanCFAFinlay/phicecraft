// ============================================================================
// LOAD BOARD3D
//
// The one dynamic-import seam for the true-3D presentation. A coach who never
// tilts into 3D never parses or executes three.js: the mount site
// (AppShell.tsx) reaches for this only behind `React.lazy`, so this module -
// and everything it pulls in, including `three` itself - stays out of the
// startup bundle and lives in its own chunk (verified against
// dist/manifest.json; see scripts/budget-baseline.json for the recorded
// size).
// ============================================================================

export const loadBoard3D = () => import('@/render3d/Board3D');

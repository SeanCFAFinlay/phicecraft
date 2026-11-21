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
//
// The two player models start downloading here too, the moment 3D is asked
// for, rather than after Board3D has mounted and built its arena: the GLBs
// travel alongside the component's own code instead of behind it. Fire and
// forget - Board3D's own `loadModel` calls pick up the same in-flight
// promises, and report a failure themselves.
// ============================================================================

export const loadBoard3D = () => {
  void import('@/render3d/modelCache')
    .then(({ loadModel }) => Promise.all([loadModel('skater'), loadModel('goalie')]))
    .catch(() => undefined);
  return import('@/render3d/Board3D');
};

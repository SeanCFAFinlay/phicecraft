// ============================================================================
// LOAD BOARD3D
//
// Board3D itself is not unit-testable in jsdom (three's WebGLRenderer needs a
// real WebGL context) - its behaviour is e2e-verified in later Phase 4 tasks.
// This just pins the lazy-import seam AppShell's `React.lazy(loadBoard3D)`
// depends on: the dynamic import resolves, and it resolves to a component
// under `default`, which is all `React.lazy` requires of it.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { loadBoard3D } from './loadBoard3D';

describe('loadBoard3D', () => {
  it('resolves to a module with a default-exported component', async () => {
    const module = await loadBoard3D();
    expect(typeof module.default).toBe('function');
  });
});

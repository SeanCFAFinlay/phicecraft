// ============================================================================
// MODEL CACHE
//
// The two GLBs are parsed ONCE per page load, not once per Board3D mount:
// tilting out of 3D and back into it must not re-fetch and re-decode
// multi-megabyte binaries it already has. Kept in its own module (rather than
// inline in Board3D.tsx) so the reset seam below can be a plain function
// export - Board3D.tsx stays a component-only export, which is what keeps
// React Fast Refresh happy.
// ============================================================================

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_URLS, type ModelKey } from './modelAssets';
import type { ParsedActorModel } from './scene/actors';

let modelCache: Partial<Record<ModelKey, Promise<ParsedActorModel>>> = {};

/**
 * Parses `key`'s GLB exactly once; every subsequent call reuses the same
 * in-flight/resolved promise.
 *
 * A REJECTED promise is deliberately NOT kept cached: a fetch failure (a
 * dropped connection, a cold start with the shell chunk cached but the model
 * asset not yet - see sw.js's own note on `STATIC_ASSETS`) is transient, not
 * a permanent property of `key`. Caching the rejection forever would mean
 * one bad load poisons every later attempt for the rest of the page's
 * lifetime, including a manual retry - so the entry is deleted before the
 * rejection is rethrown, and the NEXT call starts a fresh `loadAsync`.
 */
export function loadModel(key: ModelKey): Promise<ParsedActorModel> {
  const cached = modelCache[key];
  if (cached) return cached;

  const loader = new GLTFLoader();
  const promise = loader.loadAsync(MODEL_URLS[key]).then(
    gltf => ({ scene: gltf.scene, animations: gltf.animations }),
    error => {
      delete modelCache[key];
      throw error;
    }
  );
  modelCache[key] = promise;
  return promise;
}

/** Test-only reset seam: clears the module-scope parsed-GLTF cache. */
export function resetModelCacheForTests(): void {
  modelCache = {};
}

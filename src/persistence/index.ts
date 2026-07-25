// ============================================================================
// PERSISTENCE - public surface
// ============================================================================

export * from './types';
export * from './schema';
export * from './drillPipeline';
export * from './indexedDbRepository';
export * from './legacyLocalStorageMigration';
export * from './importService';
export * from './exportService';
export * from './recoveryService';
export * from './saveCoordinator';

import { IndexedDbDrillRepository } from './indexedDbRepository';
import { SaveCoordinator } from './saveCoordinator';
import type { DrillRepository } from './types';

let repositorySingleton: DrillRepository | null = null;
let coordinatorSingleton: SaveCoordinator | null = null;

/** The app-wide repository. Tests build their own instead of using this. */
export function getRepository(): DrillRepository {
  if (!repositorySingleton) repositorySingleton = new IndexedDbDrillRepository();
  return repositorySingleton;
}

export function getSaveCoordinator(): SaveCoordinator {
  if (!coordinatorSingleton) coordinatorSingleton = new SaveCoordinator(getRepository());
  return coordinatorSingleton;
}

/** Test hook: swap in a fake repository and reset the coordinator. */
export function __setRepositoryForTests(repository: DrillRepository | null): void {
  repositorySingleton = repository;
  coordinatorSingleton = repository ? new SaveCoordinator(repository) : null;
}

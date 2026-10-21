// ============================================================================
// PRACTICE BUNDLE SERVICE
//
// Creation, validation, collision handling, and restoration of portable
// practice bundles with immutable drill revision snapshots.
// ============================================================================

import { generateId } from '@/utils/id';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import type { PracticeBundle, PracticeSession, PracticeBlock } from './types';
import { parsePracticeBundle, parsePracticeSession } from './schema';
import { upsertPracticeSession, loadPracticeSessions } from './practiceStore';

export const CURRENT_BUNDLE_VERSION = 'phicecraft-practice-bundle-v1';

/**
 * Creates a self-contained, portable practice bundle containing the practice
 * session definition and all pinned drill revision snapshots.
 */
export function createPracticeBundle(session: PracticeSession): PracticeBundle {
  const drillSnapshots: Record<string, DrillDocumentV3> = {};

  for (const block of session.blocks) {
    if (block.pinnedRevision) {
      const key = block.drillId || block.pinnedRevision.id;
      drillSnapshots[key] = structuredClone(block.pinnedRevision);
    }
  }

  return {
    manifest: {
      formatVersion: CURRENT_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      sessionCount: 1,
      snapshotCount: Object.keys(drillSnapshots).length,
    },
    practice: structuredClone(session),
    drillSnapshots,
  };
}

/**
 * Validates untrusted bundle or session data before mutating any storage.
 * Accepts either a parsed object or a raw JSON string.
 */
export function validateBundlePayload(
  payload: unknown
): { ok: true; bundle: PracticeBundle } | { ok: false; error: string } {
  let data = payload;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { ok: false, error: 'Malformed JSON payload: failed to parse string' };
    }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Invalid payload: expected an object or bundle' };
  }

  // Check if it's already a full bundle
  const parsedBundle = parsePracticeBundle(data);
  if (parsedBundle.ok) {
    return { ok: true, bundle: parsedBundle.bundle };
  }

  // Backward compatibility: check if it's a standalone legacy PracticeSession JSON
  const parsedSession = parsePracticeSession(data);
  if (parsedSession.ok) {
    const syntheticBundle = createPracticeBundle(parsedSession.session);
    return { ok: true, bundle: syntheticBundle };
  }

  const issues = parsedBundle.issues.map(i => `${i.path}: ${i.message}`).join(', ');
  return { ok: false, error: `Invalid practice bundle: ${issues}` };
}

export interface RestoreOptions {
  collisionStrategy?: 'replace' | 'duplicate';
}

/**
 * Restores a validated practice bundle into local persistence.
 * If collisionStrategy is 'duplicate', assigns a new identity and remaps block IDs.
 */
export function restorePracticeBundle(
  bundle: PracticeBundle,
  options: RestoreOptions = {}
): { session: PracticeSession; restoredSnapshots: number } {
  const strategy = options.collisionStrategy ?? 'duplicate';
  const existing = loadPracticeSessions();
  const hasCollision = existing.some(s => s.id === bundle.practice.id);

  let sessionToSave: PracticeSession;

  if (hasCollision && strategy === 'duplicate') {
    const newSessionId = `practice-${Date.now()}-${generateId().slice(0, 6)}`;
    const remappedBlocks: PracticeBlock[] = bundle.practice.blocks.map(b => ({
      ...b,
      id: `blk-${Date.now()}-${generateId().slice(0, 6)}`,
      pinnedRevision: b.pinnedRevision
        ? structuredClone(b.pinnedRevision)
        : (b.drillId && bundle.drillSnapshots?.[b.drillId]
          ? structuredClone(bundle.drillSnapshots[b.drillId])
          : undefined),
    }));

    sessionToSave = {
      ...bundle.practice,
      id: newSessionId,
      title: `${bundle.practice.title} (Imported)`,
      blocks: remappedBlocks,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Replace or no collision: ensure blocks have their pinnedRevisions populated from snapshots
    const hydratedBlocks: PracticeBlock[] = bundle.practice.blocks.map(b => {
      const snapshot =
        b.pinnedRevision ??
        (b.drillId && bundle.drillSnapshots ? bundle.drillSnapshots[b.drillId] : undefined);
      return {
        ...b,
        pinnedRevision: snapshot ? structuredClone(snapshot) : undefined,
      };
    });

    sessionToSave = {
      ...bundle.practice,
      blocks: hydratedBlocks,
      updatedAt: new Date().toISOString(),
    };
  }

  upsertPracticeSession(sessionToSave);

  const restoredSnapshots = sessionToSave.blocks.filter(b => b.pinnedRevision !== undefined).length;
  return { session: sessionToSave, restoredSnapshots };
}

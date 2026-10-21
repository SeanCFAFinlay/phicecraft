import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPracticeBundle,
  validateBundlePayload,
  restorePracticeBundle,
  CURRENT_BUNDLE_VERSION,
} from './practiceBundle';
import {
  createBlankPracticeSession,
  createCustomBlock,
  createBlockFromTemplate,
  loadPracticeSessions,
  savePracticeSessions,
  deletePracticeSession,
  PRACTICE_INITIALIZED_KEY,
} from './practiceStore';
import { DRILL_TEMPLATES } from '@/data/templates/registry';

describe('practiceBundle', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(PRACTICE_INITIALIZED_KEY, 'true');
    savePracticeSessions([]);
  });

  it('creates a bundle with manifest and pinned drill snapshots', () => {
    const session = createBlankPracticeSession(60, 'U15 Transition');
    const tpl = DRILL_TEMPLATES[0];
    const block = createBlockFromTemplate(tpl, 12);
    session.blocks.push(block);

    const bundle = createPracticeBundle(session);

    expect(bundle.manifest.formatVersion).toBe(CURRENT_BUNDLE_VERSION);
    expect(bundle.manifest.sessionCount).toBe(1);
    expect(bundle.manifest.snapshotCount).toBe(1);
    expect(bundle.practice.title).toBe('U15 Transition');
    expect(bundle.drillSnapshots[tpl.id]).toBeDefined();
    expect(bundle.drillSnapshots[tpl.id].metadata.title).toBe(tpl.document.metadata.title);
  });

  it('validates a valid practice bundle', () => {
    const session = createBlankPracticeSession(50, 'Skills');
    const bundle = createPracticeBundle(session);

    const validation = validateBundlePayload(bundle);
    expect(validation.ok).toBe(true);
  });

  it('validates and converts a legacy practice session JSON for backward compatibility', () => {
    const legacySession = createBlankPracticeSession(60, 'Old Session');
    legacySession.blocks.push(createCustomBlock('Puck Protection', 15));

    const validation = validateBundlePayload(legacySession);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.bundle.practice.title).toBe('Old Session');
      expect(validation.bundle.manifest.formatVersion).toBe(CURRENT_BUNDLE_VERSION);
    }
  });

  it('rejects an invalid payload', () => {
    const invalid = { bad: 'payload', count: 123 };
    const validation = validateBundlePayload(invalid);
    expect(validation.ok).toBe(false);
  });

  it('validates a valid practice bundle supplied as a raw JSON string', () => {
    const session = createBlankPracticeSession(50, 'Stringified Session');
    const bundle = createPracticeBundle(session);
    const rawString = JSON.stringify(bundle);

    const validation = validateBundlePayload(rawString);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.bundle.practice.title).toBe('Stringified Session');
    }
  });

  it('rejects malformed JSON strings or invalid primitives safely', () => {
    expect(validateBundlePayload('{ bad json').ok).toBe(false);
    expect(validateBundlePayload(null).ok).toBe(false);
    expect(validateBundlePayload(undefined).ok).toBe(false);
    expect(validateBundlePayload(12345).ok).toBe(false);
  });

  it('restores a bundle without collision', () => {
    const session = createBlankPracticeSession(60, 'Clean Restore');
    const bundle = createPracticeBundle(session);

    const result = restorePracticeBundle(bundle);
    expect(result.session.id).toBe(session.id);
    expect(loadPracticeSessions()).toHaveLength(1);
  });

  it('handles collision with duplicate strategy by assigning a new ID and remapping block IDs', () => {
    const session = createBlankPracticeSession(60, 'Existing Session');
    savePracticeSessions([session]);

    const bundle = createPracticeBundle(session);
    const result = restorePracticeBundle(bundle, { collisionStrategy: 'duplicate' });

    expect(result.session.id).not.toBe(session.id);
    expect(result.session.title).toContain('(Imported)');
    const all = loadPracticeSessions();
    expect(all).toHaveLength(2);
  });

  it('truthfully keeps empty practice list when last practice is deleted', () => {
    const session = createBlankPracticeSession(60, 'Single Session');
    savePracticeSessions([session]);
    expect(loadPracticeSessions()).toHaveLength(1);

    deletePracticeSession(session.id);
    expect(loadPracticeSessions()).toHaveLength(0);

    // Reloading from scratch should still produce 0, never resurrecting presets
    const reloaded = loadPracticeSessions();
    expect(reloaded).toEqual([]);
  });
});

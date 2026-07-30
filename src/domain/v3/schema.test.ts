import { describe, expect, it } from 'vitest';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { parseDrillDocumentV3 } from '@/domain/v3/schema';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';

describe('parseDrillDocumentV3', () => {
  it('accepts every bundled template document', () => {
    for (const { id, document } of DRILL_TEMPLATES) {
      const result = parseDrillDocumentV3(structuredClone(document));
      expect(result.ok, `template ${id}`).toBe(true);
    }
  });

  it('accepts every migrated shipped fixture', () => {
    const fixtures = [giveAndGoRegressionDrill, fiveManCornerRetrievalDrill,
      fiveManCrossCornerDrill, fiveManLowHighDrill];
    for (const fixture of fixtures) {
      const result = parseDrillDocumentV3(migrateV2ToV3(structuredClone(fixture)));
      expect(result.ok, fixture.name).toBe(true);
    }
  });

  it('round-trips through JSON without loss of validity', () => {
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const result = parseDrillDocumentV3(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
  });

  it('rejects a v2 drill, junk, and a document with a wrong version', () => {
    expect(parseDrillDocumentV3(structuredClone(giveAndGoRegressionDrill)).ok).toBe(false);
    expect(parseDrillDocumentV3(null).ok).toBe(false);
    expect(parseDrillDocumentV3({ schemaVersion: 4 }).ok).toBe(false);
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    expect(parseDrillDocumentV3({ ...doc, actors: 'nope' }).ok).toBe(false);
  });

  it('reports what failed, for the recovery log', () => {
    const result = parseDrillDocumentV3({ schemaVersion: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it('rejects an empty title: storable but not importable is not a state worth allowing', () => {
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const result = parseDrillDocumentV3({ ...doc, metadata: { ...doc.metadata, title: '' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('title');
  });
});

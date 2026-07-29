import { beforeAll, describe, expect, it } from 'vitest';
import { findTemplate } from '@/data/templates/registry';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { validateV3Document } from '@/domain/v3/validation';

describe('mergeEditedIntoStored', () => {
  // 'tpl-picket-fences' is a small-area game that ships eight cones as real
  // equipment - the exact v3-only content a naive save would erase.
  const template = findTemplate('tpl-picket-fences');
  const stored = structuredClone(template!.document);

  beforeAll(() => {
    expect(template).not.toBeNull();
    expect(stored.equipment.length).toBeGreaterThan(0);
  });

  it('a projected edit-save round trip keeps equipment and annotations', () => {
    const { drill } = projectToV2(stored);
    drill.players[0] = { ...drill.players[0], x: drill.players[0].x + 25 };
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(merged.equipment).toEqual(stored.equipment);
    expect(merged.annotations).toEqual(stored.annotations);
  });

  it('keeps the edited first puck track and the stored extra tracks', () => {
    const { drill } = projectToV2(stored);
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(merged.puckTracks.length).toBe(stored.puckTracks.length);
    if (stored.puckTracks.length > 1) {
      expect(merged.puckTracks.slice(1)).toEqual(stored.puckTracks.slice(1));
    }
  });

  it('keeps rich metadata but takes the edited title', () => {
    const { drill } = projectToV2(stored);
    drill.name = 'Renamed by coach';
    const edited = migrateV2ToV3(drill);
    const merged = mergeEditedIntoStored(stored, edited);
    expect(merged.metadata.title).toBe('Renamed by coach');
    expect(merged.metadata.coachingPoints).toEqual(stored.metadata.coachingPoints);
    expect(merged.metadata.categories).toEqual(stored.metadata.categories);
  });

  it('produces a coherent document', () => {
    const { drill } = projectToV2(stored);
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(validateV3Document(merged).valid).toBe(true);
  });

  it('with no stored extras it is the edited document plus provenance', () => {
    const { drill } = projectToV2(stored);
    const edited = migrateV2ToV3(drill);
    const bare = { ...edited, templateId: undefined };
    const merged = mergeEditedIntoStored(bare, edited);
    expect(merged.actorTracks).toEqual(edited.actorTracks);
    expect(merged.createdAt).toBe(bare.createdAt);
  });
});

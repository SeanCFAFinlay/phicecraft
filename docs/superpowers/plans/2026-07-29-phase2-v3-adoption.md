# Phase 2 — v3 Schema Adoption (Storage-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `DrillDocumentV3` as the at-rest format (IndexedDB and exports) while the editor, commands and simulation keep operating on the in-memory v2 `Drill`, so no v3-only content is ever silently lost and no simulation code changes.

**Architecture:** The seam lives entirely inside `src/persistence/` plus one call site in `src/commands/documentCommands.ts`. The repository stores v3 records; on load it projects v3→v2 for the app (`projectToV2`), and on save it migrates the edited v2 drill to v3 (`migrateV2ToV3`) and **merges it into the previously stored v3 document** so equipment, annotations, extra puck tracks and rich metadata — which v2 cannot express — survive an edit-save cycle. Templates are saved as their full v3 documents instead of their lossy projections. A new Zod schema for v3 is the storage gate. The IndexedDB version bumps 1→2 with an in-transaction record migration.

**Tech Stack:** Zod 4 (already a dependency), `idb` 8, Vitest with `fake-indexeddb`, existing `migrateV2ToV3` / `projectToV2` from `src/domain/v3/`.

## Global Constraints

- Coverage gates (vite.config.ts): `src/persistence/**` **90% lines / 90% branches**, `src/commands/**` 90/85 — every new persistence file needs near-total test coverage.
- `npm run lint` (`--max-warnings 0`) and `npm run typecheck` must stay clean after every task.
- `CURRENT_DRILL_SCHEMA_VERSION = 2` (`src/persistence/drillPipeline.ts:32`) **stays 2** — it names the in-memory editor model, which this phase does not change. Same for the literal `2`s in `src/engine/drill.ts:140,224,302,384` (they stamp new in-memory drills). Do not touch them.
- Old exports must remain importable: `prepareImport` accepts a bare drill object, a bare array, or `{ drills: [...] }` (v2 `ExportPayload`, `format: 'phicecraft-drills', version: 1`) — all must keep working.
- `migrateV2ToV3` is idempotent and accepts `Drill | DrillDocumentV3` (`src/domain/v3/migrateV2ToV3.ts`); `projectToV2(document)` returns `{ drill, losses: ProjectionLoss[] }`.
- Existing behavior to preserve: corrupt stored records produce a `recovery` entry with `source: 'corrupt-record'` and a typed `corrupt-data` error; `replaceAndSave` snapshots overwritten documents into `recovery` in the same transaction.
- All 1,244+ unit tests green at the end of every task.

---

### Task 1: Zod structural schema for `DrillDocumentV3`

**Files:**
- Create: `src/domain/v3/schema.ts`
- Test: `src/domain/v3/schema.test.ts`

**Interfaces:**
- Consumes: types from `src/domain/v3/types.ts` (`DrillDocumentV3`, `DRILL_SCHEMA_VERSION_3`); `DRILL_TEMPLATES` from `src/data/templates/registry.ts`; `migrateV2ToV3` from `src/domain/v3/migrateV2ToV3.ts`; the four fixtures from `src/fixtures/*.v1.ts`.
- Produces: `export const drillDocumentV3Schema: z.ZodType<DrillDocumentV3>` and `export function parseDrillDocumentV3(input: unknown): { ok: true; document: DrillDocumentV3 } | { ok: false; message: string }`. Tasks 3–5 use both.

v3 currently has **no** structural validation for untrusted JSON — `validateV3Document` checks graph coherence of an already-typed document. Storage needs a shape gate, mirroring how `src/persistence/schema.ts` gates v2.

- [ ] **Step 1: Write the failing test**

Create `src/domain/v3/schema.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/v3/schema.test.ts`
Expected: FAIL — `@/domain/v3/schema` does not exist.

- [ ] **Step 3: Implement `src/domain/v3/schema.ts`**

Mirror `src/domain/v3/types.ts` in Zod exactly the way `src/persistence/schema.ts` mirrors `src/core/types.ts` — one Zod object per interface, unions discriminated the same way the types are. Skeleton with the load-bearing parts (the implementer fills in the remaining nested objects by transcribing `types.ts` field-for-field; every field name and optionality must match the interface):

```ts
import { z } from 'zod';
import type { DrillDocumentV3 } from './types';

const point = z.object({ x: z.number(), y: z.number() });
const id = z.string().min(1);

const puckSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('actor'), actorId: id }),
  z.object({ kind: z.literal('coach'), actorId: id }),
  z.object({ kind: z.literal('equipment'), equipmentId: id }),
  z.object({ kind: z.literal('loose'), at: point }),
]);

// … actor / equipment / phase / segment / action objects transcribed from types.ts …

export const drillDocumentV3Schema: z.ZodType<DrillDocumentV3> = z.object({
  schemaVersion: z.literal(3),
  id,
  metadata: drillMetadata,
  rink: rinkConfiguration,
  actors: z.array(actor),
  groups: z.array(actorGroup),
  equipment: z.array(equipmentItem),
  phases: z.array(drillPhase),
  actorTracks: z.array(actorTrack),
  puckTracks: z.array(puckTrack),
  annotations: z.array(annotation),
  presentation: presentationSettings,
  createdAt: z.number(),
  updatedAt: z.number(),
  templateId: id.optional(),
}) satisfies z.ZodType<DrillDocumentV3>;

export function parseDrillDocumentV3(
  input: unknown
): { ok: true; document: DrillDocumentV3 } | { ok: false; message: string } {
  const result = drillDocumentV3Schema.safeParse(input);
  if (result.success) return { ok: true, document: result.data };
  return { ok: false, message: result.error.issues
    .map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 5).join('; ') };
}
```

The `z.ZodType<DrillDocumentV3>` annotation makes `tsc` fail if the schema drifts from the interface — that is the drift guard; do not weaken it to `z.any()` anywhere.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/v3/schema.test.ts`
Expected: PASS. If the template acceptance test fails, the schema has a field wrong — compare against `types.ts`, not against the template.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`

```bash
git add src/domain/v3/schema.ts src/domain/v3/schema.test.ts
git commit -m "feat: structural Zod gate for DrillDocumentV3"
```

---

### Task 2: Preservation merge — edits must not destroy v3-only content

**Files:**
- Create: `src/domain/v3/mergeEditedV2.ts`
- Test: `src/domain/v3/mergeEditedV2.test.ts`

**Interfaces:**
- Consumes: `DrillDocumentV3` types; `migrateV2ToV3`; `projectToV2`.
- Produces: `export function mergeEditedIntoStored(stored: DrillDocumentV3, edited: DrillDocumentV3): DrillDocumentV3`. Task 4's save path calls it with `edited = migrateV2ToV3(editorDrill)`.

Why this exists: the editor round-trip is stored-v3 → `projectToV2` → edit → `migrateV2ToV3` → save. Projection drops equipment, annotations, all but the first puck track, phase structure and rich metadata; a naive save would therefore erase them from storage the first time a coach nudges a player in a template-derived drill. The merge keeps the **edited** document's actors, tracks, first puck track and timing (the coach's actual edits) and carries over from the **stored** document everything v2 could not have expressed.

Merge rules (exact):
1. Base is `edited` (it has the coach's changes).
2. `equipment`, `annotations`, `groups`: taken from `stored` verbatim.
3. `metadata`: `stored.metadata` with `title` overwritten by `edited.metadata.title` (renames happen in the editor).
4. `puckTracks`: `edited.puckTracks[0]` (if present) followed by `stored.puckTracks.slice(1)` — the editor can only have edited the projected first track.
5. `phases`: if `stored.phases.length > 1`, keep `stored.phases` and re-anchor every edited segment/action `phaseId` that no longer resolves onto the first stored phase; otherwise keep `edited.phases` (the single `migrateV2ToV3` phase).
6. `presentation`: `stored.presentation` with `durationSeconds` from `edited.presentation` (playback length is editable).
7. `templateId`, `createdAt`: from `stored`; `updatedAt`, `id`: from `edited`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/v3/mergeEditedV2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findTemplate } from '@/data/templates/registry';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { validateV3Document } from '@/domain/v3/validation';

function templateWithEquipment() {
  const withGear = window ?? undefined; void withGear;
  const found = /* any template that ships equipment and >1 puck track if available */
    [...Array(0)] ;
  return found;
}

describe('mergeEditedIntoStored', () => {
  const stored = (() => {
    // Pick a template that ships equipment; registry.test.ts guarantees facet
    // coverage, and the small-area games carry cones.
    const template = findTemplate('sag-cone-slalom') ?? (() => {
      const any = require('@/data/templates/registry').DRILL_TEMPLATES
        .find((t: { document: { equipment: unknown[] } }) => t.document.equipment.length > 0);
      if (!any) throw new Error('no template with equipment — pick another id');
      return any;
    })();
    return structuredClone(template.document);
  })();

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
```

Note for the implementer: the first test block sketches template selection two ways — delete the `templateWithEquipment` scaffold and the `require` fallback, then pick a real equipment-carrying template id by running `node -e` over the registry or reading `src/data/templates/smallArea.ts`; hardcode that id and assert in a `beforeAll` that `document.equipment.length > 0` so the test fails loudly if the template changes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/v3/mergeEditedV2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v3/mergeEditedV2.ts`**

```ts
import type { DrillDocumentV3, MovementSegment, PuckAction } from './types';

/**
 * An edit round-trip is stored-v3 → projectToV2 → edit → migrateV2ToV3.
 * Projection drops what v2 cannot say (equipment, annotations, extra puck
 * tracks, phase structure, rich metadata). Saving the migrated edit verbatim
 * would therefore erase those from storage. This merge keeps the coach's
 * edits and carries the inexpressible parts over from the stored document.
 */
export function mergeEditedIntoStored(
  stored: DrillDocumentV3,
  edited: DrillDocumentV3
): DrillDocumentV3 {
  const phases = stored.phases.length > 1 ? stored.phases : edited.phases;
  const validPhaseIds = new Set(phases.map(phase => phase.id));
  const anchorPhaseId = phases[0]?.id;

  const reanchorSegment = (segment: MovementSegment): MovementSegment =>
    validPhaseIds.has(segment.phaseId) ? segment : { ...segment, phaseId: anchorPhaseId ?? segment.phaseId };
  const reanchorAction = (action: PuckAction): PuckAction =>
    validPhaseIds.has(action.phaseId) ? action : { ...action, phaseId: anchorPhaseId ?? action.phaseId };

  return {
    ...edited,
    metadata: { ...stored.metadata, title: edited.metadata.title },
    groups: stored.groups,
    equipment: stored.equipment,
    annotations: stored.annotations,
    phases,
    actorTracks: edited.actorTracks.map(track => ({
      ...track, segments: track.segments.map(reanchorSegment),
    })),
    puckTracks: [
      ...edited.puckTracks.slice(0, 1).map(track => ({
        ...track, actions: track.actions.map(reanchorAction),
      })),
      ...stored.puckTracks.slice(1),
    ],
    presentation: { ...stored.presentation, durationSeconds: edited.presentation.durationSeconds },
    templateId: stored.templateId,
    createdAt: stored.createdAt,
    updatedAt: edited.updatedAt,
  };
}
```

(If `PuckAction` lacks a `phaseId` field name match, transcribe the actual field from `types.ts` — the type checker will catch it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/v3/mergeEditedV2.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/domain/v3/mergeEditedV2.ts src/domain/v3/mergeEditedV2.test.ts
git commit -m "feat: preservation merge so v2 edits cannot erase v3-only content"
```

---

### Task 3: v3 at rest — repository stores v3, DB v1→v2 upgrade

**Files:**
- Modify: `src/persistence/indexedDbRepository.ts` (`DB_VERSION`, `upgrade`, `reviveStoredDocument`, `saveMany`, `replaceAndSave`), `src/persistence/schema.ts` (stored-record gate), `src/persistence/types.ts` (`StoredDrillRecord`)
- Test: `src/persistence/indexedDbRepository.test.ts` (extend), new `src/persistence/v3Upgrade.test.ts`

**Interfaces:**
- Consumes: `parseDrillDocumentV3` (Task 1), `mergeEditedIntoStored` (Task 2), `migrateV2ToV3`, `projectToV2`, existing `migrateDrillCandidate`/`repairDrillDocument`.
- Produces: unchanged `DrillRepository` public interface — every method still speaks v2 `Drill` (`PersistenceResult<T>` as today), so `SaveCoordinator`, commands and UI need **no signature changes**. New stored shape `StoredDrillRecord = { id, name, updatedAt, document: DrillDocumentV3 }`. New public constant `export const DB_VERSION = 2`.

Behavior spec:
- **Upgrade (oldVersion < 2):** inside the version-change transaction, cursor over `drills`; for each record run `migrateDrillCandidate(record.document)` → `repairDrillDocument` → `migrateV2ToV3` and rewrite the record with the v3 document. Records that fail re-parse are snapshotted to `recovery` (`source: 'corrupt-record'`) and deleted, matching the existing corrupt-record contract. All of these functions are synchronous, so they are safe inside the `idb` upgrade transaction.
- **Load (`reviveStoredDocument`):** gate with `parseDrillDocumentV3`; on success `projectToV2(document).drill` → existing `repairDrillDocument` path. A stored record that fails the v3 gate but passes the old v2 storage schema is migrated on the fly (belt-and-braces for a half-upgraded store) — then rewritten. Anything else follows the existing corrupt-record path.
- **Save (`saveMany`, `replaceAndSave`):** for each incoming `Drill`, read the existing stored record in the same transaction; `next = mergeEditedIntoStored(existing.document, migrateV2ToV3(drill))` when one exists, else `migrateV2ToV3(drill)`. Validate with `parseDrillDocumentV3` before writing (replacing today's `parseStorableDrill` pre-check).
- `replaceAndSave` keeps snapshotting the *old stored v3 document* into `recovery`.

- [ ] **Step 1: Write the failing upgrade test**

Create `src/persistence/v3Upgrade.test.ts` (uses `fake-indexeddb`, same setup style as `indexedDbRepository.test.ts` — copy its `beforeEach` database-reset pattern):

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { IndexedDbDrillRepository, DB_NAME, DB_VERSION } from '@/persistence/indexedDbRepository';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';

async function seedV1Database() {
  // Build the schema exactly as DB_VERSION 1 did, with a v2 document inside.
  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      const drills = database.createObjectStore('drills', { keyPath: 'id' });
      drills.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('meta');
      database.createObjectStore('recovery', { keyPath: 'id' });
    },
  });
  const drill = structuredClone(giveAndGoRegressionDrill);
  await db.put('drills', { id: drill.id, name: drill.name, updatedAt: drill.updatedAt, document: drill });
  await db.put('drills', { id: 'corrupt', name: 'bad', updatedAt: 1, document: { schemaVersion: 2, players: 'nope' } });
  db.close();
}

describe('DB v1 → v2 upgrade', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    await seedV1Database();
  });

  it('bumps to version 2', () => {
    expect(DB_VERSION).toBe(2);
  });

  it('rewrites stored v2 documents as v3 and the app still loads them', async () => {
    const repository = new IndexedDbDrillRepository();
    const loaded = await repository.loadAll();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const revived = loaded.value.find(d => d.id === giveAndGoRegressionDrill.id);
      expect(revived).toBeDefined();
      expect(revived!.schemaVersion).toBe(2); // the app still receives v2
      expect(revived!.players.length).toBe(giveAndGoRegressionDrill.players.length);
    }
    const db = await openDB(DB_NAME, DB_VERSION);
    const record = await db.get('drills', giveAndGoRegressionDrill.id);
    expect(record.document.schemaVersion).toBe(3); // …but storage holds v3
    db.close();
  });

  it('quarantines an unmigratable record into recovery instead of dying', async () => {
    const repository = new IndexedDbDrillRepository();
    const loaded = await repository.loadAll();
    expect(loaded.ok).toBe(true);
    const db = await openDB(DB_NAME, DB_VERSION);
    const remaining = await db.get('drills', 'corrupt');
    const recovery = await db.getAll('recovery');
    expect(remaining).toBeUndefined();
    expect(recovery.some(r => r.source === 'corrupt-record')).toBe(true);
    db.close();
  });
});
```

Adjust method names (`loadAll` vs. the repository's actual read method) to the `DrillRepository` interface at `src/persistence/types.ts:189` when writing the test — use the interface as the source of truth, and unwrap `Result` values the way `indexedDbRepository.test.ts` already does.

- [ ] **Step 2: Write the failing save-merge test**

Append to `src/persistence/indexedDbRepository.test.ts`:

```ts
it('an edit-save round trip preserves v3-only content at rest', async () => {
  const { DRILL_TEMPLATES } = await import('@/data/templates/registry');
  const { projectToV2 } = await import('@/domain/v3/projectToV2');
  const withGear = DRILL_TEMPLATES.find(t => t.document.equipment.length > 0);
  expect(withGear).toBeDefined();

  const repository = new IndexedDbDrillRepository();
  const stored = structuredClone(withGear!.document);
  await repository.saveDocumentV3(stored);            // seeded as full v3 (Task 4 uses this)

  const { drill } = projectToV2(stored);
  drill.players[0] = { ...drill.players[0], x: drill.players[0].x + 10 };
  const saved = await repository.saveMany([drill]);
  expect(saved.ok).toBe(true);

  const db = await openDB(DB_NAME, DB_VERSION);
  const record = await db.get('drills', stored.id);
  expect(record.document.equipment).toEqual(stored.equipment);
  db.close();
});
```

This introduces one genuinely new public method — `saveDocumentV3(document: DrillDocumentV3): PersistenceResult<void>` — the only v3-typed door into the repository, needed by Task 4's template path. Add it to the `DrillRepository` interface in `src/persistence/types.ts`.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run src/persistence/v3Upgrade.test.ts src/persistence/indexedDbRepository.test.ts`
Expected: FAIL — `DB_VERSION` is 1, `saveDocumentV3` missing, stored documents still v2.

- [ ] **Step 4: Implement the storage changes**

In `src/persistence/types.ts`: change `StoredDrillRecord`'s `document: Drill` to `document: DrillDocumentV3`; add `saveDocumentV3` to `DrillRepository`.

In `src/persistence/schema.ts`: keep the existing v2 drill schema exported (the upgrade and the import path still parse v2), and add:

```ts
import { drillDocumentV3Schema } from '@/domain/v3/schema';
export const storedDrillRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  updatedAt: z.number(),
  document: drillDocumentV3Schema,
});
```

In `src/persistence/indexedDbRepository.ts`, per the behavior spec above:
- `DB_VERSION = 2`; extend `upgrade(database, oldVersion, _newVersion, tx)` with the `oldVersion < 2` cursor migration (synchronous transforms, `cursor.update(...)` / `cursor.delete()` + `tx.objectStore('recovery').put(...)`).
- `reviveStoredDocument`: v3 gate → project → existing repair path; v2 fallback → migrate → rewrite; else corrupt-record path.
- `saveMany` / `replaceAndSave`: read-merge-validate-write per drill inside the one transaction, using `mergeEditedIntoStored` when a stored record exists.
- `saveDocumentV3(document)`: validate with `parseDrillDocumentV3`, write `{ id: document.id, name: document.metadata.title, updatedAt: document.updatedAt, document }`.

- [ ] **Step 5: Run the whole persistence suite**

Run: `npx vitest run src/persistence/`
Expected: PASS — including all pre-existing repository, coordinator, import/export and failure tests, which prove the public v2-typed interface didn't drift.

- [ ] **Step 6: Check the coverage gate**

Run: `npm run test:coverage`
Expected: `src/persistence/**` ≥ 90% lines and branches. If the upgrade error branches are uncovered, extend `v3Upgrade.test.ts` rather than lowering anything.

- [ ] **Step 7: Commit**

```bash
git add src/persistence/ src/domain/v3/
git commit -m "feat: store drills as DrillDocumentV3 with a v1->v2 IndexedDB upgrade"
```

---

### Task 4: Templates save their full v3 documents

**Files:**
- Modify: `src/commands/documentCommands.ts:191-232` (`useTemplate`)
- Test: extend the existing `documentCommands` test file (locate with `ls src/commands/*.test.*`; the suite covering `useTemplate` — if none covers it, add `src/commands/useTemplate.test.ts` using the same harness as the file's other tests)

**Interfaces:**
- Consumes: `repository.saveDocumentV3` (Task 3), `mergeEditedIntoStored` semantics (no direct call), existing `projectToV2`, `remapImportedDrill`, `findTemplate`.
- Produces: no new exports; behavioral contract — after `useTemplate(id)`, the stored record's `document.equipment` equals the template's, while the editor state holds the projected v2 copy, exactly as today.

Today `useTemplate` projects v3→v2 and saves the projection, so equipment/extra-pucks/metadata die at copy time — before the coach even edits. After Task 3 the repository can hold v3, so the template path should store the real document.

- [ ] **Step 1: Write the failing test**

In the commands test harness (mirror how neighbouring tests stub the repository — they use `__setRepositoryForTests` from `src/persistence/index.ts`):

```ts
it('useTemplate stores the full v3 document, not the projection', async () => {
  const { DRILL_TEMPLATES } = await import('@/data/templates/registry');
  const withGear = DRILL_TEMPLATES.find(t => t.document.equipment.length > 0)!;
  // …invoke useTemplate(withGear.id) through the harness…
  // Assert the repository received a saveDocumentV3 call whose document:
  //   - has equipment deep-equal to withGear.document.equipment
  //   - has templateId === withGear.id
  //   - has a fresh id (not withGear.document.id)
  // and that the editor dispatch got the projected v2 drill with the same fresh id.
});
```

Fill in the invocation using the file's existing test pattern for `useTemplate`/`loadFixture` — the harness already exists for `documentCommands`; copy its setup verbatim.

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — the repository receives `save`/`saveMany` with a projected v2 drill and no `saveDocumentV3` call.

- [ ] **Step 3: Change `useTemplate`**

Inside the existing function (keeping the dynamic imports and loss announcement):

```ts
const { drill: projected, losses } = projectToV2(template.document);
const now = host.now();
const freshId = generateId();
const copy: Drill = { ...remapImportedDrill(projected, generateId, now),
  id: freshId, name: template.document.metadata.title, createdAt: now, updatedAt: now };
const documentCopy: DrillDocumentV3 = {
  ...structuredClone(template.document),
  id: freshId, templateId: template.id, createdAt: now, updatedAt: now,
  metadata: { ...template.document.metadata },
};
dispatch({ type: 'LOAD_DRILL', drill: copy });
await repository.saveDocumentV3(documentCopy);
coordinator.adoptSaved(copy, now);
```

Two invariants to keep: the *projected* copy and the *stored* document share `id` (so later edit-saves merge onto the right record), and `remapImportedDrill`'s player/path re-idding means the projected drill's internal ids differ from the stored document's — that is fine because the save-merge (Task 3) replaces actors/tracks wholesale from the edited side. Note the id-remap asymmetry in a code comment at the call site: actor ids in the stored extras (`groups`) may dangle after the first save-merge; `mergeEditedIntoStored` already re-anchors phases, and `validateV3Document` treats an unknown group member as an error — so drop groups whose members no longer resolve inside `mergeEditedIntoStored` if the Task 2 coherence test starts failing here. Check `coordinator.adoptSaved`'s exact signature (`adoptSaved(drill: Drill, savedAt?: number)`) before wiring.

- [ ] **Step 4: Run the commands suite**

Run: `npx vitest run src/commands/`
Expected: PASS, coverage gate for `src/commands/**` (90/85) still met.

- [ ] **Step 5: Commit**

```bash
git add src/commands/
git commit -m "feat: template copies persist their full v3 documents"
```

---

### Task 5: Exports carry v3; every historical import shape still works

**Files:**
- Modify: `src/persistence/types.ts` (`ExportPayload`), `src/persistence/exportService.ts`, `src/persistence/importService.ts`
- Test: extend `src/persistence/exportService.test.ts` and `src/persistence/importService.test.ts`

**Interfaces:**
- Consumes: `parseDrillDocumentV3`, `migrateV2ToV3`, `projectToV2`, existing `prepareImport`/`migrateDrillCandidate`.
- Produces: `ExportPayload` version bumps `1 → 2` with `documents: DrillDocumentV3[]` replacing `drills: Drill[]`. Import accepts, in order of detection: version-2 payload (`documents`), version-1 payload (`drills`), bare array, bare drill object, bare v3 document object.

- [ ] **Step 1: Write the failing tests**

In `exportService.test.ts`:

```ts
it('exports version 2 payloads holding v3 documents', async () => {
  // build/export via the service's existing test harness, then:
  expect(payload.format).toBe('phicecraft-drills');
  expect(payload.version).toBe(2);
  expect(payload.documents.every(d => d.schemaVersion === 3)).toBe(true);
  expect('drills' in payload).toBe(false);
});
```

In `importService.test.ts`:

```ts
it('imports a version-1 export payload (v2 drills) unchanged in meaning', async () => {
  const legacy = { format: 'phicecraft-drills', version: 1, exportedAt: 5,
    containsUnsavedRevision: false, drills: [structuredClone(giveAndGoRegressionDrill)] };
  // run prepareImport/import through the harness; expect ok, one drill,
  // same player count as the fixture.
});

it('imports a version-2 export payload (v3 documents)', async () => {
  const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
  const payload = { format: 'phicecraft-drills', version: 2, exportedAt: 5,
    containsUnsavedRevision: false, documents: [doc] };
  // expect ok; the imported editor drill has the fixture's players.
});

it('imports a bare v3 document object', async () => {
  const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
  // prepareImport(doc) → ok, one drill.
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/persistence/exportService.test.ts src/persistence/importService.test.ts`
Expected: FAIL on the three new tests, PASS on all existing ones.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
export interface ExportPayload {
  format: 'phicecraft-drills';
  version: 2;
  exportedAt: number;
  containsUnsavedRevision: boolean;
  documents: DrillDocumentV3[];
}
export interface LegacyExportPayloadV1 {
  format: 'phicecraft-drills'; version: 1; exportedAt: number;
  containsUnsavedRevision: boolean; drills: Drill[];
}
```

`exportService.ts`: source the documents from storage (they are already v3 after Task 3 — export the stored documents rather than re-migrating projections, so v3-only content is included in backups).

`importService.ts` `prepareImport` detection order (each candidate normalized to a v2 editor `Drill` list via `projectToV2` for v3 inputs and `migrateDrillCandidate` for v2/v1 inputs, then the existing `remapImportedDrill` re-id path; v3 originals are additionally passed to `repository.saveDocumentV3` so imports keep their extras):

```ts
if (isRecord(input) && Array.isArray((input as { documents?: unknown }).documents)) { /* v2 payload */ }
else if (isRecord(input) && Array.isArray((input as { drills?: unknown }).drills)) { /* v1 payload */ }
else if (Array.isArray(input)) { /* bare array of drills or documents — sniff schemaVersion per item */ }
else if (isRecord(input) && (input as { schemaVersion?: unknown }).schemaVersion === 3) { /* bare v3 doc */ }
else { /* bare v2/v1 drill — existing path */ }
```

- [ ] **Step 4: Run the full persistence suite plus coverage**

Run: `npx vitest run src/persistence/ && npm run test:coverage`
Expected: PASS; `src/persistence/**` ≥ 90/90.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/
git commit -m "feat: version-2 exports carry v3 documents; all legacy import shapes kept"
```

---

### Task 6: Full-suite verification and documentation

**Files:**
- Modify: `docs/v2/PROGRESS.md` (record the storage flip), `docs/MECHANICS_BASELINE.md` only if it names the stored schema (grep first)

**Interfaces:** consumes everything above; produces nothing further.

- [ ] **Step 1: Run everything**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:coverage`
Expected: all green, coverage gates met.

- [ ] **Step 2: Run the e2e persistence-relevant projects if a browser is installed**

Run: `npx playwright install --with-deps chromium` (once), then `npx playwright test --project=pwa --project=flows`
Expected: PASS — cold-start, save and reload flows exercise the DB upgrade in a real browser context.

- [ ] **Step 3: Document the flip**

Append to `docs/v2/PROGRESS.md` under a new `## Phase 2 — v3 at rest` heading: storage now holds `DrillDocumentV3` (DB_VERSION 2 upgrade, recovery-quarantine for unmigratable records); the editor and simulation still speak v2 via `projectToV2`/`migrateV2ToV3` at the persistence seam; `mergeEditedIntoStored` is the invariant that edits never erase v3-only content; exports are version 2 with all older import shapes accepted. Note the explicit non-goals left for the next phase: v3-native simulation, editing equipment/phases/extra pucks in the UI.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: record the v3 at-rest storage flip"
```

---

## Self-review notes (already applied)

- The audit's sequence said "store v3 first, keep projection as a temporary adapter" — this plan does exactly that and adds the preservation merge the audit did not anticipate, without which step one silently loses data.
- `CURRENT_DRILL_SCHEMA_VERSION` and `src/engine/drill.ts`'s literal `2`s intentionally stay: they describe the in-memory model, which is unchanged. Flipping them belongs to the future v3-native-simulation phase.
- Type-consistency check: `parseDrillDocumentV3` (Tasks 1,3,5), `mergeEditedIntoStored` (Tasks 2,3), `saveDocumentV3` (Tasks 3,4,5) are spelled identically everywhere above.

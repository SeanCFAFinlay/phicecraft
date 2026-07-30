# Phase 2 (v3 at rest) — ticketed follow-ups

Carried out of the Phase 2 whole-branch review (branch overhaul/audit-phases,
range 47d919c..5e6c963). None block that merge; each has a stated deadline.

1. **Before any v3 schema evolution (hard deadline):** when `prepareForWrite`'s
   `parseDrillDocumentV3` gate fails but `existing.document?.schemaVersion === 3`
   (version skew, e.g. PWA rollback after a schema addition), snapshot
   `existing.document` to `recovery` before overwriting — today the save
   silently destroys the newer-schema document. `src/persistence/indexedDbRepository.ts`
   (`prepareForWrite`).
2. **Duplicate loses v3 extras:** `saveAsNew` copies the in-memory v2 projection,
   so duplicating a template-derived drill silently drops equipment/annotations/
   extra pucks. Duplicate via the stored v3 document (restamp id,
   `saveDocumentV3`, project for the editor — the `useTemplate` pattern) or at
   minimum announce projection losses. `src/commands/documentCommands.ts:338-342`.
3. **Replace-mode import is a merge, not a replacement:** a confirmed "replace"
   keeps the OLD document's equipment/annotations/metadata with the import's
   actors/tracks/title. Right for restoring one's own pre-v3 backup; a chimera
   for foreign files. Make the ruling deliberate (document as restore semantics,
   or skip the merge on replace decisions). `replaceAndSave`/`prepareForWrite`.
4. **FakeRepository should store v3 natively** so command/import tests can prove
   extras survive end-to-end without spy workarounds. `src/test/fakeRepository.ts`.
5. Minor: `drillMetadata.title` → `.min(1)` (empty-title doc is storable but
   unimportable); `useTemplate` failure path resets the coordinator before
   `saveDocumentV3` so `retrySave` is a no-op (slight recoverability regression);
   `rewriteStoredRecord` read-then-put race (theoretical); import-preview loss
   copy reads developer-facing ("until the new engine lands").
6. **Groups round-trip:** tripwire test forbids templates shipping non-empty
   `groups` until `SkaterActor.groupId` survives the v2 edit round trip — design
   belongs to the v3-native-simulation phase. `src/data/templates/registry.test.ts`.

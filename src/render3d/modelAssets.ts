// ============================================================================
// MODEL URLS
//
// The single source of truth for where the two rigged GLBs live under
// `public/`. Later render3d code imports MODEL_URLS rather than writing the
// path as a string literal, so a future relocation is a one-line change here
// instead of a grep-and-replace across the renderer.
//
// Both files are Blender-authored, first-party, rigged with one skin each and
// a single named animation clip (`skate` for the skater, `goalie_idle` for
// the goalie) — see src/render3d/modelAssets.test.ts, which pins the shipped
// binaries themselves rather than trusting this comment.
// ============================================================================

export const MODEL_URLS = {
  skater: '/assets/models/hockey_player.glb',
  goalie: '/assets/models/hockey_goalie.glb',
} as const;

export type ModelKey = keyof typeof MODEL_URLS;

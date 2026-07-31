// ============================================================================
// RENDER QUALITY
//
// Extracted from `useCanvasLayers.ts` (which still owns the auto-degrade
// policy and re-exports this type for backward compatibility) so the
// render/webgl layer can depend on the TYPE alone without importing a React
// hook module.
// ============================================================================

export type RenderQuality = 'high' | 'medium' | 'low';

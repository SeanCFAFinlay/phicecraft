// ============================================================================
// TINT MATERIALS
//
// `SkeletonUtils.clone()` (Board3D.tsx spawns one skater/goalie per drill
// player from a single parsed GLTF this way) clones the mesh/skeleton
// hierarchy but leaves every clone pointing at the SAME material instances as
// the source - tinting one actor's jersey would repaint every actor sharing
// that GLB. This clones the materials whose colour actually varies per actor
// (jersey/accent/pants) before recolouring them, so two differently-tinted
// actors never share a material instance. Every other named material in the
// GLB (skin/white/dark/steel/stick) never varies per actor and is left
// alone - untouched, and still shared, which is cheaper and correct.
// ============================================================================

import * as THREE from 'three';

export interface ActorPalette {
  jersey: string;
  accent: string;
  pants: string;
}

const TINTED_KEYS = ['jersey', 'accent', 'pants'] as const satisfies readonly (keyof ActorPalette)[];

function tintOne(material: THREE.Material, palette: ActorPalette): THREE.Material {
  const key = TINTED_KEYS.find(candidate => candidate === material.name);
  if (!key) return material;
  const color = palette[key];

  const cloned = material.clone();
  if (cloned instanceof THREE.MeshStandardMaterial) {
    cloned.color.set(color);
  }
  return cloned;
}

/**
 * Clones and recolours `root`'s jersey/accent/pants materials in place.
 *
 * Must run once per actor, right after it is cloned from the shared parsed
 * GLTF and before it joins the scene - otherwise a later actor's tint would
 * silently repaint every earlier clone still pointing at the same instance.
 *
 * Returns the newly created clone instances (never the untouched shared
 * ones) so the caller (`createActor`) can dispose exactly these - and only
 * these - when the actor itself is disposed. The clones are this actor's own
 * property; every other named material (skin/white/dark/steel/stick) is
 * still the shared source instance and must never be disposed here.
 */
export function tintActorMaterials(root: THREE.Object3D, palette: ActorPalette): THREE.Material[] {
  const tinted: THREE.Material[] = [];

  const applyTint = (material: THREE.Material): THREE.Material => {
    const result = tintOne(material, palette);
    if (result !== material) tinted.push(result);
    return result;
  };

  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.material = Array.isArray(node.material)
      ? node.material.map(applyTint)
      : applyTint(node.material);
  });

  return tinted;
}

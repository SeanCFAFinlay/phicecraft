// ============================================================================
// TINT MATERIALS
// ============================================================================

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { tintActorMaterials } from './tintMaterials';

/** A minimal actor-shaped fixture: one mesh, one material per name. */
function actorWithMaterials(names: string[]): THREE.Group {
  const group = new THREE.Group();
  const materials = names.map(name => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    material.name = name;
    return material;
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    materials.length === 1 ? materials[0] : materials
  );
  mesh.name = 'Body';
  group.add(mesh);
  return group;
}

describe('tintActorMaterials', () => {
  it('recolours the jersey/accent/pants materials and leaves an untinted one alone', () => {
    const root = actorWithMaterials(['jersey', 'accent', 'pants', 'skin']);
    tintActorMaterials(root, { jersey: '#ff0000', accent: '#00ff00', pants: '#0000ff' });

    const mesh = root.getObjectByName('Body') as THREE.Mesh;
    const [jersey, accent, pants, skin] = mesh.material as THREE.MeshStandardMaterial[];
    expect(jersey.color.getHexString()).toBe('ff0000');
    expect(accent.color.getHexString()).toBe('00ff00');
    expect(pants.color.getHexString()).toBe('0000ff');
    expect(skin.color.getHexString()).toBe('ffffff');
  });

  it('never shares a tinted material instance between two actors with different palettes', () => {
    const actorA = actorWithMaterials(['jersey']);
    const actorB = actorWithMaterials(['jersey']);

    // SkeletonUtils.clone() leaves both clones pointing at the SAME material
    // instance as the source - reproduce that here before tinting either one.
    const shared = (actorA.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    (actorB.getObjectByName('Body') as THREE.Mesh).material = shared;

    tintActorMaterials(actorA, { jersey: '#e63946', accent: '#ffffff', pants: '#182432' });
    tintActorMaterials(actorB, { jersey: '#2f80ed', accent: '#ffffff', pants: '#182432' });

    const materialA = (actorA.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const materialB = (actorB.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial;

    expect(materialA).not.toBe(materialB);
    expect(materialA.color.getHexString()).toBe('e63946');
    expect(materialB.color.getHexString()).toBe('2f80ed');
    // The shared source instance itself was never mutated - both actors got
    // their own clone.
    expect(shared.color.getHexString()).toBe('ffffff');
  });

  it('does not clone a material with no matching palette entry (identity preserved)', () => {
    const root = actorWithMaterials(['skin']);
    const mesh = root.getObjectByName('Body') as THREE.Mesh;
    const before = mesh.material as THREE.MeshStandardMaterial;

    tintActorMaterials(root, { jersey: '#ff0000', accent: '#00ff00', pants: '#0000ff' });

    expect(mesh.material).toBe(before);
  });

  it('handles a mesh with a single (non-array) material', () => {
    const root = actorWithMaterials(['jersey']);
    tintActorMaterials(root, { jersey: '#123456', accent: '#ffffff', pants: '#182432' });

    const mesh = root.getObjectByName('Body') as THREE.Mesh;
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('123456');
  });
});

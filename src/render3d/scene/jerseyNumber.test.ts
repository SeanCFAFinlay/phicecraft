import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyJerseyNumber, luminance, numberColours } from './jerseyNumber';

function modelWithPanel(): { root: THREE.Group; shared: THREE.MeshStandardMaterial } {
  const shared = new THREE.MeshStandardMaterial({ name: 'number', transparent: true, opacity: 0 });
  const jersey = new THREE.MeshStandardMaterial({ name: 'jersey' });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [jersey, shared]));
  return { root, shared };
}

describe('jersey number colours', () => {
  it('measures luminance from a hex colour', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#fff')).toBeCloseTo(1);
    expect(luminance('not a colour')).toBe(0);
  });

  it('prints light digits on a dark sweater and dark digits on a light one', () => {
    expect(numberColours('#1d3557', '#e63946').fill).toBe('#ffffff');
    expect(numberColours('#f1f5f9', '#e63946').fill).toBe('#0b1622');
  });

  it('outlines with the accent only when the accent stands out from the sweater', () => {
    expect(numberColours('#1d3557', '#ffd60a').outline).toBe('#ffd60a');
    // Accent the same as the sweater would make the outline invisible.
    expect(numberColours('#1d3557', '#1d3557').outline).toBe('#0b1622');
  });
});

describe('applyJerseyNumber', () => {
  it('gives each actor its own panel material and leaves the shared one alone', () => {
    const { root, shared } = modelWithPanel();
    const printed = applyJerseyNumber(root, '17', { jersey: '#e63946', accent: '#ffffff' });

    expect(printed.panels).toBe(1);
    const mesh = root.children[0] as THREE.Mesh;
    const materials = mesh.material as THREE.Material[];
    expect(materials[0].name).toBe('jersey');
    expect(materials[1]).not.toBe(shared);
    expect(materials[1].name).toBe('number');
    printed.dispose();
  });

  it('hides the panel for a player without a number', () => {
    const { root } = modelWithPanel();
    const printed = applyJerseyNumber(root, undefined, { jersey: '#e63946', accent: '#ffffff' });
    const mesh = root.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.Material[])[1].visible).toBe(false);
    printed.dispose();
  });

  it('does nothing to a model without a number panel', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ name: 'jersey' });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const printed = applyJerseyNumber(root, '9', { jersey: '#e63946', accent: '#ffffff' });
    expect(printed.panels).toBe(0);
    expect((root.children[0] as THREE.Mesh).material).toBe(material);
    printed.dispose();
  });
});

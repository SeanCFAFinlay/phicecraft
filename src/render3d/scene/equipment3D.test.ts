import { describe, it, expect } from 'vitest';
import { createEquipmentOverlay3D } from './equipment3D';
import { buildDrill } from '@/test/builders';
import type { EquipmentItem } from '@/core/types';

describe('equipment3D', () => {
  it('creates 3D models for all kinds of training equipment and disposes cleanly', () => {
    const items: EquipmentItem[] = [
      { id: 'eq-1', kind: 'cone', position: { x: 100, y: 100 } },
      { id: 'eq-2', kind: 'tire', position: { x: 150, y: 120 } },
      { id: 'eq-3', kind: 'gate', position: { x: 200, y: 150 } },
      { id: 'eq-4', kind: 'mini-net', position: { x: 250, y: 200 }, rotation: 0.5 },
      { id: 'eq-5', kind: 'barrier', position: { x: 300, y: 250 }, size: { width: 50, height: 10 } },
      { id: 'eq-6', kind: 'puck-pile', position: { x: 350, y: 300 } },
      { id: 'eq-7', kind: 'start-marker', position: { x: 400, y: 350 } },
    ];

    const drill = buildDrill({ equipment: items });
    const overlay = createEquipmentOverlay3D(drill, 'high');

    expect(overlay.root).toBeDefined();
    expect(overlay.root.children.length).toBe(7);

    expect(overlay.root.getObjectByName('cone-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('tire-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('gate-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('mini-net-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('barrier-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('puck-pile-3d')).toBeDefined();
    expect(overlay.root.getObjectByName('marker-disc-3d')).toBeDefined();

    expect(() => overlay.dispose()).not.toThrow();
  });

  it('handles empty equipment lists gracefully', () => {
    const drill = buildDrill({ equipment: [] });
    const overlay = createEquipmentOverlay3D(drill);

    expect(overlay.root.children.length).toBe(0);
    expect(() => overlay.dispose()).not.toThrow();
  });
});

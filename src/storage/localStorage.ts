// ============================================================================
// LOCAL STORAGE - Drill persistence layer
// ============================================================================

import type { Drill, ID } from '@/core/types';
import { STORAGE_KEYS } from '@/core/constants';
import { repairDrill, validateDrill } from '@/engine/drill';

/**
 * Drill list item for storage
 */
interface StoredDrillMeta {
  id: ID;
  name: string;
  updatedAt: number;
}

/**
 * Get all stored drills metadata
 */
export function getDrillList(): StoredDrillMeta[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DRILLS);
    if (!data) return [];

    const list = JSON.parse(data);
    if (!Array.isArray(list)) return [];

    return list.filter(
      (item): item is StoredDrillMeta =>
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.updatedAt === 'number'
    );
  } catch (error) {
    console.error('Failed to load drill list:', error);
    return [];
  }
}

/**
 * Save drill list metadata
 */
function saveDrillList(list: StoredDrillMeta[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.DRILLS, JSON.stringify(list));
    return true;
  } catch (error) {
    console.error('Failed to save drill list:', error);
    return false;
  }
}

/**
 * Get a single drill by ID
 */
export function getDrill(id: ID): Drill | null {
  try {
    const key = `${STORAGE_KEYS.DRILLS}_${id}`;
    const data = localStorage.getItem(key);
    if (!data) return null;

    const drill = JSON.parse(data) as Drill;

    // Validate and repair if needed
    const validation = validateDrill(drill);
    if (!validation.valid) {
      console.warn('Drill validation failed, repairing:', validation.errors);
      return repairDrill(drill);
    }

    return drill;
  } catch (error) {
    console.error('Failed to load drill:', error);
    return null;
  }
}

/**
 * Save a drill
 */
export function saveDrill(drill: Drill): boolean {
  try {
    // Save drill data
    const key = `${STORAGE_KEYS.DRILLS}_${drill.id}`;
    localStorage.setItem(key, JSON.stringify(drill));

    // Update drill list
    const list = getDrillList();
    const existingIndex = list.findIndex(d => d.id === drill.id);

    const meta: StoredDrillMeta = {
      id: drill.id,
      name: drill.name,
      updatedAt: drill.updatedAt,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = meta;
    } else {
      list.push(meta);
    }

    // Sort by updatedAt descending
    list.sort((a, b) => b.updatedAt - a.updatedAt);

    return saveDrillList(list);
  } catch (error) {
    console.error('Failed to save drill:', error);
    return false;
  }
}

/**
 * Delete a drill
 */
export function deleteDrill(id: ID): boolean {
  try {
    // Remove drill data
    const key = `${STORAGE_KEYS.DRILLS}_${id}`;
    localStorage.removeItem(key);

    // Update drill list
    const list = getDrillList().filter(d => d.id !== id);
    return saveDrillList(list);
  } catch (error) {
    console.error('Failed to delete drill:', error);
    return false;
  }
}

/**
 * Get/set current drill ID
 */
export function getCurrentDrillId(): ID | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_DRILL);
  } catch {
    return null;
  }
}

export function setCurrentDrillId(id: ID | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_DRILL, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_DRILL);
    }
  } catch (error) {
    console.error('Failed to save current drill ID:', error);
  }
}

/**
 * Export all drills as JSON
 */
export function exportAllDrills(): string {
  const list = getDrillList();
  const drills: Drill[] = [];

  for (const meta of list) {
    const drill = getDrill(meta.id);
    if (drill) {
      drills.push(drill);
    }
  }

  return JSON.stringify(drills, null, 2);
}

/**
 * Import drills from JSON
 */
export function importDrills(json: string): { imported: number; failed: number } {
  let imported = 0;
  let failed = 0;

  try {
    const data = JSON.parse(json);
    const drills = Array.isArray(data) ? data : [data];

    for (const drill of drills) {
      if (drill && typeof drill === 'object' && drill.name) {
        const repaired = repairDrill(drill as Drill);
        if (saveDrill(repaired)) {
          imported++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }
  } catch {
    failed++;
  }

  return { imported, failed };
}

/**
 * Clear all stored drills
 */
export function clearAllDrills(): void {
  const list = getDrillList();

  for (const drill of list) {
    const key = `${STORAGE_KEYS.DRILLS}_${drill.id}`;
    localStorage.removeItem(key);
  }

  localStorage.removeItem(STORAGE_KEYS.DRILLS);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_DRILL);
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): { used: number; available: number } {
  let used = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('phicecraft')) {
        const value = localStorage.getItem(key);
        if (value) {
          used += key.length + value.length;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Estimate 5MB available (typical localStorage limit)
  const available = 5 * 1024 * 1024;

  return { used, available };
}

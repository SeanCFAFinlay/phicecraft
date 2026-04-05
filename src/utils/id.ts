// ============================================================================
// ID GENERATION
// ============================================================================

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate a short unique identifier (for display)
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 9);
}

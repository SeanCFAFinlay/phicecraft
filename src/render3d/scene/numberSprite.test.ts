import { describe, it, expect } from 'vitest';
import { createNumberSprite } from './numberSprite';

describe('numberSprite', () => {
  it('creates a sprite with correct position and disposes cleanly', () => {
    const num = createNumberSprite('99', { jersey: '#e63946' }, 'high');
    expect(num.sprite).toBeDefined();
    expect(num.sprite.name).toBe('number-sprite');
    expect(num.sprite.position.y).toBeCloseTo(2.05);

    // Dispose
    expect(() => num.dispose()).not.toThrow();
  });

  it('supports low quality resolution', () => {
    const num = createNumberSprite('8', { jersey: '#2f80ed' }, 'low');
    expect(num.sprite).toBeDefined();
    num.dispose();
  });
});

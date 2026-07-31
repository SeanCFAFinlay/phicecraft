// ============================================================================
// GAME SCENE POOLS — unit test
//
// Plain Graphics/Container construction needs no canvas/DOM (unlike Text or
// a gradient fill), so this runs as a node-environment `.test.ts`, not a
// `.dom.test.ts`.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { GraphicsKeyedPool, TokenPool } from './gameScenePool';

describe('GraphicsKeyedPool', () => {
  it('creates a new Graphics on first use and adds it to the parent', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    const g = pool.get('a');

    expect(parent.children).toContain(g);
    expect(g.visible).toBe(true);
  });

  it('reuses the SAME Graphics instance for a key seen again', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    const first = pool.get('a');
    pool.begin();
    const second = pool.get('a');

    expect(second).toBe(first);
    expect(parent.children).toHaveLength(1);
  });

  it('hides (does not remove) a key not seen since the last begin()/end() cycle', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    pool.begin();
    const g = pool.get('a');
    pool.end();

    pool.begin();
    // 'a' not requested this cycle.
    pool.end();

    expect(g.visible).toBe(false);
    expect(parent.children).toContain(g); // still pooled, not destroyed
  });

  it('touch() marks an existing key seen/visible WITHOUT clearing it', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    pool.begin();
    const g = pool.get('a');
    g.circle(0, 0, 5).fill(0xff0000); // draw something
    pool.end();

    pool.begin();
    const touched = pool.touch('a');
    pool.end();

    expect(touched).toBe(g);
    expect(g.visible).toBe(true);
    // Still has draw content - touch() must not have cleared it.
    expect(g.context.instructions.length).toBeGreaterThan(0);
  });

  it('touch() returns undefined for a key never created, so the caller can fall back to get()', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    expect(pool.touch('never-seen')).toBeUndefined();
  });

  it('touch() keeps a key visible across an end()/begin() cycle just like get() does', () => {
    const parent = new Container();
    const pool = new GraphicsKeyedPool(parent);

    pool.begin();
    const g = pool.get('a');
    pool.end();
    expect(g.visible).toBe(true);

    pool.begin();
    pool.touch('a');
    pool.end();

    expect(g.visible).toBe(true);
  });
});

describe('TokenPool', () => {
  interface Token {
    container: Container;
  }

  it('creates one token per key via the factory and adds its container to the parent', () => {
    const parent = new Container();
    let created = 0;
    const pool = new TokenPool<Token>(parent, () => {
      created += 1;
      return { container: new Container() };
    });

    const token = pool.get('a');

    expect(created).toBe(1);
    expect(parent.children).toContain(token.container);
  });

  it('reuses the SAME token for a key seen again, never calling the factory twice', () => {
    const parent = new Container();
    let created = 0;
    const pool = new TokenPool<Token>(parent, () => {
      created += 1;
      return { container: new Container() };
    });

    const first = pool.get('a');
    pool.begin();
    const second = pool.get('a');

    expect(second).toBe(first);
    expect(created).toBe(1);
  });

  it('hides (does not remove) a token whose key was not seen this cycle', () => {
    const parent = new Container();
    const pool = new TokenPool<Token>(parent, () => ({ container: new Container() }));

    pool.begin();
    const token = pool.get('a');
    pool.end();

    pool.begin();
    pool.end(); // 'a' not requested

    expect(token.container.visible).toBe(false);
    expect(parent.children).toContain(token.container);
  });
});

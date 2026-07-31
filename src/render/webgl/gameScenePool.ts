// ============================================================================
// GAME SCENE — pooling primitives
//
// Every repeating group in the dynamic scene (skate paths, events, pass
// candidates, players, edit handles, ghost trails) is backed by one of these
// keyed pools: `.get(key)` reuses an existing Graphics/Container if the key
// was seen last frame, or creates one on first use - `.clear()` and redraw,
// never destroy/recreate (Task 3's ghost-trail fix, extended to the rest of
// the dynamic layer). A key no longer present this frame is hidden
// (`visible = false`), not removed, so it is ready to reappear cheaply.
// ============================================================================

import { Container, Graphics } from 'pixi.js';

export class GraphicsKeyedPool {
  private readonly items = new Map<string, Graphics>();
  private readonly seen = new Set<string>();
  constructor(private readonly parent: Container) {}

  get(key: string): Graphics {
    let g = this.items.get(key);
    if (!g) {
      g = new Graphics();
      this.items.set(key, g);
      this.parent.addChild(g);
    }
    g.visible = true;
    g.clear();
    this.seen.add(key);
    return g;
  }

  begin(): void {
    this.seen.clear();
  }

  end(): void {
    for (const [key, g] of this.items) {
      if (!this.seen.has(key)) g.visible = false;
    }
  }
}

export class TokenPool<V extends { container: Container }> {
  private readonly items = new Map<string, V>();
  private readonly seen = new Set<string>();
  constructor(
    private readonly parent: Container,
    private readonly factory: () => V
  ) {}

  get(key: string): V {
    let v = this.items.get(key);
    if (!v) {
      v = this.factory();
      this.items.set(key, v);
      this.parent.addChild(v.container);
    }
    v.container.visible = true;
    this.seen.add(key);
    return v;
  }

  begin(): void {
    this.seen.clear();
  }

  end(): void {
    for (const [key, v] of this.items) {
      if (!this.seen.has(key)) v.container.visible = false;
    }
  }
}

// ============================================================================
// STARRED DRILLS
//
// Which templates a coach has marked. Kept in localStorage rather than in the
// drill store: a favourite is about the person, not about any one drill, and
// it should survive switching between plays and clearing the board.
//
// Failures are swallowed on purpose. A browser with storage disabled should
// give a coach a library that forgets its stars, not a library that refuses to
// open.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';

const KEY = 'phicecraft_favourite_drills';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter(item => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function write(values: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...values]));
  } catch {
    /* a coach with storage disabled simply does not keep their stars */
  }
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<Set<string>>(() => new Set());

  // Read after mount rather than during render, so the first paint does not
  // depend on storage and server-side rendering stays possible.
  useEffect(() => {
    setFavourites(read());
  }, []);

  const toggle = useCallback((id: string) => {
    setFavourites(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
      return next;
    });
  }, []);

  return { favourites, toggle };
}

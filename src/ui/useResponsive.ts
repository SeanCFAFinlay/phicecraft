// ============================================================================
// RESPONSIVE
//
// One place that decides which layout is in play, so components branch on a
// named breakpoint rather than each inventing its own media query.
// ============================================================================

import { useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

export interface ResponsiveState {
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Landscape with almost no vertical room - the hardest case for the rink. */
  isCompactLandscape: boolean;
  isLandscape: boolean;
  /** Coarse pointer: phrase instructions as "tap" rather than "click". */
  isTouch: boolean;
  prefersReducedMotion: boolean;
  width: number;
  height: number;
}

export const BREAKPOINTS = {
  /** Below this is a phone. */
  tablet: 768,
  /** At or above this is a desktop. */
  desktop: 1024,
  /** At or below this height, in landscape, is the compact layout. */
  compactLandscapeHeight: 500,
} as const;

const QUERIES = [
  `(min-width: ${BREAKPOINTS.tablet}px)`,
  `(min-width: ${BREAKPOINTS.desktop}px)`,
  `(max-height: ${BREAKPOINTS.compactLandscapeHeight}px)`,
  '(orientation: landscape)',
  '(pointer: coarse)',
  '(prefers-reduced-motion: reduce)',
];

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

let cached: ResponsiveState | null = null;

function computeSnapshot(): ResponsiveState {
  const width = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const height = typeof window === 'undefined' ? 768 : window.innerHeight;

  const isTablet = matches(QUERIES[0]);
  const isDesktop = matches(QUERIES[1]);
  const isLandscape = matches(QUERIES[3]);
  const isShort = matches(QUERIES[2]);

  const breakpoint: Breakpoint = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'phone';

  const next: ResponsiveState = {
    breakpoint,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isCompactLandscape: isShort && isLandscape,
    isLandscape,
    isTouch: matches(QUERIES[4]),
    prefersReducedMotion: matches(QUERIES[5]),
    width,
    height,
  };

  // useSyncExternalStore requires a stable snapshot between changes.
  if (
    cached &&
    cached.breakpoint === next.breakpoint &&
    cached.isCompactLandscape === next.isCompactLandscape &&
    cached.isLandscape === next.isLandscape &&
    cached.isTouch === next.isTouch &&
    cached.prefersReducedMotion === next.prefersReducedMotion &&
    cached.width === next.width &&
    cached.height === next.height
  ) {
    return cached;
  }

  cached = next;
  return next;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const lists = QUERIES.map(query => window.matchMedia(query));
  const onChange = () => {
    cached = null;
    listener();
  };

  for (const list of lists) {
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange);
    else list.addListener(onChange);
  }
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);

  return () => {
    for (const list of lists) {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', onChange);
      else list.removeListener(onChange);
    }
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

const SERVER_SNAPSHOT: ResponsiveState = {
  breakpoint: 'desktop',
  isPhone: false,
  isTablet: false,
  isDesktop: true,
  isCompactLandscape: false,
  isLandscape: true,
  isTouch: false,
  prefersReducedMotion: false,
  width: 1024,
  height: 768,
};

export function useResponsive(): ResponsiveState {
  return useSyncExternalStore(subscribe, computeSnapshot, () => SERVER_SNAPSHOT);
}

/** Test hook: drop the memoized snapshot after changing the fake viewport. */
export function __resetResponsiveCache(): void {
  cached = null;
}

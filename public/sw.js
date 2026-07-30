/* eslint-env serviceworker */
// ============================================================================
// SERVICE WORKER
//
// `index.html` has advertised "Works offline" since before there was anything
// making it true. IndexedDB kept a coach's DRILLS on the device, but a cold
// reload with no network could not fetch the application itself, so the claim
// was false in exactly the situation it mattered - an arena with no signal.
//
// Hand-written rather than generated, and deliberately so:
//
//   - Vite already emits a build manifest listing every chunk and stylesheet
//     it produced. Reading that at install time is a real precache list with
//     no plugin in the pipeline.
//   - A worker CANNOT intercept the requests that loaded the page which
//     registered it. Relying on runtime caching alone therefore leaves the
//     entry bundle uncached after a first visit, and the next cold start with
//     no network has nothing to boot from. This is the trap this file exists
//     to avoid, and it is invisible until you actually pull the plug.
//   - Every filename contains a content hash, so a cached asset can be kept
//     forever: a new build asks for new names. Only the HTML entry point is
//     unhashed, so it is the one file fetched network-first.
//
// The trade is honest and worth stating: the first visit must succeed online.
// A coach who opens the app once at home has it at the rink; one who first
// opens it in the car park with no signal does not.
// ============================================================================

// Dev-server fallback only. `npm run build` rewrites this literal to a hash
// of the build manifest (scripts/stamp-sw.mjs) so the worker's bytes — and
// therefore its install/precache step — change whenever the built assets do.
const VERSION = 'v1';
const SHELL_CACHE = `phicecraft-shell-${VERSION}`;
const ASSET_CACHE = `phicecraft-assets-${VERSION}`;

/** Enough to boot with no network at all. */
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/hockey-icon.svg'];

/**
 * Where Vite writes the list of everything it built.
 *
 * Two paths because Vite moved it: newer versions emit `.vite/manifest.json`,
 * older ones put it at the root. Trying both means an upgrade does not
 * silently turn offline support off.
 */
const BUILD_MANIFESTS = ['/.vite/manifest.json', '/manifest.json'];

/**
 * Every file this build produced: entry chunks, lazy chunks and stylesheets.
 *
 * Lazy chunks matter as much as the entry: without them a coach in an arena
 * gets the rink but not the drill library, which is worse than an honest
 * failure because half the product silently disappears.
 */
async function buildAssets() {
  for (const path of BUILD_MANIFESTS) {
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) continue;
      const manifest = await response.json();
      // The web app manifest lives at a similar path and is not this; it has
      // no chunk entries, so it yields nothing and the next path is tried.
      const urls = new Set();
      for (const entry of Object.values(manifest)) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.file) urls.add(`/${entry.file}`);
        for (const css of entry.css ?? []) urls.add(`/${css}`);
        for (const asset of entry.assets ?? []) urls.add(`/${asset}`);
      }
      if (urls.size > 0) return [...urls];
    } catch {
      /* try the next path */
    }
  }
  return [];
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // Individually, so one missing file cannot fail the whole install and
      // leave the app with no worker at all.
      await Promise.allSettled(SHELL.map(url => shell.add(url)));

      const assets = await caches.open(ASSET_CACHE);
      const files = await buildAssets();
      await Promise.allSettled(files.map(url => assets.add(url)));

      // No skipWaiting() here. VERSION changes on every deploy, so an
      // installed worker is almost always superseding one already controlling
      // open tabs; auto-activating would reload the app under a coach
      // mid-drill, which is exactly what updateManager.ts's consent contract
      // ("the update is never applied silently") forbids. The page asks for
      // this explicitly via the SKIP_WAITING message handler below. A first
      // install has no prior worker to wait behind, so it activates on its
      // own regardless.
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(name => name.startsWith('phicecraft-') && !name.endsWith(VERSION))
          .map(name => caches.delete(name))
      );
      // Control pages that were already open, so an update does not need two
      // reloads to take effect.
      await self.clients.claim();
    })()
  );
});

/** The page asks for this when the coach accepts an update. */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/hockey-icon');
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a coach with signal always gets the current
  // build, and the cached shell is there when they do not.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', response.clone());
          return response;
        } catch {
          const cached = await caches.match('/index.html');
          return cached ?? Response.error();
        }
      })()
    );
    return;
  }

  // Hashed build output: cache first and keep it. A new build requests new
  // filenames, so there is nothing to go stale.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        // Matched by URL, not by Request, and with `ignoreVary`. A dynamic
        // `import()` carries different headers from the plain `fetch()` that
        // filled the cache, and matching on the Request made those lookups
        // miss - so the app booted offline but every lazily-loaded screen
        // died. The symptom is baffling: `caches.match(url)` says yes and
        // `fetch()` says 200 while `import()` says it could not be fetched.
        const cached = await caches.match(url.href, { ignoreVary: true });
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(url.href, response.clone());
        }
        return response;
      })()
    );
  }
});

// ============================================================================
// CRASH REPORTER
//
// PHormation is local-first: a crash on a coach's phone used to leave no
// trace anywhere but that phone's console. This sends a short report to the
// app's own `/api/report` endpoint (api/report.mjs), which writes it to the
// hosting logs - no third-party service, no account.
//
// What a report holds, and deliberately nothing else:
//   - the error message and stack (trimmed),
//   - where it came from (uncaught error, rejected promise, React crash),
//   - the page path WITHOUT the query or hash (a shared play lives in the
//     hash), the build, the browser string, screen size and renderer.
// Never the drill, player names, roster or anything a coach typed.
//
// Only in production builds, never under automation, at most a handful per
// session and each distinct error once.
// ============================================================================

export type CrashSource = 'error' | 'rejection' | 'boundary';

export interface CrashReport {
  message: string;
  stack: string;
  source: CrashSource;
  path: string;
  build: string;
  userAgent: string;
  viewport: string;
  renderer: string;
  at: string;
}

const ENDPOINT = '/api/report';
const MAX_PER_SESSION = 5;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
}

/** Strips query strings and fragments from any URL inside a stack trace. */
function scrubUrls(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1');
}

function buildId(): string {
  try {
    return new URL(import.meta.url).pathname.split('/').pop() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function buildCrashReport(error: unknown, source: CrashSource, now: Date = new Date()): CrashReport {
  const { message, stack } = describe(error);
  const w = typeof window === 'undefined' ? undefined : window;
  return {
    message: scrubUrls(message).slice(0, MAX_MESSAGE),
    stack: scrubUrls(stack).slice(0, MAX_STACK),
    source,
    path: w?.location.pathname ?? '',
    build: buildId(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 300),
    viewport: w ? `${w.innerWidth}x${w.innerHeight}@${w.devicePixelRatio || 1}` : '',
    renderer: (w as { __phicecraftPaint?: { kind?: string } } | undefined)?.__phicecraftPaint?.kind ?? 'unknown',
    at: now.toISOString(),
  };
}

export interface CrashReporterOptions {
  enabled: boolean;
  send?: (report: CrashReport) => void;
}

function defaultSend(report: CrashReport): void {
  const body = JSON.stringify(report);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch {
    /* reporting must never itself throw */
  }
}

let active: { options: Required<CrashReporterOptions>; seen: Set<string>; sent: number } | null = null;

/** Reports one error, if the reporter is installed and enabled. Safe to call anywhere. */
export function reportCrash(error: unknown, source: CrashSource): void {
  if (!active || !active.options.enabled) return;
  if (active.sent >= MAX_PER_SESSION) return;
  const report = buildCrashReport(error, source);
  const key = `${report.message}|${report.stack.slice(0, 300)}`;
  if (active.seen.has(key)) return;
  active.seen.add(key);
  active.sent += 1;
  active.options.send(report);
}

/** Installs the global listeners once. Returns an uninstall function (for tests). */
export function installCrashReporter(options: CrashReporterOptions): () => void {
  const automated = typeof navigator !== 'undefined' && navigator.webdriver;
  active = {
    options: { enabled: options.enabled && !automated, send: options.send ?? defaultSend },
    seen: new Set(),
    sent: 0,
  };
  const onError = (event: ErrorEvent) => reportCrash(event.error ?? event.message, 'error');
  const onRejection = (event: PromiseRejectionEvent) => reportCrash(event.reason, 'rejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    active = null;
  };
}

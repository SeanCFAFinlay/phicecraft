import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCrashReport, installCrashReporter, reportCrash, type CrashReport } from './crashReporter';
// The endpoint is plain JS for Vercel; its sanitiser is tested here too.
// @ts-expect-error - untyped .mjs module outside src
import { sanitizeReport } from '../../api/report.mjs';

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
  window.history.replaceState(null, '', '/');
});

describe('buildCrashReport', () => {
  it('keeps the error, never the shared play in the address', () => {
    window.history.replaceState(null, '', '/editor?x=1#play=SECRETPLAYDATA');
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at draw (https://phicecraft.vercel.app/assets/index.js?v=2#play=SECRET:1:2)';
    const report = buildCrashReport(error, 'boundary', new Date('2026-11-24T00:00:00Z'));
    expect(report.message).toBe('boom');
    expect(report.source).toBe('boundary');
    expect(report.path).toBe('/editor');
    expect(JSON.stringify(report)).not.toContain('SECRET');
    expect(report.stack).toContain('https://phicecraft.vercel.app/assets/index.js');
    expect(report.at).toBe('2026-11-24T00:00:00.000Z');
  });

  it('describes non-Error rejections and trims long messages', () => {
    expect(buildCrashReport('plain text', 'rejection').message).toBe('plain text');
    expect(buildCrashReport({ code: 7 }, 'rejection').message).toBe('{"code":7}');
    expect(buildCrashReport(new Error('x'.repeat(2000)), 'error').message).toHaveLength(500);
  });
});

describe('reportCrash', () => {
  it('sends each distinct error once and at most five a session', () => {
    const sent: CrashReport[] = [];
    uninstall = installCrashReporter({ enabled: true, send: report => sent.push(report) });
    const same = new Error('same');
    reportCrash(same, 'error');
    reportCrash(same, 'error');
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 10; i++) reportCrash(new Error(`e${i}`), 'error');
    expect(sent).toHaveLength(5);
  });

  it('does nothing when disabled', () => {
    const send = vi.fn();
    uninstall = installCrashReporter({ enabled: false, send });
    reportCrash(new Error('x'), 'error');
    expect(send).not.toHaveBeenCalled();
  });

  it('catches unhandled promise rejections', () => {
    const sent: CrashReport[] = [];
    uninstall = installCrashReporter({ enabled: true, send: report => sent.push(report) });
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new Error('lost promise') });
    window.dispatchEvent(event);
    expect(sent[0]?.message).toBe('lost promise');
    expect(sent[0]?.source).toBe('rejection');
  });
});

describe('api/report sanitizeReport', () => {
  it('keeps only known fields, as trimmed strings', () => {
    const clean = sanitizeReport({ message: 'm'.repeat(900), stack: 's', extra: 'dropped', path: 42 });
    expect(clean.message).toHaveLength(500);
    expect(clean.path).toBe('');
    expect('extra' in clean).toBe(false);
  });

  it('rejects a report with no message', () => {
    expect(sanitizeReport({ stack: 'x' })).toBeNull();
    expect(sanitizeReport(null)).toBeNull();
  });
});

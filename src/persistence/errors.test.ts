// ============================================================================
// PERSISTENCE ERRORS - classification and user-facing copy
//
// These matter because the recovery action differs per code: a quota failure
// means "export then free space", a transaction failure means "retry", and an
// unavailable store means "this browser cannot save at all".
// ============================================================================

import { describe, it, expect } from 'vitest';
import { classifyThrown, describePersistenceError, persistenceError, ok, err } from './types';

describe('ok / err', () => {
  it('wrap values and errors', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});

describe('persistenceError', () => {
  it.each([
    ['quota-exceeded', true],
    ['transaction-failed', true],
    ['unknown', true],
    ['unavailable', false],
    ['not-found', false],
    ['corrupt-data', false],
    ['validation-failed', false],
  ] as const)('marks %s recoverable=%s', (code, recoverable) => {
    expect(persistenceError(code, 'save', 'x').recoverable).toBe(recoverable);
  });
});

describe('classifyThrown', () => {
  it('recognises a quota error by name', () => {
    const error = classifyThrown('save', { name: 'QuotaExceededError', message: 'no space' }, 'fallback');
    expect(error.code).toBe('quota-exceeded');
    expect(error.recoverable).toBe(true);
  });

  it('recognises a quota error by message when the name is missing', () => {
    const error = classifyThrown('save', new Error('Storage quota reached'), 'fallback');
    expect(error.code).toBe('quota-exceeded');
  });

  it.each(['AbortError', 'TransactionInactiveError', 'InvalidStateError'])(
    'maps %s to transaction-failed',
    name => {
      expect(classifyThrown('save', { name, message: 'x' }, 'fallback').code).toBe('transaction-failed');
    }
  );

  it.each(['DataError', 'DataCloneError', 'SyntaxError'])('maps %s to corrupt-data', name => {
    expect(classifyThrown('read', { name, message: 'x' }, 'fallback').code).toBe('corrupt-data');
  });

  it('falls back to unknown, using the fallback message for a bare throw', () => {
    const error = classifyThrown('read', null, 'could not read');
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('could not read');
  });

  it('keeps the original cause for diagnostics', () => {
    const cause = new Error('root cause');
    expect(classifyThrown('save', cause, 'fallback').cause).toBe(cause);
  });
});

describe('describePersistenceError', () => {
  it.each([
    ['unavailable', 'Export your work'],
    ['quota-exceeded', 'Device storage is full'],
    ['transaction-failed', 'previous version is intact'],
    ['not-found', 'no longer in storage'],
    ['corrupt-data', 'kept for recovery'],
    ['validation-failed', 'did not pass validation'],
  ] as const)('explains %s in terms of what the user should do', (code, fragment) => {
    expect(describePersistenceError(persistenceError(code, 'save', 'raw'))).toContain(fragment);
  });

  it('falls back to the raw message for an unknown code', () => {
    expect(describePersistenceError(persistenceError('unknown', 'save', 'raw detail'))).toBe('raw detail');
  });

  it('has a sentence even when the raw message is empty', () => {
    expect(describePersistenceError(persistenceError('unknown', 'save', ''))).toBe(
      'Something went wrong talking to storage.'
    );
  });
});

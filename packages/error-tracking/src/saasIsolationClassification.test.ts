import { describe, expect, it } from 'vitest';
import {
  SAAS_ISOLATION_EVENT_CLASSES,
  classifySaasIsolationFailure,
  isRecognizedSaasIsolationFailure,
} from './saasIsolationClassification.js';

describe('saas isolation failure classification', () => {
  it('names the wall that failed', () => {
    expect(classifySaasIsolationFailure(new Error('DB principal context is required'))).toBe(
      'missing_principal',
    );
    expect(
      classifySaasIsolationFailure(new Error('app.install_signed_context rejected the signature')),
    ).toBe('invalid_signature_or_install');
    expect(
      classifySaasIsolationFailure(
        Object.assign(new Error('permission denied for table media_files'), { code: '42501' }),
      ),
    ).toBe('role_pool_mismatch');
    expect(
      classifySaasIsolationFailure(
        Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }),
      ),
    ).toBe('rls_denial');
    expect(classifySaasIsolationFailure(new Error('app.release_principal_context failed'))).toBe(
      'cleanup_failure',
    );
  });

  it('turns an unrecognized isolation failure into an accepted class, never into nothing', () => {
    const unknownDenial = Object.assign(new Error('denied by an unnamed guard'), { code: '42501' });

    expect(isRecognizedSaasIsolationFailure(unknownDenial)).toBe(true);
    expect(classifySaasIsolationFailure(unknownDenial)).toBe('unclassified_background_operation');
    expect(SAAS_ISOLATION_EVENT_CLASSES).toContain(classifySaasIsolationFailure(unknownDenial));
  });

  it('leaves ordinary product and transport failures outside the isolation surface', () => {
    for (const error of [
      new Error('S3 request timed out'),
      new Error('ffmpeg exited with code 1'),
      undefined,
      null,
      42,
    ]) {
      expect(isRecognizedSaasIsolationFailure(error)).toBe(false);
    }
  });

  it('classifies every input into the closed vocabulary the DB writer accepts', () => {
    for (const error of [new Error('anything'), 'a bare string', {}, null]) {
      expect(SAAS_ISOLATION_EVENT_CLASSES).toContain(classifySaasIsolationFailure(error));
    }
  });
});

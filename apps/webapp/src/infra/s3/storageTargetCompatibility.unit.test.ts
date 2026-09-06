import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS: an environment which has not enabled the patient store silently creates a second
 * S3 client for patient-target operations, or a query which forgot to select `storage_target`
 * gets a bucket substituted for it instead of an error.
 * CONSEQUENCE: the supposedly dormant rollout changes connection pooling, or — the case the owner
 * ruled out on 06.09.2026 — patient bytes land in the exercise library because one code path
 * forgot to name the store: «если для файлов пациентов мы забудем подставить назначение в
 * каком-то куске кода, они загрузятся в библиотеку. А это неправильно».
 * ORACLE: that owner ruling, plus the dormancy guarantee that an unset `PATIENT_S3_BUCKET`
 * preserves the same bucket, client, and calls.
 * This public S3 boundary is the cheapest layer which observes both guarantees.
 */
vi.mock('@/config/env', () => ({
  env: {
    S3_ENDPOINT: 'https://storage.example',
    S3_ACCESS_KEY: 'library-access',
    S3_SECRET_KEY: 'library-secret',
    S3_PRIVATE_BUCKET: 'library-bucket',
    S3_REGION: 'region-1',
    S3_FORCE_PATH_STYLE: false,
    PATIENT_S3_ENDPOINT: '',
    PATIENT_S3_ACCESS_KEY: '',
    PATIENT_S3_SECRET_KEY: '',
    PATIENT_S3_BUCKET: '',
    PATIENT_S3_REGION: '',
    PATIENT_S3_FORCE_PATH_STYLE: false,
  },
}));

const { getS3Client, parseStorageTarget, storageBucketFor } = await import('./client');

describe('storage split compatibility while the patient store is dormant', () => {
  it('uses the exact same bucket and client object for both targets', () => {
    expect(storageBucketFor('patient')).toBe(storageBucketFor('library'));
    expect(getS3Client('patient')).toBe(getS3Client('library'));
  });

  it.each([undefined, null, '', 'unknown'])(
    'refuses to guess a store when the row does not name one: %j',
    (storedTarget) => {
      expect(() => parseStorageTarget(storedTarget)).toThrow(/storage_target_missing_on_row/u);
    },
  );

  it.each(['library', 'patient'] as const)('accepts the stored store verbatim: %s', (stored) => {
    expect(parseStorageTarget(stored)).toBe(stored);
  });
});

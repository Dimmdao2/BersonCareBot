import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS: an environment which has not enabled the patient store silently creates a second
 * S3 client for patient-target operations, or sends an old/unknown row to the patient bucket.
 * CONSEQUENCE: the supposedly dormant rollout changes connection pooling/calls, or old library
 * objects become unreadable because the application looks for them in the new encrypted bucket.
 * ORACLE: owner rulings in the patient-media-storage audit brief: an absent target is `library`,
 * and an unset `PATIENT_S3_BUCKET` must preserve the same bucket, client, and calls.
 * This public S3 boundary is the cheapest layer which observes both compatibility guarantees.
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

  it.each([undefined, null, '', 'unknown', 'library'])(
    'keeps a legacy/unknown row in the library store: %j',
    (storedTarget) => {
      expect(parseStorageTarget(storedTarget)).toBe('library');
    },
  );
});

import { describe, expect, it } from 'vitest';

import { assertNoLegacyMediaDatabaseCredentials, loadMediaWorkerEnv } from './env.js';

describe('media-worker database door', () => {
  it('rejects any raw legacy PostgreSQL credential even with valid control fields', () => {
    expect(() =>
      assertNoLegacyMediaDatabaseCredentials({
        MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
        INTERNAL_JOB_SECRET: 'control-secret',
        DATABASE_URL: '',
      }),
    ).toThrow('DATABASE_URL');
    expect(() =>
      assertNoLegacyMediaDatabaseCredentials({ MEDIA_WORKER_DATABASE_KEY: 'legacy-key' }),
    ).toThrow('MEDIA_WORKER_DATABASE_KEY');
    expect(() => assertNoLegacyMediaDatabaseCredentials({ MEDIA_WORKER_CERT: 'legacy-cert' })).toThrow(
      'MEDIA_WORKER_CERT',
    );
  });

  it('accepts control-only worker configuration', () => {
    expect(() =>
      assertNoLegacyMediaDatabaseCredentials({
        MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
        INTERNAL_JOB_SECRET: 'control-secret',
      }),
    ).not.toThrow();
  });

  it('rejects a legacy DB URL during media-worker startup', () => {
    const original = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
      INTERNAL_JOB_SECRET: 'control-secret',
      S3_ENDPOINT: 'http://s3.test',
      S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret',
      S3_PRIVATE_BUCKET: 'private',
      DATABASE_URL: 'postgresql://legacy:secret@127.0.0.1:5432/test',
    });
    try {
      expect(() => loadMediaWorkerEnv()).toThrow('DATABASE_URL');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in original)) delete process.env[key];
      }
      Object.assign(process.env, original);
    }
  });

  it('starts with the exact control-only contract', () => {
    const original = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
      INTERNAL_JOB_SECRET: 'control-secret',
      S3_ENDPOINT: 'http://s3.test',
      S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret',
      S3_PRIVATE_BUCKET: 'private',
    });
    delete process.env.DATABASE_URL;
    try {
      expect(loadMediaWorkerEnv().MEDIA_WORKER_CONTROL_URL).toBe('http://127.0.0.1:6200');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in original)) delete process.env[key];
      }
      Object.assign(process.env, original);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { assertNoLegacyMediaDatabaseCredentials, loadMediaWorkerEnv } from './env.js';

describe('media-worker database door', () => {
  it('rejects any raw legacy PostgreSQL credential even with valid control fields', () => {
    for (const key of [
      'DATABASE_URL',
      'DB_PRINCIPAL_CONTEXT_MODE',
      'DB_PRINCIPAL_SIGNING_SECRET',
      'PGSSLMODE',
      'PGSSLCRL',
      'PGSSLCRLDIR',
      'PGSSLMINPROTOCOLVERSION',
      'MEDIA_WORKER_DATABASE_KEY',
      'MEDIA_WORKER_CERT',
      'MEDIA_WORKER_CA',
      'MEDIA_DATABASE_CA',
      'MEDIA_POSTGRESQL_URL',
    ]) {
      expect(() => assertNoLegacyMediaDatabaseCredentials({ [key]: '' }), key).toThrow(key);
    }
  });

  it('accepts control-only worker configuration', () => {
    expect(() =>
      assertNoLegacyMediaDatabaseCredentials({
        MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
        MEDIA_WORKER_CONTROL_TIMEOUT_MS: '5000',
        MEDIA_WORKER_LOCK_ID: 'worker-1',
        INTERNAL_JOB_SECRET: 'control-secret',
      }),
    ).not.toThrow();
  });

  it('rejects a legacy DB URL during media-worker startup', () => {
    const original = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
      MEDIA_WORKER_CONTROL_TIMEOUT_MS: '5000',
      MEDIA_WORKER_LOCK_ID: 'worker-1',
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
      MEDIA_WORKER_CONTROL_TIMEOUT_MS: '5000',
      MEDIA_WORKER_LOCK_ID: 'worker-1',
      INTERNAL_JOB_SECRET: 'control-secret',
      S3_ENDPOINT: 'http://s3.test',
      S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret',
      S3_PRIVATE_BUCKET: 'private',
    });
    delete process.env.DATABASE_URL;
    try {
      expect(loadMediaWorkerEnv()).toMatchObject({
        MEDIA_WORKER_CONTROL_URL: 'http://127.0.0.1:6200',
        MEDIA_WORKER_CONTROL_TIMEOUT_MS: 5000,
        lockId: 'worker-1',
      });
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in original)) delete process.env[key];
      }
      Object.assign(process.env, original);
    }
  });

  it('rejects a non-HTTP control endpoint', () => {
    const original = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      MEDIA_WORKER_CONTROL_URL: 'file:///tmp/not-a-control-port',
      INTERNAL_JOB_SECRET: 'control-secret',
      S3_ENDPOINT: 'http://s3.test',
      S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret',
      S3_PRIVATE_BUCKET: 'private',
    });
    delete process.env.DATABASE_URL;
    try {
      expect(() => loadMediaWorkerEnv()).toThrow('MEDIA_WORKER_CONTROL_URL must use HTTP or HTTPS');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in original)) delete process.env[key];
      }
      Object.assign(process.env, original);
    }
  });
});

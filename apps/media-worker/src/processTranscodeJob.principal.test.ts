import type { S3Client } from '@aws-sdk/client-s3';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedJob } from './jobs/claim.js';
import type { Logger } from './logger.js';
import { processTranscodeJob, type TranscodeContext } from './processTranscodeJob.js';
import { runWithMediaWorkerInfraPrincipal } from './runMediaWorkerSql.js';

describe('processTranscodeJob principal scope', () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  afterEach(() => {
    if (originalDbPrincipalContextMode === undefined) {
      delete process.env.DB_PRINCIPAL_CONTEXT_MODE;
    } else {
      process.env.DB_PRINCIPAL_CONTEXT_MODE = originalDbPrincipalContextMode;
    }
    if (originalDbPrincipalSigningSecret === undefined) {
      delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    } else {
      process.env.DB_PRINCIPAL_SIGNING_SECRET = originalDbPrincipalSigningSecret;
    }
    vi.restoreAllMocks();
  });

  it('runs DB access under the tick infra principal', async () => {
    const principals: Array<ReturnType<typeof getCurrentDbPrincipal>> = [];
    const query = vi.fn(async (text: string, _values?: readonly unknown[]) => {
      principals.push(getCurrentDbPrincipal());
      if (text.includes('FROM public.media_files')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });
    const release = vi.fn();
    const pool = { query, connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
    const ctx: TranscodeContext = {
      pool,
      s3Client: {} as S3Client,
      bucket: 'private',
      ffmpegBin: 'ffmpeg',
      ffmpegTimeoutMs: 60_000,
      maxAttempts: 3,
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger,
    };
    const job: ClaimedJob = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      mediaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      attempts: 1,
    };

    await runWithMediaWorkerInfraPrincipal('media-worker:tick', () =>
      processTranscodeJob(ctx, job),
    );

    expect(principals.length).toBeGreaterThan(0);
    expect(
      principals.every(
        (principal) =>
          principal?.kind === 'infra' &&
          principal.source === 'media-worker:tick' &&
          !('organizationId' in principal),
      ),
    ).toBe(true);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });
});

/**
 * Fast unit coverage for `collectPurgeArtifactKeys`'s `patient_files` handling (UZ3 backlog #987,
 * item 15) -- mocks the SQL boundary instead of a live Postgres so it runs in the default suite.
 * Real-Postgres proof of the same behavior lives in
 * the named-DEV full-purge flow.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';

const { runPurgeClientSql } = vi.hoisted(() => ({
  runPurgeClientSql: vi.fn(),
}));

vi.mock('@/infra/platformUserPurgeSql', () => ({
  runPurgeClientSql,
  runPurgePoolSql: vi.fn(),
}));

import { collectPurgeArtifactKeys } from './platformUserFullPurge';

const fakeClient = {} as PoolClient;
const USER_ID = '11111111-1111-4111-8111-111111111111';

function mockRows(queryText: string): { rows: unknown[] } {
  if (queryText.includes('online_intake_attachments')) {
    return { rows: [] };
  }
  if (queryText.includes('FROM media_files')) {
    return {
      rows: [{ id: 'existing-media-id', s3_key: 'media/existing.mp4', storage_target: 'library' }],
    };
  }
  if (queryText.includes('FROM patient_files')) {
    return {
      rows: [
        { s3_key: 'patient-files/a/result.pdf', media_file_id: null, storage_target: 'patient' },
        {
          s3_key: 'patient-files/b/scan.webp',
          media_file_id: 'linked-media-id',
          storage_target: 'patient',
        },
      ],
    };
  }
  throw new Error(`unexpected query in test: ${queryText}`);
}

describe('collectPurgeArtifactKeys — patient_files', () => {
  it('collects patient_files s3 keys and folds media-linked ones into mediaFiles', async () => {
    runPurgeClientSql.mockImplementation((_client: PoolClient, fragment: SQL) =>
      Promise.resolve(mockRows(drizzleSqlFragmentToPgQuery(fragment).sql)),
    );

    const artifact = await collectPurgeArtifactKeys(fakeClient, USER_ID);

    expect(artifact.patientFiles).toEqual([
      { s3Key: 'patient-files/a/result.pdf', storageTarget: 'patient' },
      { s3Key: 'patient-files/b/scan.webp', storageTarget: 'patient' },
    ]);
    // The row already present from the plain media_files/uploaded_by query is kept once...
    expect(artifact.mediaFiles).toContainEqual({
      id: 'existing-media-id',
      s3Key: 'media/existing.mp4',
      storageTarget: 'library',
    });
    // ...and the patient-file-linked row (owned by the uploader, not the patient) is folded in too.
    expect(artifact.mediaFiles).toContainEqual({
      id: 'linked-media-id',
      s3Key: 'patient-files/b/scan.webp',
      storageTarget: 'patient',
    });
    expect(artifact.mediaFiles).toHaveLength(2);
  });

  it('does not duplicate a media row already collected by the uploaded_by query', async () => {
    runPurgeClientSql.mockImplementation((_client: PoolClient, fragment: SQL) => {
      const queryText = drizzleSqlFragmentToPgQuery(fragment).sql;
      if (queryText.includes('online_intake_attachments')) return Promise.resolve({ rows: [] });
      if (queryText.includes('FROM media_files')) {
        return Promise.resolve({
          rows: [
            { id: 'shared-id', s3_key: 'patient-files/x/f.pdf', storage_target: 'patient' },
          ],
        });
      }
      if (queryText.includes('FROM patient_files')) {
        return Promise.resolve({
          rows: [
            {
              s3_key: 'patient-files/x/f.pdf',
              media_file_id: 'shared-id',
              storage_target: 'patient',
            },
          ],
        });
      }
      throw new Error(`unexpected query: ${queryText}`);
    });

    const artifact = await collectPurgeArtifactKeys(fakeClient, USER_ID);

    expect(artifact.mediaFiles).toEqual([
      { id: 'shared-id', s3Key: 'patient-files/x/f.pdf', storageTarget: 'patient' },
    ]);
    expect(artifact.patientFiles).toEqual([
      { s3Key: 'patient-files/x/f.pdf', storageTarget: 'patient' },
    ]);
  });
});

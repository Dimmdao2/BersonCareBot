/**
 * `patient_files` coverage for the strict purge artifact collector (UZ3 backlog #987, item 15).
 * `patient_files` cascade-deletes with `platform_users`, so its S3 object must be captured
 * *before* that DELETE runs -- `collectPurgeArtifactKeys` did not do this until now.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { startPoolTransaction } from '@/infra/db/withClient';
import { collectPurgeArtifactKeys, runWebappPurgeCoreInTransaction } from './platformUserFullPurge';

let patientId: string;
let doctorId: string;
let organizationId: string;

async function insertPlatformUser(displayName: string): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
    [displayName],
  );
  return res.rows[0]!.id;
}

describe('collectPurgeArtifactKeys — patient_files (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE patient_files DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE media_files DISABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY');
    } finally {
      client.release();
    }
    const org = await getPool().query<{ id: string }>(
      `INSERT INTO be_organizations (title) VALUES ('purge fixture org') RETURNING id`,
    );
    organizationId = org.rows[0]!.id;
  });

  beforeEach(async () => {
    patientId = await insertPlatformUser('purge fixture patient');
    doctorId = await insertPlatformUser('purge fixture doctor');
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('collects the s3 key of a standalone patient file (no media library link)', async () => {
    await getPool().query(
      `INSERT INTO patient_files
         (patient_user_id, category, file_name, s3_key, s3_bucket, mime_type, size_bytes, uploaded_by_user_id, organization_id)
       VALUES ($1, 'анализ', 'result.pdf', $2, 'private', 'application/pdf', 4096, $3, $4)`,
      [patientId, `patient-files/${patientId}/result.pdf`, doctorId, organizationId],
    );

    const tx = await startPoolTransaction(getPool());
    try {
      const artifact = await collectPurgeArtifactKeys(tx.client, patientId);
      expect(artifact.patientFileS3Keys).toEqual([`patient-files/${patientId}/result.pdf`]);
      expect(artifact.mediaFiles).toEqual([]);
      await tx.rollback();
    } finally {
      await tx.release();
    }
  });

  it('folds a media-library-linked patient file into mediaFiles even when the doctor uploaded it', async () => {
    const media = await getPool().query<{ id: string }>(
      `INSERT INTO media_files (original_name, stored_path, mime_type, size_bytes, uploaded_by, s3_key, organization_id, status)
       VALUES ('scan.webp', $1, 'image/webp', 2048, $2, $1, $3, 'ready')
       RETURNING id`,
      [`patient-files/${patientId}/scan.webp`, doctorId, organizationId],
    );
    const mediaFileId = media.rows[0]!.id;

    await getPool().query(
      `INSERT INTO patient_files
         (patient_user_id, category, file_name, s3_key, s3_bucket, mime_type, size_bytes, uploaded_by_user_id, organization_id, media_file_id)
       VALUES ($1, 'снимок', 'scan.webp', $2, 'private', 'image/webp', 2048, $3, $4, $5)`,
      [patientId, `patient-files/${patientId}/scan.webp`, doctorId, organizationId, mediaFileId],
    );

    const tx = await startPoolTransaction(getPool());
    try {
      const artifact = await collectPurgeArtifactKeys(tx.client, patientId);
      // uploaded_by = doctorId, not the purged patient -- the plain media_files query alone would miss it.
      expect(artifact.mediaFiles).toEqual([
        { id: mediaFileId, s3Key: `patient-files/${patientId}/scan.webp` },
      ]);
      expect(artifact.patientFileS3Keys).toEqual([`patient-files/${patientId}/scan.webp`]);
      await tx.rollback();
    } finally {
      await tx.release();
    }
  });

  it('the row disappears via cascade once the webapp purge core runs -- proving collection must happen first', async () => {
    await getPool().query(
      `INSERT INTO patient_files
         (patient_user_id, category, file_name, s3_key, s3_bucket, mime_type, size_bytes, uploaded_by_user_id, organization_id)
       VALUES ($1, 'анализ', 'result.pdf', $2, 'private', 'application/pdf', 4096, $3, $4)`,
      [patientId, `patient-files/${patientId}/result.pdf`, doctorId, organizationId],
    );

    const tx = await startPoolTransaction(getPool());
    try {
      const artifact = await collectPurgeArtifactKeys(tx.client, patientId);
      expect(artifact.patientFileS3Keys.length).toBe(1);
      await runWebappPurgeCoreInTransaction(tx.client, {
        id: patientId,
        phone_normalized: null,
        integrator_user_id: null,
        role: 'client',
      });
      const remaining = await tx.client.query('SELECT 1 FROM patient_files WHERE patient_user_id = $1', [
        patientId,
      ]);
      expect(remaining.rowCount).toBe(0);
      await tx.rollback();
    } finally {
      await tx.release();
    }
  });
});

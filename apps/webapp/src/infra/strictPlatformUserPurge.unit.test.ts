/**
 * WHAT BREAKS: account deletion reports success while private artifacts remain, or its audit row
 * republishes the deleted person's UUID/phone/object identifiers/provider error.
 * CONSEQUENCE: operators stop retrying a failed privacy cleanup, or the post-purge journal becomes
 * a new store of the identity it was meant to release.
 * ORACLE: the final Track D owner decisions in
 * `SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` (28.08 final-check section).
 * The exported strict-purge boundary is the cheapest layer that observes both external cleanup and
 * the persisted audit side effect; DB-core behavior remains in its existing rollback-only proof.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const MEDIA_ID = '33333333-3333-4333-8333-333333333333';
const PHONE = '+79991234567';
const INTAKE_KEY = 'private/intake/raw-document.pdf';
const MEDIA_KEY = 'private/media/raw-video.mp4';
const PATIENT_FILE_KEY = 'private/patient/raw-result.pdf';

const fakes = vi.hoisted(() => ({
  s3Enabled: false,
  writeAuditLog: vi.fn(async () => undefined),
  runPgPoolSql: vi.fn(),
  startPoolTransaction: vi.fn(),
  advisoryLock: vi.fn(async () => undefined),
  collectArtifactKeys: vi.fn(),
  runPurgeCore: vi.fn(async () => undefined),
  deleteS3Objects: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: {},
  isS3MediaEnabled: () => fakes.s3Enabled,
}));
vi.mock('@/infra/adminAuditLog', () => ({ writeAuditLog: fakes.writeAuditLog }));
vi.mock('@/infra/db/client', () => ({ getPool: () => ({}) as Pool }));
vi.mock('@/infra/db/withClient', () => ({ startPoolTransaction: fakes.startPoolTransaction }));
vi.mock('@/infra/db/runWebappSql', () => ({ runPgPoolSql: fakes.runPgPoolSql }));
vi.mock('@/infra/db/pgAdvisoryLock', () => ({ pgAdvisoryXactLock: fakes.advisoryLock }));
vi.mock('@/infra/platformUserFullPurge', () => ({
  isPlatformUserUuid: (value: string) => /^[0-9a-f-]{36}$/iu.test(value),
  collectPurgeArtifactKeys: fakes.collectArtifactKeys,
  runWebappPurgeCoreInTransaction: fakes.runPurgeCore,
}));
vi.mock('@/infra/s3/client', () => ({
  deleteS3ObjectsWithPerKeyResults: fakes.deleteS3Objects,
}));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { runStrictPurgePlatformUser } from './strictPlatformUserPurge';

const client = {} as PoolClient;

function auditPayload(): Record<string, unknown> {
  const calls = fakes.writeAuditLog.mock.calls as unknown as [Pool, Record<string, unknown>][];
  const call = calls.at(-1)?.[1];
  if (!call || typeof call !== 'object') throw new Error('purge audit was not written');
  return call as Record<string, unknown>;
}

describe('strict account purge external cleanup contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.s3Enabled = false;
    fakes.runPgPoolSql.mockResolvedValue({
      rows: [{ id: USER_ID, phone_normalized: PHONE, role: 'client' }],
      rowCount: 1,
    });
    fakes.startPoolTransaction.mockResolvedValue({
      client,
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    });
    fakes.collectArtifactKeys.mockResolvedValue({
      intakeS3Keys: [INTAKE_KEY],
      mediaFiles: [{ id: MEDIA_ID, s3Key: MEDIA_KEY }],
      patientFileS3Keys: [PATIENT_FILE_KEY],
    });
    fakes.deleteS3Objects.mockResolvedValue([
      { ok: true, key: INTAKE_KEY },
      { ok: true, key: MEDIA_KEY },
      { ok: true, key: PATIENT_FILE_KEY },
    ]);
  });

  it('fails closed when artifacts exist but S3 is disabled and writes only de-identified audit facts', async () => {
    const result = await runStrictPurgePlatformUser({
      targetId: USER_ID,
      actorId: ACTOR_ID,
      audit: { enabled: true },
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'partial_failed',
      details: { intakeS3ObjectsNotDeletedBucketDisabled: true },
    });
    expect(fakes.deleteS3Objects).not.toHaveBeenCalled();

    const audit = auditPayload();
    expect(audit).toMatchObject({
      action: 'user_purge',
      status: 'partial_failure',
      details: {
        outcome: 'partial_failed',
        failureClasses: ['s3_not_configured'],
        s3Configured: false,
      },
    });
    expect(audit.targetId).toMatch(/^[0-9a-f]{64}$/u);
    const persisted = JSON.stringify(audit);
    for (const rawIdentity of [
      USER_ID,
      PHONE,
      INTAKE_KEY,
      MEDIA_KEY,
      PATIENT_FILE_KEY,
      MEDIA_ID,
      'provider rejected raw object',
    ]) {
      expect(persisted).not.toContain(rawIdentity);
    }
  });

  it('deletes every collected external key before reporting full success', async () => {
    fakes.s3Enabled = true;

    const result = await runStrictPurgePlatformUser({
      targetId: USER_ID,
      actorId: ACTOR_ID,
      audit: { enabled: true },
    });

    expect(result).toMatchObject({ ok: true, outcome: 'completed' });
    expect(fakes.deleteS3Objects).toHaveBeenCalledWith([
      INTAKE_KEY,
      MEDIA_KEY,
      PATIENT_FILE_KEY,
    ]);
    const mediaDelete = fakes.runPgPoolSql.mock.calls
      .map((call) => drizzleSqlFragmentToPgQuery(call[1]))
      .find((query) => query.sql.includes('DELETE FROM media_files'));
    expect(mediaDelete).toBeDefined();
    expect(mediaDelete!.values).toEqual([MEDIA_ID]);
    expect(auditPayload()).toMatchObject({ status: 'ok', details: { failureClasses: [] } });
  });

  it('reduces provider cleanup failures to a class and count in the audit record', async () => {
    fakes.s3Enabled = true;
    fakes.deleteS3Objects.mockResolvedValue([
      { ok: true, key: INTAKE_KEY },
      { ok: false, key: MEDIA_KEY, error: 'provider rejected raw object' },
      { ok: true, key: PATIENT_FILE_KEY },
    ]);

    const result = await runStrictPurgePlatformUser({
      targetId: USER_ID,
      actorId: ACTOR_ID,
      audit: { enabled: true },
    });

    expect(result).toMatchObject({ ok: true, outcome: 'partial_failed' });
    const audit = auditPayload();
    expect(audit).toMatchObject({
      status: 'partial_failure',
      details: { failureClasses: ['s3_delete'], s3FailureCount: 1 },
    });
    const persisted = JSON.stringify(audit);
    expect(persisted).not.toContain(MEDIA_KEY);
    expect(persisted).not.toContain(MEDIA_ID);
    expect(persisted).not.toContain('provider rejected raw object');
  });
});

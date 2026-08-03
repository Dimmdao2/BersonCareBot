/**
 * Disposable-Postgres proof (Б1/Б3, #1081): user projection via `pgUserProjectionPort`.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original file only exercised not-found branches (no ambient
 * data existed on shared dev to test the found branch); the disposable harness makes seeding
 * trivial, so this version adds real found-branch coverage that was previously missing entirely.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { pgUserProjectionPort } from '@/infra/repos/pgUserProjection';

const PHONE = '+79991234567';
const EMAIL = 'b3-user-projection@example.invalid';
let staffId: string;

describe('pgUserProjection (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role, phone_normalized, email, email_normalized, email_verified_at)
         VALUES ($1, 'doctor', $2, $3, $3, now())
         RETURNING id`,
        ['B3 projection fixture', PHONE, EMAIL],
      );
      staffId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('findByPhoneNormalized returns null for unknown phone', async () => {
    const row = await pgUserProjectionPort.findByPhoneNormalized('+70000000000');
    expect(row).toBeNull();
  });

  it('findByPhoneNormalized returns the real row for a known phone', async () => {
    const row = await pgUserProjectionPort.findByPhoneNormalized(PHONE);
    expect(row?.platformUserId).toBe(staffId);
  });

  it('getProfileEmailFields returns nulls for unknown user id', async () => {
    const fields = await pgUserProjectionPort.getProfileEmailFields(
      '00000000-0000-4000-8000-00000000ffff',
    );
    expect(fields).toEqual({ email: null, emailVerifiedAt: null });
  });

  it('getProfileEmailFields returns the real verified email for a known user id', async () => {
    const fields = await pgUserProjectionPort.getProfileEmailFields(staffId);
    expect(fields.email).toBe(EMAIL);
    expect(fields.emailVerifiedAt).toBeTruthy();
  });

  it('clearStaffAccountEmail is no-op for unknown staff id', async () => {
    const result = await pgUserProjectionPort.clearStaffAccountEmail(
      '00000000-0000-4000-8000-00000000ffff',
    );
    expect(result).toEqual({ ok: false, reason: 'not_found_or_not_staff' });
  });

  it('clearStaffAccountEmail clears the real email for a known staff id', async () => {
    const result = await pgUserProjectionPort.clearStaffAccountEmail(staffId);
    expect(result.ok).toBe(true);
    const fields = await pgUserProjectionPort.getProfileEmailFields(staffId);
    expect(fields.email).toBeNull();
  });
});

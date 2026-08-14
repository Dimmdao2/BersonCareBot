/**
 * Disposable-Postgres proof (Б1/Б3, #1081): phase 14D comms tail ports (`pgBroadcastAudit`,
 * `pgPatientCalendarTimezone`) exercising real SQL, not a mock.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original only checked return-type shape on whatever ambient
 * data happened to exist; this version seeds its own fixtures so the found-branch is actually
 * proven, not just "didn't throw".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getPool } from '@/infra/db/client';
import { createPgBroadcastAuditPort } from '@/infra/repos/pgBroadcastAudit';
import { getPatientCalendarTimezoneIana } from '@/infra/repos/pgPatientCalendarTimezone';

let patientId: string;
const organizationId = randomUUID();
const auditScope = {
  organizationId,
  actorUserId: 'b3-doctor',
  visibilityActor: {
    membershipRole: 'doctor' as const,
    specialistId: randomUUID(),
    canManageAllSpecialists: false,
  },
};

describe('phase 14D comms tail (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
         ALTER TABLE broadcast_audit DISABLE ROW LEVEL SECURITY;`,
      );
      await client.query(
        `INSERT INTO be_organizations (id, title, is_active) VALUES ($1, 'Phase 14D clinic', true)`,
        [organizationId],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role, calendar_timezone)
         VALUES ($1, 'client', $2)
         RETURNING id`,
        ['B3 comms-tail fixture', 'Europe/Moscow'],
      );
      patientId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('broadcast audit list returns an empty array with nothing appended', async () => {
    const rows = await createPgBroadcastAuditPort().list(auditScope, 5);
    expect(rows).toEqual([]);
  });

  it('broadcast audit list returns a real appended entry', async () => {
    const port = createPgBroadcastAuditPort();
    await port.append({
      organizationId,
      actorId: 'b3-doctor',
      category: 'important_notice',
      audienceFilter: 'active_clients',
      messageTitle: 'B3 phase14D fixture',
      messageBody: 'exact body',
      channels: ['telegram'],
      previewOnly: false,
      audienceSize: 1,
      deliveryJobsTotal: 0,
      attachMenuAfterSend: false,
      sentCount: 0,
      errorCount: 0,
      blockedRecipientCount: 0,
    });
    const rows = await port.list(auditScope, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageTitle).toBe('B3 phase14D fixture');
  });

  it('getPatientCalendarTimezoneIana returns null for unknown user', async () => {
    const tz = await getPatientCalendarTimezoneIana('00000000-0000-4000-8000-00000000ffff');
    expect(tz).toBeNull();
  });

  it('getPatientCalendarTimezoneIana returns the real value for a known user', async () => {
    const tz = await getPatientCalendarTimezoneIana(patientId);
    expect(tz).toBe('Europe/Moscow');
  });
});

import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { getWebappSqlFromPgClient, runWebappSql, type WebappSqlExecutor } from '@/infra/db/runWebappSql';
import type { BroadcastAuditEntry, DoctorBroadcastQueueJob } from '@/modules/doctor-broadcasts/ports';

const testState = vi.hoisted(() => ({ pool: undefined as pg.Pool | undefined }));

vi.mock('@/infra/db/client', () => ({
  getPool: () => {
    if (!testState.pool) throw new Error('test PostgreSQL pool is not ready');
    return testState.pool;
  },
}));

import { createPgBroadcastAuditPort } from './pgBroadcastAudit';
import { createPgBroadcastChannelCountsPort } from './broadcastChannelCounts';
import { createPgDoctorBroadcastDeliveryCommitPort } from './pgDoctorBroadcastDelivery';

type AuditInput = Omit<BroadcastAuditEntry, 'id' | 'executedAt'>;

function auditInput(): AuditInput {
  return {
    actorId: 'doctor-42',
    category: 'important_notice',
    audienceFilter: 'active_clients',
    messageTitle: 'Important update',
    messageBody: 'The exact body is retained.',
    channels: ['telegram', 'max', 'sms'],
    previewOnly: false,
    audienceSize: 2,
    deliveryJobsTotal: 0,
    attachMenuAfterSend: true,
    sentCount: 3,
    errorCount: 1,
    blockedRecipientCount: 2,
  };
}

function deliveryJob(eventId = randomUUID()): DoctorBroadcastQueueJob {
  return {
    eventId,
    kind: 'doctor_broadcast_intent',
    channel: 'telegram',
    payloadJson: { intent: { text: 'exact payload' }, broadcastAuditId: 'kept-as-json' },
    maxAttempts: 7,
  };
}

describe('doctor broadcast Drizzle SQL conversion', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let db: WebappSqlExecutor;

  function execute<T>(statement: SQL) {
    return runWebappSql<T>(db, statement);
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    testState.pool = pool;
    client = await pool.connect();
    db = getWebappSqlFromPgClient(client);
    // This audit isolates the pre-existing broadcast SQL contract; tenant policy is exercised by
    // its own wall suite. Restore these disposable-clone toggles in afterAll.
    await execute(
      sql.raw(
        'ALTER TABLE broadcast_audit DISABLE ROW LEVEL SECURITY; ALTER TABLE broadcast_audit_recipients DISABLE ROW LEVEL SECURITY; ALTER TABLE outgoing_delivery_queue DISABLE ROW LEVEL SECURITY;',
      ),
    );
  });

  afterAll(async () => {
    await execute(
      sql.raw(
        'ALTER TABLE broadcast_audit ENABLE ROW LEVEL SECURITY; ALTER TABLE broadcast_audit_recipients ENABLE ROW LEVEL SECURITY; ALTER TABLE outgoing_delivery_queue ENABLE ROW LEVEL SECURITY;',
      ),
    );
    client.release();
    await pool.end();
    testState.pool = undefined;
  });

  it('keeps complete audit row shape, append/list order and the default list limit', async () => {
    const auditPort = createPgBroadcastAuditPort();
    const appended = await auditPort.append(auditInput());

    expect(appended).toMatchObject({
      ...auditInput(),
      id: expect.any(String),
      executedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(appended.executedAt))).toBe(false);
    await execute(sql`DELETE FROM broadcast_audit WHERE id = ${appended.id}`);

    const firstId = randomUUID();
    const secondId = randomUUID();
    await execute(
      sql`INSERT INTO broadcast_audit (id, actor_id, category, audience_filter, message_title, message_body, channels, executed_at, preview_only, audience_size, delivery_jobs_total, attach_menu_after_send, sent_count, error_count, blocked_recipient_count)
          VALUES (${firstId}, 'doctor-1', 'service', 'all', 'first', '', ARRAY['sms'], '2026-01-01T00:00:00Z', false, 0, 0, false, 0, 0, 0),
                 (${secondId}, 'doctor-2', 'service', 'all', 'second', '', ARRAY['sms'], '2026-01-02T00:00:00Z', false, 0, 0, false, 0, 0, 0)`,
    );
    const listed = await auditPort.list(1);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: secondId, messageTitle: 'second' });
  });

  it('preserves distinct and merged-user channel counts', async () => {
    const activeUserId = randomUUID();
    const mergedUserId = randomUUID();
    const emailOnlyUserId = randomUUID();
    await execute(
      sql`INSERT INTO platform_users (id, display_name, role, phone_normalized, email_normalized, email_verified_at, merged_into_id)
          VALUES (${activeUserId}, 'active', 'client', '+70000000001', 'active@example.test', now(), NULL),
                 (${mergedUserId}, 'merged', 'client', '+70000000002', 'merged@example.test', now(), ${activeUserId}),
                 (${emailOnlyUserId}, 'email-only', 'client', NULL, 'email@example.test', now(), NULL)`,
    );
    await execute(
      sql`INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
          VALUES (${activeUserId}, 'telegram', 'tg-active-a'),
                 (${activeUserId}, 'telegram', 'tg-active-b'),
                 (${activeUserId}, 'max', 'max-active'),
                 (${mergedUserId}, 'telegram', 'tg-merged')`,
    );
    await execute(
      sql`INSERT INTO user_web_push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (${activeUserId}, 'https://push.test/active', 'key-a', 'auth-a'),
                 (${mergedUserId}, 'https://push.test/merged', 'key-b', 'auth-b')`,
    );

    await expect(
      createPgBroadcastChannelCountsPort().getChannelCountsByUserIds([
        activeUserId,
        mergedUserId,
        emailOnlyUserId,
      ]),
    ).resolves.toEqual({ bot_message: 2, telegram: 2, max: 1, sms: 1, push: 2, email: 2 });
  });

  it('commits the audit, every job and deduplicated recipients atomically and returns that audit', async () => {
    const recipientA = randomUUID();
    const recipientB = randomUUID();
    await execute(
      sql`INSERT INTO platform_users (id, display_name, role) VALUES (${recipientA}, 'recipient-a', 'client'), (${recipientB}, 'recipient-b', 'client')`,
    );
    const auditId = randomUUID();
    const firstJob = deliveryJob();
    const secondJob = { ...deliveryJob(), channel: 'max' };

    const result = await createPgDoctorBroadcastDeliveryCommitPort().commitAuditAndDeliveryQueue({
      auditId,
      audit: auditInput(),
      jobs: [firstJob, secondJob],
      recipientUserIds: [recipientA, ` ${recipientA} `, recipientB],
    });

    expect(result).toMatchObject({
      ...auditInput(),
      id: auditId,
      deliveryJobsTotal: 2,
      executedAt: expect.any(String),
    });
    const stored = await execute<{
      delivery_jobs_total: number;
      payload_json: { intent: { text: string } };
      status: string;
      attempt_count: number;
      max_attempts: number;
      next_retry_at: string;
      recipient_count: string;
    }>(
      sql`SELECT a.delivery_jobs_total,
              q.payload_json,
              q.status,
              q.attempt_count,
              q.max_attempts,
              q.next_retry_at::text,
              (SELECT count(*) FROM broadcast_audit_recipients r WHERE r.audit_id = a.id)::text AS recipient_count
       FROM broadcast_audit a
       JOIN outgoing_delivery_queue q ON q.event_id IN (${firstJob.eventId}, ${secondJob.eventId})
       WHERE a.id = ${auditId}
       ORDER BY q.event_id`,
    );
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivery_jobs_total: 2,
          payload_json: firstJob.payloadJson,
          status: 'pending',
          attempt_count: 0,
          max_attempts: 7,
          recipient_count: '2',
          next_retry_at: expect.any(String),
        }),
      ]),
    );
  });

  it('rolls back a duplicate event and a forced job-insert failure without leaving audit, jobs or recipients', async () => {
    const recipientId = randomUUID();
    await execute(
      sql`INSERT INTO platform_users (id, display_name, role) VALUES (${recipientId}, 'rollback-recipient', 'client')`,
    );
    const duplicateEventId = randomUUID();
    await execute(
      sql`INSERT INTO outgoing_delivery_queue (event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at)
          VALUES (${duplicateEventId}, 'doctor_broadcast_intent', 'telegram', '{}', 'pending', 0, 6, now())`,
    );

    const commitPort = createPgDoctorBroadcastDeliveryCommitPort();
    const duplicateAuditId = randomUUID();
    await expect(
      commitPort.commitAuditAndDeliveryQueue({
        auditId: duplicateAuditId,
        audit: auditInput(),
        jobs: [deliveryJob(duplicateEventId)],
        recipientUserIds: [recipientId],
      }),
    ).rejects.toThrow('outgoing_delivery_queue_insert_conflict_or_skipped');

    await execute(
      sql.raw(`CREATE FUNCTION fail_doctor_broadcast_audit_test_job() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.event_id = 'forced-audit-test-job-failure' THEN RAISE EXCEPTION 'forced audit test job failure'; END IF;
           RETURN NEW;
         END;
       $$;
       CREATE TRIGGER fail_doctor_broadcast_audit_test_job
       BEFORE INSERT ON outgoing_delivery_queue
       FOR EACH ROW EXECUTE FUNCTION fail_doctor_broadcast_audit_test_job();`),
    );
    const failedAuditId = randomUUID();
    try {
      await expect(
        commitPort.commitAuditAndDeliveryQueue({
          auditId: failedAuditId,
          audit: auditInput(),
          jobs: [deliveryJob('forced-audit-test-job-failure')],
          recipientUserIds: [recipientId],
        }),
      ).rejects.toThrow();
    } finally {
      await execute(
        sql.raw(
          'DROP TRIGGER fail_doctor_broadcast_audit_test_job ON outgoing_delivery_queue; DROP FUNCTION fail_doctor_broadcast_audit_test_job();',
        ),
      );
    }

    const leftovers = await execute<{
      audit_count: string;
      job_count: string;
      recipient_count: string;
    }>(sql`SELECT
         (SELECT count(*) FROM broadcast_audit WHERE id = ANY(${sql.param([duplicateAuditId, failedAuditId])}::uuid[]))::text AS audit_count,
         (SELECT count(*) FROM outgoing_delivery_queue WHERE event_id = 'forced-audit-test-job-failure')::text AS job_count,
         (SELECT count(*) FROM broadcast_audit_recipients WHERE audit_id = ANY(${sql.param([duplicateAuditId, failedAuditId])}::uuid[]))::text AS recipient_count`);
    expect(leftovers.rows[0]).toEqual({ audit_count: '0', job_count: '0', recipient_count: '0' });
  });
});

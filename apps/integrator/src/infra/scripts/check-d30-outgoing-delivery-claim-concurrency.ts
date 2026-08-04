/**
 * D30 Ш0 §2a condition 2, point 3 — disposable-Postgres proof for `outgoing_delivery_queue`
 * row-level idempotency, the second guard that keeps two live schedulers from double-sending even
 * before the per-tick ownership check (piece 2) catches a lost lock:
 *
 * 1. Two concurrent `claimDueOutgoingDeliveries` calls against the same due row (`FOR UPDATE SKIP
 *    LOCKED`): exactly one must win the row.
 * 2. A repeated `enqueueOutgoingDeliveryIfAbsent` with the same `event_id` must not create a
 *    second row (`uq_outgoing_delivery_queue_event_id` + `ON CONFLICT DO NOTHING`).
 *
 * D20 level-3 item 15 addendum: `resetStaleOutgoingDeliveryProcessing`'s reclaim cap
 * (`outgoingDeliveryQueue.reclaim.integration.test.ts` proves the same behavior but is an opt-in
 * vitest test that no CI job ever enables — RUN_OUTGOING_DELIVERY_RECLAIM_TEST is not set anywhere
 * in `.github/workflows/ci.yml`, so it is dead protection per test-execution-policy.md's own "only
 * a real running CI job counts" rule). Proven here instead, in the script this CI job already runs:
 * 3. A stale "processing" row at the reclaim cap is dead-lettered, not recycled forever (D10b) —
 *    a crash-looping worker must not keep re-sending the same message on every reclaim.
 *
 * DDL below is the real `public.outgoing_delivery_queue` shape, assembled from migrations 0060,
 * 0107, 0280, D30's 0328 addition and D27-C's 0359 (priority column). Runs against its own
 * throwaway PostgreSQL instance; reads no application env and touches no configured DATABASE_URL.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { startDisposablePostgres } from './d30DisposablePostgres.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// D20 level-3 F5: a `main()` that returns early must not exit 0 with an empty log. `passedPieces`
// lives outside `main()` so the completion check below still fires even if `main()` never reaches it.
const EXPECTED_PIECES = [
  'piece 4a',
  'piece 4b',
  'piece 4c',
  'piece 4d',
  'piece 4e',
  'piece 4f',
  'piece 4g',
] as const;
const passedPieces = new Set<string>();

function reportPiecePass(id: (typeof EXPECTED_PIECES)[number], message: string): void {
  passedPieces.add(id);
  console.log(`[${id}] PASS: ${message}`);
}

const OUTGOING_DELIVERY_QUEUE_DDL = `
CREATE ROLE app_owner NOLOGIN NOBYPASSRLS;
CREATE ROLE app_staff LOGIN NOBYPASSRLS;
CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;
CREATE ROLE app_worker NOLOGIN NOBYPASSRLS;
CREATE ROLE app_operational_diagnostic NOLOGIN NOBYPASSRLS;
CREATE ROLE app_operational_delivery_worker LOGIN NOBYPASSRLS;
CREATE ROLE app_operational_scheduler NOLOGIN NOBYPASSRLS;
CREATE ROLE app_operational_media_worker NOLOGIN NOBYPASSRLS;
CREATE SCHEMA app;
GRANT USAGE, CREATE ON SCHEMA app TO app_owner;
GRANT USAGE ON SCHEMA app, public TO app_operational_delivery_worker;
GRANT USAGE ON SCHEMA app, public TO app_staff;
CREATE TABLE public.outgoing_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id text NOT NULL,
  kind text NOT NULL,
  channel text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_retry_at timestamptz NOT NULL,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  failure_class text,
  reclaim_count integer NOT NULL DEFAULT 0,
  organization_id uuid,
  priority smallint NOT NULL DEFAULT 0,
  CONSTRAINT outgoing_delivery_queue_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed_retryable', 'dead')
  )
);
CREATE UNIQUE INDEX uq_outgoing_delivery_queue_event_id
  ON public.outgoing_delivery_queue (event_id);
CREATE INDEX idx_outgoing_delivery_queue_due
  ON public.outgoing_delivery_queue (status, priority DESC, next_retry_at);
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  email text,
  email_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.specialist_tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  patient_user_id uuid,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  remind_at timestamptz,
  is_important boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.specialist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialist_tasks FORCE ROW LEVEL SECURITY;
CREATE TABLE public.user_channel_bindings (
  user_id uuid NOT NULL,
  channel_code text NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  bot_blocked_at timestamptz,
  bot_blocked_reason text,
  PRIMARY KEY (user_id, channel_code)
);
CREATE TABLE public.user_channel_preferences (
  user_id text NOT NULL,
  platform_user_id uuid NOT NULL,
  channel_code text NOT NULL,
  is_enabled_for_messages boolean NOT NULL DEFAULT true,
  is_enabled_for_notifications boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_user_id, channel_code)
);
CREATE TABLE public.user_notification_topic_channels (
  user_id uuid NOT NULL,
  topic_code text NOT NULL,
  channel_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_code, channel_code)
);
CREATE TABLE public.user_web_push_subscriptions (
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint)
);
CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const D30_ONLINE_INDEX_ARTIFACT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
  'deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql',
);

const D30_SPECIALIST_OUTCOME_MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
  'apps/webapp/db/drizzle-migrations/0333_d30_specialist_task_delivery_outcome_capability_local.sql',
);

function runD30OnlineIndexArtifact(connectionString: string) {
  return spawnSync(
    '/usr/lib/postgresql/16/bin/psql',
    ['-d', connectionString, '-X', '-v', 'ON_ERROR_STOP=1', '-f', D30_ONLINE_INDEX_ARTIFACT],
    { encoding: 'utf8' },
  );
}

function runPsql(connectionString: string, args: readonly string[]) {
  return spawnSync(
    '/usr/lib/postgresql/16/bin/psql',
    ['-d', connectionString, '-X', '-v', 'ON_ERROR_STOP=1', ...args],
    {
      encoding: 'utf8',
    },
  );
}

function connectionStringForRole(connectionString: string, role: string): string {
  assert(/^[a-z_][a-z0-9_]*$/.test(role), 'invalid disposable PostgreSQL role');
  const prefix = 'postgresql://postgres@/';
  assert(connectionString.startsWith(prefix), 'unexpected disposable PostgreSQL connection string');
  return `postgresql://${role}@/${connectionString.slice(prefix.length)}`;
}

/**
 * D20 level-3 F2 — makes the piece 4a race deterministic instead of timing-luck. A plain
 * `Promise.all` of two claims is not enough: each `claimDueOutgoingDeliveries` call is one
 * implicit-transaction UPDATE that, locally, completes in well under a millisecond, so the second
 * racer's UPDATE typically doesn't even reach the row lock until after the first has already
 * committed — no overlap, no bug exercised, regardless of which locking code path is under test.
 * This trigger holds the row lock for 400ms once a claim UPDATE has taken it (`BEFORE UPDATE`,
 * after Postgres has already locked the target row for the update), which is what actually forces
 * the second racer's UPDATE to block on the first — the scenario the missing-lock and two-phase-
 * claim bugs both need to be caught. It only fires on the pending→processing transition, so it
 * does not slow down piece 4c's reclaim (pending→dead) or 4b's plain insert.
 */
const CLAIM_RACE_DELAY_DDL = `
CREATE OR REPLACE FUNCTION delay_outgoing_delivery_claim() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    PERFORM pg_sleep(0.4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_delay_outgoing_delivery_claim
  BEFORE UPDATE ON public.outgoing_delivery_queue
  FOR EACH ROW EXECUTE FUNCTION delay_outgoing_delivery_claim();
`;

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('outgoing_delivery');
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/cabinet';
  process.env.NODE_ENV = 'development';

  try {
    const {
      claimDueOutgoingDeliveries,
      deleteExpiredSentOutgoingDeliveries,
      enqueueOutgoingDeliveryIfAbsent,
      resetStaleOutgoingDeliveryProcessing,
      OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
    } = await import('../db/repos/outgoingDeliveryQueue.js');
    const { createDbPort, closeDb } = await import('../db/client.js');
    const { runWithInfraPrincipal } = await import('../principal/organizationPrincipal.js');

    const db = createDbPort();
    await runIntegratorSql(db, sql.raw(OUTGOING_DELIVERY_QUEUE_DDL));
    await runIntegratorSql(db, sql.raw(CLAIM_RACE_DELAY_DDL));
    const outcomeMigration = runPsql(disposable.connectionString, [
      '-f',
      D30_SPECIALIST_OUTCOME_MIGRATION,
    ]);
    assert(
      outcomeMigration.status === 0,
      `specialist outcome capability migration failed: ${outcomeMigration.stderr}`,
    );

    const eventId = `d30-claim-race-${randomUUID()}`;

    const inserted = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: {},
      }),
    );
    assert(inserted, 'the first enqueue for a fresh event_id must insert a row');

    // --- Piece 4a: two concurrent claims of the one due row ----------------------------------
    // CLAIM_RACE_DELAY_DDL's trigger forces the two claims to genuinely overlap (see its comment).
    const [claimA, claimB] = await Promise.all([
      runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs' }, () =>
        claimDueOutgoingDeliveries(db, 10),
      ),
      runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs' }, () =>
        claimDueOutgoingDeliveries(db, 10),
      ),
    ]);
    const claimedRows = [...claimA, ...claimB].filter((row) => row.eventId === eventId);
    assert(
      claimedRows.length === 1,
      `expected exactly one concurrent claim to win the due row, got ${claimedRows.length}`,
    );
    reportPiecePass('piece 4a', 'two concurrent claims on one due row, exactly one won');

    // --- Piece 4b: repeated enqueue with the same event_id does not duplicate the row --------
    const insertedAgain = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: {},
      }),
    );
    assert(
      insertedAgain === false,
      'repeated enqueue with the same event_id must not insert a second row',
    );

    const countRes = await runIntegratorSql<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n FROM public.outgoing_delivery_queue WHERE event_id = ${eventId}`,
    );
    assert(
      countRes.rows[0]?.n === 1,
      `expected exactly one row for event_id after the repeated enqueue, found ${countRes.rows[0]?.n}`,
    );
    reportPiecePass(
      'piece 4b',
      'repeated enqueue with the same event_id did not create a second row',
    );

    // --- Piece 4c: a stale row at the reclaim cap is dead-lettered, not recycled forever -----
    // F3 control: an already-`sent` row, stale by the same clock, must be left alone by reclaim —
    // widening the reclaim filter from `status = 'processing'` to include `'sent'` would re-deliver
    // an already-delivered message.
    const cappedEventId = `d30-reclaim-cap-${randomUUID()}`;
    const sentEventId = `d30-reclaim-sent-control-${randomUUID()}`;
    const cappedInsert = await runIntegratorSql<{ id: string }>(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, last_attempt_at, reclaim_count
          ) VALUES (
            ${cappedEventId}, 'operator_alert', 'telegram', '{}'::jsonb, 'processing', 1, 6,
            now(), now() - interval '20 minutes', 4
          )
          RETURNING id`,
    );
    const sentInsert = await runIntegratorSql<{ id: string }>(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, last_attempt_at, sent_at, reclaim_count
          ) VALUES (
            ${sentEventId}, 'operator_alert', 'telegram', '{}'::jsonb, 'sent', 1, 6,
            now(), now() - interval '20 minutes', now() - interval '20 minutes', 0
          )
          RETURNING id`,
    );
    const cappedId = cappedInsert.rows[0]?.id;
    const sentId = sentInsert.rows[0]?.id;
    assert(cappedId !== undefined, 'could not insert the capped stale row fixture');
    assert(sentId !== undefined, 'could not insert the sent control row fixture');

    const reclaimResult = await runWithInfraPrincipal(
      { source: 'worker:outgoing-delivery-tick' },
      () => resetStaleOutgoingDeliveryProcessing(db, 10, 5),
    );
    assert(
      reclaimResult.deadLettered >= 1,
      `expected the capped stale row to be dead-lettered, got deadLettered=${reclaimResult.deadLettered}`,
    );

    const cappedRow = await runIntegratorSql<{ status: string; failure_class: string | null }>(
      db,
      sql`SELECT status, failure_class FROM public.outgoing_delivery_queue WHERE id = ${cappedId}`,
    );
    const sentRow = await runIntegratorSql<{ status: string; sent_at: string | null }>(
      db,
      sql`SELECT status, sent_at FROM public.outgoing_delivery_queue WHERE id = ${sentId}`,
    );
    assert(
      cappedRow.rows[0]?.status === 'dead',
      'the capped stale row must end up dead, not pending again',
    );
    assert(
      cappedRow.rows[0]?.failure_class === OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
      `expected failure_class ${OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS}, got ${cappedRow.rows[0]?.failure_class}`,
    );
    assert(
      sentRow.rows[0]?.status === 'sent' && sentRow.rows[0]?.sent_at !== null,
      `reclaim must not touch an already-sent row, got status=${sentRow.rows[0]?.status} sent_at=${sentRow.rows[0]?.sent_at}`,
    );
    reportPiecePass(
      'piece 4c',
      'a stale row at the reclaim cap was dead-lettered, not recycled, and a stale-but-already-sent control row was left untouched',
    );

    // --- Piece 4d: standalone online-index artifact fails closed on valid incompatibility -----
    await runIntegratorSql(
      db,
      sql.raw(`CREATE INDEX idx_outgoing_delivery_queue_organization_status_due
        ON public.outgoing_delivery_queue (status, organization_id, next_retry_at)`),
    );
    const incompatibleResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      incompatibleResult.status !== 0,
      'the standalone online-index artifact must return non-zero for a valid same-name index with incompatible key order',
    );
    assert(
      `${incompatibleResult.stdout}${incompatibleResult.stderr}`.includes(
        'FATAL: D30 outgoing delivery queue online index is missing, invalid, or has an incompatible definition',
      ),
      'the incompatible-index failure must retain the operator-facing diagnostic',
    );

    await runIntegratorSql(
      db,
      sql.raw('DROP INDEX public.idx_outgoing_delivery_queue_organization_status_due'),
    );
    const firstCreateResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      firstCreateResult.status === 0,
      `the standalone online-index artifact must create the missing exact index, exit=${firstCreateResult.status}`,
    );
    const retryResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      retryResult.status === 0,
      `the standalone online-index artifact retry must be idempotent, exit=${retryResult.status}`,
    );
    const indexState = await runIntegratorSql<{
      indisvalid: boolean;
      indisready: boolean;
      keys: string[];
    }>(
      db,
      sql.raw(`SELECT index_state.indisvalid,
                      index_state.indisready,
                      ARRAY(
                        SELECT attribute.attname::text
                          FROM unnest(index_state.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                          JOIN pg_catalog.pg_attribute attribute
                            ON attribute.attrelid = index_state.indrelid
                           AND attribute.attnum = key_column.attnum
                         ORDER BY key_column.ordinality
                      ) AS keys
                 FROM pg_catalog.pg_index index_state
                WHERE index_state.indexrelid =
                      'public.idx_outgoing_delivery_queue_organization_status_due'::regclass`),
    );
    assert(
      indexState.rows[0]?.indisvalid === true && indexState.rows[0]?.indisready === true,
      'the created exact index must be valid and ready',
    );
    assert(
      indexState.rows[0]?.keys.join(',') === 'organization_id,status,next_retry_at',
      `the created exact index has unexpected keys: ${indexState.rows[0]?.keys.join(',')}`,
    );
    reportPiecePass(
      'piece 4d',
      'online-index artifact failed closed on an incompatible valid index and created/retried the exact index',
    );

    // --- Piece 4e: locked delivery capability applies the product receipt without table DML ----
    const outcomeTaskId = randomUUID();
    const outcomeQueueId = randomUUID();
    const outcomeOrganizationId = randomUUID();
    const outcomeOwnerId = randomUUID();
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.platform_users (id) VALUES (${outcomeOwnerId}::uuid)`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.specialist_tasks (id, organization_id, owner_user_id, title)
          VALUES (
            ${outcomeTaskId}::uuid, ${outcomeOrganizationId}::uuid,
            ${outcomeOwnerId}::uuid, 'Outcome fixture'
          )`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, sent_at, organization_id
          ) VALUES (
            ${outcomeQueueId}::uuid, ${`d30-outcome-${outcomeQueueId}`},
            'specialist_task_reminder', 'telegram',
            ${JSON.stringify({
              successOutcome: {
                type: 'specialistTask.reminder.markSent',
                taskId: outcomeTaskId,
              },
            })}::jsonb,
            'sent', 1, 6, now(), now(), ${outcomeOrganizationId}::uuid
          )`,
    );

    const deliveryRoleConnectionString = connectionStringForRole(
      disposable.connectionString,
      'app_operational_delivery_worker',
    );
    const directDml = runPsql(deliveryRoleConnectionString, [
      '-c',
      `UPDATE public.specialist_tasks SET reminder_sent_at = now() WHERE id = '${outcomeTaskId}'::uuid`,
    ]);
    assert(
      directDml.status !== 0,
      'delivery capability role must not UPDATE specialist_tasks directly',
    );

    const applyOutcome = runPsql(deliveryRoleConnectionString, [
      '-qAtc',
      `SELECT app.apply_specialist_task_reminder_success_outcome('${outcomeQueueId}'::uuid)`,
    ]);
    assert(
      applyOutcome.status === 0 && applyOutcome.stdout.trim().endsWith('t'),
      `exact delivery outcome capability failed: ${applyOutcome.stderr}`,
    );
    const appliedState = await runIntegratorSql<{
      timestamps_match: boolean;
      applied_at: string | null;
    }>(
      db,
      sql`SELECT task.reminder_sent_at = delivery.sent_at AS timestamps_match,
                 delivery.payload_json #>> '{successOutcome,appliedAt}' AS applied_at
          FROM public.specialist_tasks AS task
          JOIN public.outgoing_delivery_queue AS delivery ON delivery.id = ${outcomeQueueId}::uuid
          WHERE task.id = ${outcomeTaskId}::uuid`,
    );
    assert(
      appliedState.rows[0]?.timestamps_match === true,
      `canonical reminder timestamp must equal the durable transport sent_at: ${JSON.stringify(appliedState.rows[0])}`,
    );
    assert(appliedState.rows[0]?.applied_at !== null, 'durable outcome must be marked applied');

    const applyAgain = runPsql(deliveryRoleConnectionString, [
      '-qAtc',
      `SELECT app.apply_specialist_task_reminder_success_outcome('${outcomeQueueId}'::uuid)`,
    ]);
    assert(
      applyAgain.status === 0 && applyAgain.stdout.trim().endsWith('f'),
      'reapplying an already-applied outcome must be an idempotent false',
    );

    const foreignTaskId = randomUUID();
    const foreignQueueId = randomUUID();
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.specialist_tasks (id, organization_id, owner_user_id, title)
          VALUES (
            ${foreignTaskId}::uuid, ${randomUUID()}::uuid,
            ${outcomeOwnerId}::uuid, 'Foreign outcome fixture'
          )`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, sent_at, organization_id
          ) VALUES (
            ${foreignQueueId}::uuid, ${`d30-outcome-foreign-${foreignQueueId}`},
            'specialist_task_reminder', 'telegram',
            ${JSON.stringify({
              successOutcome: {
                type: 'specialistTask.reminder.markSent',
                taskId: foreignTaskId,
              },
            })}::jsonb,
            'sent', 1, 6, now(), now() - interval '2 days', ${randomUUID()}::uuid
          )`,
    );
    const foreignOutcome = runPsql(deliveryRoleConnectionString, [
      '-qAtc',
      `SELECT app.apply_specialist_task_reminder_success_outcome('${foreignQueueId}'::uuid)`,
    ]);
    assert(foreignOutcome.status !== 0, 'cross-tenant task outcome must fail closed');
    const foreignState = await runIntegratorSql<{
      reminder_sent_at: string | null;
      applied_at: string | null;
    }>(
      db,
      sql`SELECT task.reminder_sent_at::text,
                 delivery.payload_json #>> '{successOutcome,appliedAt}' AS applied_at
          FROM public.specialist_tasks AS task
          JOIN public.outgoing_delivery_queue AS delivery ON delivery.id = ${foreignQueueId}::uuid
          WHERE task.id = ${foreignTaskId}::uuid`,
    );
    assert(
      foreignState.rows[0]?.reminder_sent_at === null && foreignState.rows[0]?.applied_at === null,
      'cross-tenant outcome failure must leave both task and durable receipt pending untouched',
    );
    const pendingBotMarkerQueueId = randomUUID();
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, sent_at, organization_id
          ) VALUES (
            ${pendingBotMarkerQueueId}::uuid, ${`d30-bot-marker-${pendingBotMarkerQueueId}`},
            'specialist_task_reminder', 'telegram',
            ${JSON.stringify({
              successOutcome: {
                type: 'specialistTask.reminder.markSent',
                taskId: outcomeTaskId,
                appliedAt: '2026-08-01T00:00:00.000Z',
              },
              bookkeeping: { botMarkerRequired: true },
            })}::jsonb,
            'sent', 1, 6, now(), now() - interval '2 days', ${outcomeOrganizationId}::uuid
          )`,
    );
    await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      deleteExpiredSentOutgoingDeliveries(db, 1),
    );
    const retainedPendingOutcome = await runIntegratorSql<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n
          FROM public.outgoing_delivery_queue
          WHERE id = ${foreignQueueId}::uuid`,
    );
    assert(
      retainedPendingOutcome.rows[0]?.n === 1,
      'retention must not delete a sent row while its durable product outcome is pending',
    );
    const retainedPendingBotMarker = await runIntegratorSql<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n
          FROM public.outgoing_delivery_queue
          WHERE id = ${pendingBotMarkerQueueId}::uuid`,
    );
    assert(
      retainedPendingBotMarker.rows[0]?.n === 1,
      'retention must not delete a sent row while bot-marker bookkeeping is pending',
    );
    reportPiecePass(
      'piece 4e',
      'locked delivery role had no direct task DML, exact capability atomically applied the sent receipt, retry was idempotent, cross-tenant receipt failed closed, and pending bookkeeping survived retention',
    );

    // --- Piece 4f: stale materialization never reaches provider; concurrent producers stay one ---
    const materializationOwnerId = randomUUID();
    const materializationTaskId = randomUUID();
    const materializationQueueId = randomUUID();
    const materializationOrganizationId = randomUUID();
    const materializationEventId = `specialist-task:${materializationTaskId}:2026-08-03T05%3A00%3A00.000Z:telegram`;
    const materializationPayload = {
      successOutcome: {
        type: 'specialistTask.reminder.markSent',
        taskId: materializationTaskId,
      },
      bookkeeping: { botMarkerRequired: true },
      intent: { type: 'message.send' },
    };
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.platform_users (id, email, email_verified_at)
          VALUES (${materializationOwnerId}::uuid, 'doctor@example.test', now())`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.specialist_tasks (
            id, organization_id, owner_user_id, title, remind_at
          ) VALUES (
            ${materializationTaskId}::uuid, ${materializationOrganizationId}::uuid,
            ${materializationOwnerId}::uuid, 'Materialization fixture', now()
          )`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
          VALUES (${materializationOwnerId}::uuid, 'telegram', 'recipient-before')`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.user_notification_topic_channels (
            user_id, topic_code, channel_code, is_enabled
          ) VALUES (
            ${materializationOwnerId}::uuid, 'doctor_specialist_task_reminders',
            'telegram', true
          )`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, organization_id
          ) VALUES (
            ${materializationQueueId}::uuid, ${materializationEventId},
            'specialist_task_reminder', 'telegram',
            ${JSON.stringify(materializationPayload)}::jsonb,
            'pending', 0, 6, now(), ${materializationOrganizationId}::uuid
          )`,
    );
    const staffRoleConnectionString = connectionStringForRole(
      disposable.connectionString,
      'app_staff',
    );
    const refreshMaterialization = () =>
      runPsql(staffRoleConnectionString, [
        '-qAtc',
        `BEGIN; SET LOCAL app.org = '${materializationOrganizationId}'; SELECT app.refresh_specialist_task_reminder_materialization('${materializationEventId}'); COMMIT`,
      ]);
    const crossTenantRefresh = runPsql(staffRoleConnectionString, [
      '-qAtc',
      `BEGIN; SET LOCAL app.org = '${randomUUID()}'; SELECT app.refresh_specialist_task_reminder_materialization('${materializationEventId}'); COMMIT`,
    ]);
    assert(
      crossTenantRefresh.status !== 0,
      'cross-tenant producer must not refresh a specialist reminder materialization',
    );
    const firstRefresh = refreshMaterialization();
    assert(
      firstRefresh.status === 0 && firstRefresh.stdout.trim().includes('t'),
      `initial materialization refresh failed: ${firstRefresh.stderr}`,
    );

    await runIntegratorSql(
      db,
      sql`UPDATE public.outgoing_delivery_queue
          SET status = 'processing'
          WHERE id = ${materializationQueueId}::uuid`,
    );
    await runIntegratorSql(
      db,
      sql`UPDATE public.user_channel_bindings
          SET external_id = 'recipient-after'
          WHERE user_id = ${materializationOwnerId}::uuid AND channel_code = 'telegram'`,
    );
    const rebindValidation = runPsql(deliveryRoleConnectionString, [
      '-qAtc',
      `SELECT app.revalidate_specialist_task_reminder_materialization('${materializationQueueId}'::uuid)`,
    ]);
    assert(
      rebindValidation.status === 0 && rebindValidation.stdout.trim().endsWith('f'),
      `a recipient rebind inside one 5s worker window must fail closed: ${rebindValidation.stderr}`,
    );

    const producerUpsert = () =>
      runIntegratorSql(
        db,
        sql`INSERT INTO public.outgoing_delivery_queue (
              id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
              next_retry_at, organization_id
            ) VALUES (
              gen_random_uuid(), ${materializationEventId}, 'specialist_task_reminder', 'telegram',
              ${JSON.stringify(materializationPayload)}::jsonb, 'pending', 0, 6, now(),
              ${materializationOrganizationId}::uuid
            )
            ON CONFLICT (event_id) DO UPDATE SET
              payload_json = EXCLUDED.payload_json,
              status = 'pending',
              attempt_count = 0,
              next_retry_at = now(),
              last_error = NULL,
              dead_at = NULL,
              updated_at = now()
            WHERE outgoing_delivery_queue.status IN ('pending', 'failed_retryable')`,
      );
    await Promise.all([producerUpsert(), producerUpsert()]);
    const concurrentRefresh = refreshMaterialization();
    assert(
      concurrentRefresh.status === 0 && concurrentRefresh.stdout.trim().includes('t'),
      `concurrent producer materialization refresh failed: ${concurrentRefresh.stderr}`,
    );
    await runIntegratorSql(
      db,
      sql`UPDATE public.user_notification_topic_channels
          SET is_enabled = false, updated_at = clock_timestamp()
          WHERE user_id = ${materializationOwnerId}::uuid
            AND topic_code = 'doctor_specialist_task_reminders'
            AND channel_code = 'telegram'`,
    );
    await runIntegratorSql(
      db,
      sql`UPDATE public.outgoing_delivery_queue
          SET status = 'processing'
          WHERE id = ${materializationQueueId}::uuid`,
    );
    const disableValidation = runPsql(deliveryRoleConnectionString, [
      '-qAtc',
      `SELECT app.revalidate_specialist_task_reminder_materialization('${materializationQueueId}'::uuid)`,
    ]);
    assert(
      disableValidation.status === 0 && disableValidation.stdout.trim().endsWith('f'),
      `a topic disable inside one 5s worker window must fail closed: ${disableValidation.stderr}`,
    );
    const staleState = await runIntegratorSql<{
      status: string;
      last_error: string | null;
      count: number;
    }>(
      db,
      sql`SELECT min(status) AS status,
                 min(last_error) AS last_error,
                 count(*)::int AS count
          FROM public.outgoing_delivery_queue
          WHERE event_id = ${materializationEventId}`,
    );
    assert(
      staleState.rows[0]?.status === 'failed_retryable' &&
        staleState.rows[0]?.last_error === 'SPECIALIST_TASK_REMINDER_STALE_MATERIALIZATION' &&
        staleState.rows[0]?.count === 1,
      `stale materialization must remain one producer-replaceable row: ${JSON.stringify(staleState.rows[0])}`,
    );
    reportPiecePass(
      'piece 4f',
      'recipient rebind and topic disable inside the 5s worker window failed closed before provider dispatch; concurrent immediate/cron producers retained one stable event row',
    );

    // --- Piece 4g: D27-C — a higher-priority row is claimed first at the same next_retry_at -----
    // A login code (auth_email_otp, priority 100) must not queue behind an ordinary mailing
    // (priority 0) merely because both became due at the same instant — next_retry_at alone has no
    // defined tie-break order. Two rows share one timestamp; batchSize=1 must return the
    // higher-priority one, not whichever the untie-broken scan happened to reach first.
    const lowPriorityEventId = `d30-priority-low-${randomUUID()}`;
    const highPriorityEventId = `d30-priority-high-${randomUUID()}`;
    const sharedDueAt = new Date().toISOString();
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, priority
          ) VALUES (
            ${lowPriorityEventId}, 'operator_alert', 'telegram', '{}'::jsonb, 'pending', 0, 6,
            ${sharedDueAt}::timestamptz, 0
          )`,
    );
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, priority
          ) VALUES (
            ${highPriorityEventId}, 'auth_email_otp', 'email', '{}'::jsonb, 'pending', 0, 4,
            ${sharedDueAt}::timestamptz, 100
          )`,
    );
    const priorityClaim = await runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs' }, () =>
      claimDueOutgoingDeliveries(db, 1),
    );
    assert(
      priorityClaim.length === 1 && priorityClaim[0]?.eventId === highPriorityEventId,
      `expected the priority-100 row claimed first over the same-instant priority-0 row, got ${JSON.stringify(priorityClaim.map((r) => r.eventId))}`,
    );
    reportPiecePass(
      'piece 4g',
      'a higher-priority row due at the same instant as a lower-priority row is claimed first',
    );

    await closeDb();
    console.log('check-d30-outgoing-delivery-claim-concurrency: PASS');
  } finally {
    disposable.stop();
  }
}

main()
  .then(() => {
    const missing = EXPECTED_PIECES.filter((id) => !passedPieces.has(id));
    assert(
      missing.length === 0,
      `expected all of [${EXPECTED_PIECES.join(', ')}] to report PASS, missing: ${missing.join(', ')} (a piece was skipped, or main() returned before reaching it)`,
    );
  })
  .catch((err) => {
    console.error(
      `check-d30-outgoing-delivery-claim-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });

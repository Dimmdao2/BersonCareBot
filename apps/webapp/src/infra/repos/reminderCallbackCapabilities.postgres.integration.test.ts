import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

type DoneRow = {
  done_at: string;
  first_done_for_occurrence: boolean;
  day_done_count: number;
  day_sent_total: number;
  day_fully_done: boolean;
};

const orgA = randomUUID();
const orgB = randomUUID();
const patientA = randomUUID();
const patientB = randomUUID();
const userA = 810_001;
const userB = 810_002;
const ruleA = `d7-rule-a-${randomUUID()}`;
const ruleB = `d7-rule-b-${randomUUID()}`;
const doneOccurrenceA = `d7-done-a-${randomUUID()}`;
const doneOccurrenceB = `d7-done-b-${randomUUID()}`;
const snoozeOccurrenceA = `d7-snooze-a-${randomUUID()}`;
const skipOccurrenceA = `d7-skip-a-${randomUUID()}`;
const muteOccurrenceA = `d7-mute-a-${randomUUID()}`;
const rollbackOccurrenceA = `d7-rollback-a-${randomUUID()}`;

const fixtureTables = [
  'public.be_organizations',
  'public.org_enrollments',
  'public.reminder_rules',
  'public.reminder_occurrence_history',
  'public.reminder_journal',
  'public.app_runtime_settings',
  'integrator.user_reminder_occurrences',
] as const;

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('D7 signed reminder callback capabilities', () => {
  const pool = getPool();
  let client: PoolClient;
  let signingSecret: string;
  let originalSigningSecret: string | null = null;
  let originalTimezoneSetting: { audience: string; value_json: unknown } | null = null;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  async function setFixtureRls(enabled: boolean): Promise<void> {
    for (const table of fixtureTables) {
      await run(`ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`);
    }
  }

  async function releaseSignedPrincipal(): Promise<void> {
    try {
      await run('SELECT app.release_principal_context()');
    } finally {
      await run('RESET ROLE');
    }
  }

  async function withSignedIntegratorPrincipal<T>(
    input: { organizationId: string; integratorUserId: number },
    operation: () => Promise<T>,
  ): Promise<T> {
    await run('SET ROLE app_patient');
    try {
      const backend = await run<{ backend_pid: number }>('SELECT pg_backend_pid() AS backend_pid');
      const backendPid = backend.rows[0]?.backend_pid;
      if (!backendPid) throw new Error('missing backend pid for signed principal');
      const nonce = `d7-${randomUUID()}`;
      const expiresEpoch = Math.floor(Date.now() / 1000) + 60;
      const canonical = [
        'v1',
        nonce,
        String(backendPid),
        String(expiresEpoch),
        input.organizationId,
        '',
        String(input.integratorUserId),
      ].join('|');
      const signature = createHmac('sha256', signingSecret).update(canonical).digest('hex');
      await run(
        `SELECT app.install_signed_context(
           $1::text, $2::integer, $3::bigint, $4::uuid, NULL::uuid, $5::bigint, $6::text
         )`,
        [nonce, backendPid, expiresEpoch, input.organizationId, input.integratorUserId, signature],
      );
      return await operation();
    } finally {
      await releaseSignedPrincipal();
    }
  }

  async function journalCount(occurrenceId: string, action: string): Promise<number> {
    const result = await run<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.reminder_journal
       WHERE occurrence_id = $1 AND action = $2`,
      [occurrenceId, action],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    await setFixtureRls(false);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    const secret = await run<{ secret: string }>(
      'SELECT secret FROM app.context_signing_secrets WHERE id = true',
    );
    originalSigningSecret = secret.rows[0]?.secret ?? null;
    const disposableSigningSecret = 'd7-disposable-signed-principal-secret-0123456789';
    const installedSecret = await run<{ secret: string }>(
      `INSERT INTO app.context_signing_secrets (id, secret)
       VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret
       RETURNING secret`,
      [disposableSigningSecret],
    );
    signingSecret = installedSecret.rows[0]?.secret ?? '';
    expect(signingSecret.length).toBeGreaterThanOrEqual(32);

    await run(
      `INSERT INTO public.be_organizations (id, title)
       VALUES ($1::uuid, 'D7 A'), ($2::uuid, 'D7 B')`,
      [orgA, orgB],
    );
    await run(
      `INSERT INTO public.platform_users (id, integrator_user_id, display_name)
       VALUES ($1::uuid, $2::bigint, 'D7 actor A'), ($3::uuid, $4::bigint, 'D7 actor B')`,
      [patientA, userA, patientB, userB],
    );
    await run(
      `INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
       VALUES
         ($1::uuid, $2::uuid, 'active'),
         ($3::uuid, $2::uuid, 'active'),
         ($3::uuid, $4::uuid, 'active')`,
      [orgA, patientA, orgB, patientB],
    );
    await run(
      `INSERT INTO public.reminder_rules (
         integrator_rule_id, platform_user_id, integrator_user_id, organization_id, category, is_enabled,
         schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute, days_mask,
         content_mode, notification_topic_code
       ) VALUES
         ($1, $2::uuid, $3::bigint, $4::uuid, 'lfk', true, 'interval_window', 'Europe/Moscow', 60, 480, 1320, '1111111', 'none', 'training_reminders'),
         ($5, $6::uuid, $7::bigint, $8::uuid, 'lfk', true, 'interval_window', 'Europe/Moscow', 60, 480, 1320, '1111111', 'none', 'training_reminders')`,
      [ruleA, patientA, userA, orgA, ruleB, patientB, userB, orgB],
    );
    await run(
      `INSERT INTO public.reminder_occurrence_history (
         integrator_occurrence_id, integrator_rule_id, integrator_user_id, organization_id, category, status, occurred_at
       ) VALUES
         ($1, $2, $3::bigint, $4::uuid, 'lfk', 'sent', '2026-08-02T09:00:00.000Z'),
         ($5, $6, $7::bigint, $8::uuid, 'lfk', 'sent', '2026-08-02T09:10:00.000Z'),
         ($9, $2, $3::bigint, $4::uuid, 'lfk', 'sent', '2026-08-02T09:20:00.000Z'),
         ($10, $2, $3::bigint, $4::uuid, 'lfk', 'sent', '2026-08-02T09:30:00.000Z'),
         ($11, $2, $3::bigint, $4::uuid, 'lfk', 'sent', '2026-08-03T09:40:00.000Z')`,
      [
        doneOccurrenceA,
        ruleA,
        userA,
        orgA,
        doneOccurrenceB,
        ruleB,
        userB,
        orgB,
        snoozeOccurrenceA,
        skipOccurrenceA,
        rollbackOccurrenceA,
      ],
    );
    await run(
      `INSERT INTO integrator.user_reminder_occurrences (
         id, rule_id, occurrence_key, planned_at, status, sent_at, organization_id
       ) VALUES
         ($1::text, $2::text, $3::text, '2026-08-02T09:00:00.000Z'::timestamptz, 'sent', '2026-08-02T09:00:00.000Z'::timestamptz, $4::uuid),
         ($5::text, $6::text, $7::text, '2026-08-02T09:10:00.000Z'::timestamptz, 'sent', '2026-08-02T09:10:00.000Z'::timestamptz, $8::uuid),
         ($9::text, $2::text, $10::text, '2026-08-02T09:20:00.000Z'::timestamptz, 'sent', '2026-08-02T09:20:00.000Z'::timestamptz, $4::uuid),
         ($11::text, $2::text, $12::text, '2026-08-02T09:30:00.000Z'::timestamptz, 'sent', '2026-08-02T09:30:00.000Z'::timestamptz, $4::uuid),
         ($13::text, $2::text, $14::text, statement_timestamp() - interval '1 minute', 'planned', NULL, $4::uuid)`,
      [
        doneOccurrenceA,
        ruleA,
        `d7-key-done-a-${randomUUID()}`,
        orgA,
        doneOccurrenceB,
        ruleB,
        `d7-key-done-b-${randomUUID()}`,
        orgB,
        snoozeOccurrenceA,
        `d7-key-snooze-a-${randomUUID()}`,
        skipOccurrenceA,
        `d7-key-skip-a-${randomUUID()}`,
        muteOccurrenceA,
        `d7-key-mute-a-${randomUUID()}`,
      ],
    );
    const existingTimezone = await run<{ audience: string; value_json: unknown }>(
      `SELECT audience, value_json FROM public.app_runtime_settings
       WHERE key = 'app_display_timezone' AND scope = 'admin' AND organization_id IS NULL`,
    );
    originalTimezoneSetting = existingTimezone.rows[0] ?? null;
    await run(
      `UPDATE public.app_runtime_settings
       SET audience = 'server', value_json = '{"value":"Europe/Moscow"}'::jsonb
       WHERE key = 'app_display_timezone' AND scope = 'admin' AND organization_id IS NULL`,
    );
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    // The private migration harness deliberately does not apply the host-owned P2-B runtime ACL
    // or C4 schema ACL. Keep fixture tables RLS-disabled while exercising the capability's own
    // exact-org predicates, and supply only C4's app_owner schema usage; table grants and
    // SECURITY DEFINER remain assertions below.
    await run('GRANT USAGE ON SCHEMA integrator TO app_owner');
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await setFixtureRls(false);
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM integrator.user_reminder_occurrences WHERE id = ANY($1::text[])', [
      [doneOccurrenceA, doneOccurrenceB, snoozeOccurrenceA, skipOccurrenceA, muteOccurrenceA],
    ]);
    await run('DELETE FROM public.reminder_journal WHERE occurrence_id = ANY($1::text[])', [
      [doneOccurrenceA, doneOccurrenceB, snoozeOccurrenceA, skipOccurrenceA],
    ]);
    await run(
      'DELETE FROM public.reminder_occurrence_history WHERE integrator_occurrence_id = ANY($1::text[])',
      [[doneOccurrenceA, doneOccurrenceB, snoozeOccurrenceA, skipOccurrenceA, rollbackOccurrenceA]],
    );
    await run('DELETE FROM public.reminder_rules WHERE integrator_rule_id = ANY($1::text[])', [
      [ruleA, ruleB],
    ]);
    await run('DELETE FROM public.org_enrollments WHERE platform_user_id = ANY($1::uuid[])', [
      [patientA, patientB],
    ]);
    await run('DELETE FROM public.platform_users WHERE id = ANY($1::uuid[])', [
      [patientA, patientB],
    ]);
    await run('DELETE FROM public.be_organizations WHERE id = ANY($1::uuid[])', [[orgA, orgB]]);
    if (originalSigningSecret === null) {
      await run('DELETE FROM app.context_signing_secrets WHERE id = true');
    } else {
      await run('UPDATE app.context_signing_secrets SET secret = $1 WHERE id = true', [
        originalSigningSecret,
      ]);
    }
    if (originalTimezoneSetting !== null) {
      await run(
        `UPDATE public.app_runtime_settings
         SET audience = $1, value_json = $2::jsonb
         WHERE key = 'app_display_timezone' AND scope = 'admin' AND organization_id IS NULL`,
        [originalTimezoneSetting.audience, JSON.stringify(originalTimezoneSetting.value_json)],
      );
    }
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await setFixtureRls(true);
    client.release();
    await pool.end();
  });

  it('rejects invalid and expired signed callback contexts before canonical state changes', async () => {
    await run('SET ROLE app_patient');
    try {
      const backend = await run<{ backend_pid: number }>('SELECT pg_backend_pid() AS backend_pid');
      const backendPid = backend.rows[0]?.backend_pid;
      if (!backendPid) throw new Error('missing backend pid for invalid signature probe');
      const invalidSignature = run(
        `SELECT app.install_signed_context(
             'd7-invalid-signature'::text, $1::integer, $2::bigint, $3::uuid, NULL::uuid, $4::bigint, repeat('0', 64)
           )`,
        [backendPid, Math.floor(Date.now() / 1000) + 60, orgA, userA],
      );
      await expect(invalidSignature).rejects.toSatisfy((error: unknown) =>
        /bad_signature/.test(errorMessages(error)),
      );
      const expiredContext = run(
        `SELECT app.install_signed_context(
             'd7-expired-context'::text, $1::integer, $2::bigint, $3::uuid, NULL::uuid, $4::bigint, repeat('0', 64)
           )`,
        [backendPid, Math.floor(Date.now() / 1000) - 1, orgA, userA],
      );
      await expect(expiredContext).rejects.toSatisfy((error: unknown) =>
        /expired_context/.test(errorMessages(error)),
      );
      const denied = await run<DoneRow>(
        'SELECT * FROM app.patient_done_reminder_occurrence($1::text)',
        [doneOccurrenceA],
      );
      expect(denied.rows).toEqual([]);
    } finally {
      await releaseSignedPrincipal();
    }
    await expect(journalCount(doneOccurrenceA, 'done')).resolves.toBe(0);
  });

  it('fails closed for an actor/org mismatch without changing the foreign occurrence', async () => {
    const result = await withSignedIntegratorPrincipal(
      { organizationId: orgB, integratorUserId: userA },
      () =>
        run<DoneRow>('SELECT * FROM app.patient_done_reminder_occurrence($1::text)', [
          doneOccurrenceB,
        ]),
    );
    expect(result.rows).toEqual([]);
    await expect(journalCount(doneOccurrenceB, 'done')).resolves.toBe(0);
  });

  it('writes canonical done history exactly once and returns a safe repeat result', async () => {
    const first = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      () =>
        run<DoneRow>('SELECT * FROM app.patient_done_reminder_occurrence($1::text)', [
          doneOccurrenceA,
        ]),
    );
    expect(first.rows[0]).toEqual(
      expect.objectContaining({
        first_done_for_occurrence: true,
        day_sent_total: 3,
        day_done_count: 1,
      }),
    );
    const replay = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      () =>
        run<DoneRow>('SELECT * FROM app.patient_done_reminder_occurrence($1::text)', [
          doneOccurrenceA,
        ]),
    );
    expect(replay.rows[0]).toEqual(
      expect.objectContaining({
        first_done_for_occurrence: false,
        day_sent_total: 3,
        day_done_count: 1,
      }),
    );
    await expect(journalCount(doneOccurrenceA, 'done')).resolves.toBe(1);
    const operational = await run<{ status: string; due_now: boolean }>(
      `SELECT status,
         status = 'planned' AND planned_at <= statement_timestamp() AS due_now
       FROM integrator.user_reminder_occurrences WHERE id = $1::text`,
      [doneOccurrenceA],
    );
    expect(operational.rows).toEqual([{ status: 'sent', due_now: false }]);
  });

  it('changes only the exact-org occurrence for skip', async () => {
    const changed = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      async () => {
        const skip = await run<{ skipped_at: string }>(
          `SELECT * FROM app.patient_skip_reminder_occurrence(NULL::uuid, $1::text, NULL::text)`,
          [skipOccurrenceA],
        );
        const foreign = await run<{ skipped_at: string }>(
          `SELECT * FROM app.patient_skip_reminder_occurrence(NULL::uuid, $1::text, NULL::text)`,
          [doneOccurrenceB],
        );
        return { skip, foreign };
      },
    );
    expect(changed.skip.rows).toHaveLength(1);
    expect(changed.foreign.rows).toEqual([]);
    await expect(journalCount(skipOccurrenceA, 'skipped')).resolves.toBe(1);
    await expect(journalCount(doneOccurrenceB, 'skipped')).resolves.toBe(0);
    const operational = await run<{ status: string; due_now: boolean }>(
      `SELECT status,
         status = 'planned' AND planned_at <= statement_timestamp() AS due_now
       FROM integrator.user_reminder_occurrences WHERE id = $1::text`,
      [skipOccurrenceA],
    );
    expect(operational.rows).toEqual([{ status: 'sent', due_now: false }]);
  });

  it('atomically reschedules exactly the signed snoozed occurrence and never replays it', async () => {
    const first = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      () =>
        run<{ snoozed_until: string }>(
          `SELECT * FROM app.patient_snooze_reminder_occurrence(NULL::uuid, $1::text, 20::integer)`,
          [snoozeOccurrenceA],
        ),
    );
    const snoozedUntil = first.rows[0]?.snoozed_until;
    expect(snoozedUntil).toBeTruthy();

    const changed = await run<{
      history_snoozed_until: string;
      operational_planned_at: string;
      operational_status: string;
      due_now: boolean;
    }>(
      `SELECT
         history.snoozed_until::text AS history_snoozed_until,
         operational.planned_at::text AS operational_planned_at,
         operational.status AS operational_status,
         operational.status = 'planned'
           AND operational.planned_at <= statement_timestamp() AS due_now
       FROM public.reminder_occurrence_history AS history
       INNER JOIN integrator.user_reminder_occurrences AS operational
         ON operational.id = history.integrator_occurrence_id
       WHERE history.integrator_occurrence_id = $1::text`,
      [snoozeOccurrenceA],
    );
    expect(changed.rows[0]).toMatchObject({
      history_snoozed_until: snoozedUntil,
      operational_planned_at: snoozedUntil,
      operational_status: 'planned',
      due_now: false,
    });
    await expect(journalCount(snoozeOccurrenceA, 'snoozed')).resolves.toBe(1);

    const replay = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      () =>
        run<{ snoozed_until: string }>(
          `SELECT * FROM app.patient_snooze_reminder_occurrence(NULL::uuid, $1::text, 20::integer)`,
          [snoozeOccurrenceA],
        ),
    );
    expect(replay.rows).toEqual([{ snoozed_until: snoozedUntil }]);
    await expect(journalCount(snoozeOccurrenceA, 'snoozed')).resolves.toBe(1);

    const foreignOrganization = await withSignedIntegratorPrincipal(
      { organizationId: orgB, integratorUserId: userA },
      () =>
        run<{ snoozed_until: string }>(
          `SELECT * FROM app.patient_snooze_reminder_occurrence(NULL::uuid, $1::text, 20::integer)`,
          [snoozeOccurrenceA],
        ),
    );
    const foreignUser = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userB },
      () =>
        run<{ snoozed_until: string }>(
          `SELECT * FROM app.patient_snooze_reminder_occurrence(NULL::uuid, $1::text, 20::integer)`,
          [snoozeOccurrenceA],
        ),
    );
    expect(foreignOrganization.rows).toEqual([]);
    expect(foreignUser.rows).toEqual([]);
    const unchanged = await run<{ planned_at: string; status: string }>(
      `SELECT planned_at::text AS planned_at, status
       FROM integrator.user_reminder_occurrences WHERE id = $1::text`,
      [snoozeOccurrenceA],
    );
    expect(unchanged.rows).toEqual([{ planned_at: snoozedUntil, status: 'planned' }]);
  });

  it('leaves canonical snooze state absent when its exact operational occurrence is absent', async () => {
    const result = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      () =>
        run<{ snoozed_until: string }>(
          `SELECT * FROM app.patient_snooze_reminder_occurrence(NULL::uuid, $1::text, 20::integer)`,
          [rollbackOccurrenceA],
        ),
    );
    expect(result.rows).toEqual([]);
    const canonical = await run<{ snoozed_until: string | null }>(
      `SELECT snoozed_until::text AS snoozed_until
       FROM public.reminder_occurrence_history
       WHERE integrator_occurrence_id = $1::text`,
      [rollbackOccurrenceA],
    );
    expect(canonical.rows).toEqual([{ snoozed_until: null }]);
    await expect(journalCount(rollbackOccurrenceA, 'snoozed')).resolves.toBe(0);
  });

  it('persists mute and channel-topic settings through canonical public state', async () => {
    const result = await withSignedIntegratorPrincipal(
      { organizationId: orgA, integratorUserId: userA },
      async () => {
        const mute = await run<{ muted_until: string }>(
          `SELECT * FROM app.patient_set_reminder_muted_until('2026-08-03T00:00:00.000Z'::timestamptz)`,
        );
        const topic = await run<{ persisted: boolean }>(
          `SELECT persisted FROM app.patient_disable_reminder_messenger_topic($1::text, 'telegram'::text)`,
          [doneOccurrenceA],
        );
        const toggle = await run<{ new_state: boolean }>(
          `SELECT new_state FROM app.patient_reminder_notification_settings('telegram'::text, 'patient_news'::text)`,
        );
        return { mute, topic, toggle };
      },
    );
    expect(result.mute.rows).toHaveLength(1);
    expect(result.topic.rows).toEqual([{ persisted: true }]);
    expect(result.toggle.rows).toEqual([{ new_state: false }]);
    const canonical = await run<{
      muted_until: string;
      training_enabled: boolean;
      news_enabled: boolean;
    }>(
      `SELECT
         patient.reminder_muted_until::text AS muted_until,
         (SELECT is_enabled FROM public.user_notification_topic_channels
           WHERE user_id = $1::uuid AND topic_code = 'training_reminders' AND channel_code = 'telegram') AS training_enabled,
         (SELECT is_enabled FROM public.user_notification_topic_channels
           WHERE user_id = $1::uuid AND topic_code = 'patient_news' AND channel_code = 'telegram') AS news_enabled
       FROM public.platform_users AS patient
       WHERE patient.id = $1::uuid`,
      [patientA],
    );
    expect(canonical.rows[0]).toMatchObject({ training_enabled: false, news_enabled: false });
    expect(new Date(canonical.rows[0]?.muted_until ?? '').toISOString()).toBe(
      '2026-08-03T00:00:00.000Z',
    );
    const dueWhileMuted = await run<{ due_now: boolean }>(
      `SELECT operational.status = 'planned'
           AND operational.planned_at <= statement_timestamp()
           AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
         AS due_now
       FROM integrator.user_reminder_occurrences AS operational
       INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
       INNER JOIN public.platform_users AS patient ON patient.integrator_user_id = rule.integrator_user_id
       WHERE operational.id = $1::text`,
      [muteOccurrenceA],
    );
    expect(dueWhileMuted.rows).toEqual([{ due_now: false }]);
  });

  it('exposes only SECURITY DEFINER capabilities to app_patient, not PUBLIC or operational tables', async () => {
    const functions = await run<{
      name: string;
      security_definer: boolean;
      owner: string;
      patient_execute: boolean;
      public_execute: boolean;
    }>(
      `SELECT
         procedure.proname AS name,
         procedure.prosecdef AS security_definer,
         owner_role.rolname AS owner,
         has_function_privilege('app_patient', procedure.oid, 'EXECUTE') AS patient_execute,
         has_function_privilege('public', procedure.oid, 'EXECUTE') AS public_execute
       FROM pg_proc AS procedure
       INNER JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       INNER JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
       WHERE namespace.nspname = 'app'
         AND procedure.proname IN (
           'patient_snooze_reminder_occurrence', 'patient_done_reminder_occurrence', 'patient_set_reminder_muted_until',
           'patient_disable_reminder_messenger_topic', 'patient_reminder_notification_settings'
         )
       ORDER BY procedure.proname`,
    );
    expect(functions.rows).toHaveLength(5);
    for (const row of functions.rows) {
      expect(row).toMatchObject({
        security_definer: true,
        owner: 'app_owner',
        patient_execute: true,
        public_execute: false,
      });
    }
    const tableGrants = await run<{
      patient_select: boolean;
      patient_insert: boolean;
      patient_update: boolean;
      patient_delete: boolean;
      public_select: boolean;
      public_insert: boolean;
      public_update: boolean;
      public_delete: boolean;
    }>(
      `SELECT
         has_table_privilege('app_patient', 'integrator.user_reminder_occurrences', 'SELECT') AS patient_select,
         has_table_privilege('app_patient', 'integrator.user_reminder_occurrences', 'INSERT') AS patient_insert,
         has_table_privilege('app_patient', 'integrator.user_reminder_occurrences', 'UPDATE') AS patient_update,
         has_table_privilege('app_patient', 'integrator.user_reminder_occurrences', 'DELETE') AS patient_delete,
         has_table_privilege('public', 'integrator.user_reminder_occurrences', 'SELECT') AS public_select,
         has_table_privilege('public', 'integrator.user_reminder_occurrences', 'INSERT') AS public_insert,
         has_table_privilege('public', 'integrator.user_reminder_occurrences', 'UPDATE') AS public_update,
         has_table_privilege('public', 'integrator.user_reminder_occurrences', 'DELETE') AS public_delete`,
    );
    expect(tableGrants.rows).toEqual([
      {
        patient_select: false,
        patient_insert: false,
        patient_update: false,
        patient_delete: false,
        public_select: false,
        public_insert: false,
        public_update: false,
        public_delete: false,
      },
    ]);
  });
});

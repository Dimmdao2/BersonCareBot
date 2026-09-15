/**
 * Live acceptance proof for the platform-user merge engine on a named DEV/TEST database.
 * Opt-in only: without RUN_PLATFORM_USER_MERGE_DB=1 this file is skipped and never opens a DB.
 *
 * Named expensive and silent failure: two unattributed medical histories are silently merged,
 * making different people's personal medical data one account without an operator noticing.
 * The oracle is AUTH_AND_IDENTITY_CANON.md §18 and plan stage Э1, not the SQL implementation.
 *
 * Run on DEV (the whole proof is one transaction and always ends with ROLLBACK):
 *   sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && \
 *     RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test \
 *     deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENABLED = process.env.RUN_PLATFORM_USER_MERGE_DB === '1';
const DATABASE = process.env.PLATFORM_USER_MERGE_PROOF_DB ?? 'bcb_webapp_dev';
const ALLOWED_DATABASES = new Set(['bcb_webapp_dev', 'bersoncarebot_test']);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const prefix = 'a5e10000-0000-4000-8000-';
const uid = (suffix) => `${prefix}${suffix.padStart(12, '0')}`;
const ORG_A = uid('1');
const ORG_B = uid('2');
const DOCTOR = uid('3');

const manualResolution = (targetId, duplicateId) => ({
  targetId,
  duplicateId,
  fields: {
    phone_normalized: 'target',
    display_name: 'target',
    first_name: 'target',
    last_name: 'target',
    email: 'target',
  },
  bindings: { telegram: 'both', max: 'both', vk: 'both' },
  oauth: {},
  channelPreferences: 'merge',
});

const note = (userId, organizationId, authorId = DOCTOR) => [
  `INSERT INTO doctor_notes (user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid, $2::uuid, $3, $4::uuid, DATE '2026-09-15')`,
  [userId, authorId, `note-${userId.slice(-3)}`, organizationId],
];

const nullOrgNote = (userId, authorId) => [
  `INSERT INTO doctor_notes (user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid, $2::uuid, $3, NULL, DATE '2026-09-15')`,
  [userId, authorId, `note-${userId.slice(-3)}`],
];

const program = (userId, organizationId, source, title) => [
  `INSERT INTO treatment_program_instances
     (patient_user_id, title, assignment_source, status, organization_id)
   VALUES ($1::uuid, $2, $3, 'active', $4::uuid)`,
  [userId, title, source, organizationId],
];

const phoneHistory = (userId, phone) => [
  `INSERT INTO user_phone_history (platform_user_id, phone_normalized, source)
   VALUES ($1::uuid, $2, 'otp')`,
  [userId, phone],
];

const channelPreference = (userId, channel, preferred, updatedAt) => [
  `INSERT INTO user_channel_preferences
     (user_id, platform_user_id, channel_code, is_preferred_for_auth, updated_at)
   VALUES ($1::text, $1::uuid, $2, $3, $4::timestamptz)`,
  [userId, channel, preferred, updatedAt],
];

const nativePush = (userId, installationHash) => [
  `INSERT INTO native_push_targets
     (user_id, app_id, provider, installation_id_hash, token_hash, token_ciphertext, token_key_id)
   VALUES ($1::uuid, 'therapygo', 'fcm', $2, 'shared-token', 'ciphertext', 'key-1')`,
  [userId, installationHash],
];

const openAttemptFixtures = (targetId, duplicateId) => {
  const instanceId = uid('901');
  const stageId = uid('902');
  const itemId = uid('903');
  const targetAttemptId = uid('904');
  const duplicateAttemptId = uid('905');
  const testA = uid('906');
  const testB = uid('907');
  return [
    [
      `INSERT INTO treatment_program_instances
         (id, organization_id, patient_user_id, title, status, assignment_source)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'attempt proof', 'active', 'promo')`,
      [instanceId, ORG_A, targetId],
    ],
    [
      `INSERT INTO treatment_program_instance_stages
         (id, organization_id, instance_id, title, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'proof stage', 'available')`,
      [stageId, ORG_A, instanceId],
    ],
    [
      `INSERT INTO treatment_program_instance_stage_items
         (id, organization_id, stage_id, item_type, item_ref_id, snapshot)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'clinical_test', $4::uuid, '{}'::jsonb)`,
      [itemId, ORG_A, stageId, testA],
    ],
    [
      `INSERT INTO tests (id, owner_kind, organization_id, title)
       VALUES ($1::uuid, 'organization', $3::uuid, 'proof test A'),
              ($2::uuid, 'organization', $3::uuid, 'proof test B')`,
      [testA, testB, ORG_A],
    ],
    [
      `INSERT INTO test_attempts (id, organization_id, instance_stage_item_id, patient_user_id)
       VALUES ($1::uuid, $3::uuid, $4::uuid, $5::uuid),
              ($2::uuid, $3::uuid, $4::uuid, $6::uuid)`,
      [targetAttemptId, duplicateAttemptId, ORG_A, itemId, targetId, duplicateId],
    ],
    [
      `INSERT INTO test_results
         (organization_id, attempt_id, test_id, raw_value, normalized_decision)
       VALUES ($1::uuid, $2::uuid, $4::uuid, '{"source":"target"}'::jsonb, 'passed'),
              ($1::uuid, $3::uuid, $5::uuid, '{"source":"duplicate"}'::jsonb, 'partial')`,
      [ORG_A, targetAttemptId, duplicateAttemptId, testA, testB],
    ],
  ];
};

const scenarios = [
  {
    name: 'same-organization doctor notes block automatic merge',
    pair: ['101', '102'],
    expected: 'block',
    fixtures: (targetId, duplicateId) => [
      note(targetId, ORG_A),
      note(duplicateId, ORG_A, uid('4')),
    ],
  },
  {
    name: 'different-organization doctor notes merge',
    pair: ['103', '104'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      note(targetId, ORG_A),
      note(duplicateId, ORG_B, uid('4')),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS target_count,
                count(*) FILTER (WHERE user_id = $2::uuid)::int AS duplicate_count
           FROM doctor_notes
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { target_count: 2, duplicate_count: 0 });
    },
  },
  {
    name: 'two unattributed medical histories block automatic merge',
    pair: ['105', '106'],
    expected: 'block',
    fixtures: (targetId, duplicateId) => [
      nullOrgNote(targetId, DOCTOR),
      nullOrgNote(duplicateId, uid('4')),
    ],
  },
  {
    name: 'manual merge consolidates same-author same-day doctor notes',
    pair: ['107', '108'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [note(targetId, ORG_A), note(duplicateId, ORG_A)],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT user_id::text, text
           FROM doctor_notes
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId]],
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].user_id, targetId);
      assert.match(result.rows[0].text, /note-107/u);
      assert.match(result.rows[0].text, /note-108/u);
    },
  },
  {
    name: 'cross-organization active programs keep their organization boundary',
    pair: ['109', '110'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      program(targetId, ORG_A, 'promo', 'org-a-promo'),
      program(duplicateId, ORG_B, 'doctor', 'org-b-doctor'),
    ],
    verify: async (query, targetId) => {
      const result = await query(
        `SELECT organization_id::text, status
           FROM treatment_program_instances
          WHERE patient_user_id = $1::uuid
          ORDER BY organization_id`,
        [targetId],
      );
      assert.deepEqual(result.rows, [
        { organization_id: ORG_A, status: 'active' },
        { organization_id: ORG_B, status: 'active' },
      ]);
    },
  },
  {
    name: 'canonical cross-organization notes merge with two active phone histories',
    pair: ['111', '112'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      note(targetId, ORG_A),
      note(duplicateId, ORG_B, uid('4')),
      phoneHistory(targetId, '+79995000111'),
      phoneHistory(duplicateId, '+79995000112'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const history = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE valid_to IS NULL)::int AS active,
                count(*) FILTER (WHERE platform_user_id = $2::uuid)::int AS duplicate_rows
           FROM user_phone_history
          WHERE platform_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(history.rows[0], { total: 2, active: 1, duplicate_rows: 0 });
      const merged = await query(
        'SELECT merged_into_id::text FROM platform_users WHERE id = $1::uuid',
        [duplicateId],
      );
      assert.equal(merged.rows[0]?.merged_into_id, targetId);
    },
  },
  {
    name: 'manual merge keeps one preferred auth channel across different channels',
    pair: ['113', '114'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      channelPreference(targetId, 'telegram', true, '2026-09-14T00:00:00Z'),
      channelPreference(duplicateId, 'max', true, '2026-09-15T00:00:00Z'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_preferred_for_auth)::int AS preferred,
                max(channel_code) FILTER (WHERE is_preferred_for_auth) AS preferred_channel,
                count(*) FILTER (WHERE user_id = $2::text OR platform_user_id = $2::uuid)::int
                  AS duplicate_rows
           FROM user_channel_preferences
          WHERE user_id = ANY($1::text[]) OR platform_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], {
        total: 2,
        preferred: 1,
        preferred_channel: 'max',
        duplicate_rows: 0,
      });
    },
  },
  {
    name: 'manual merge deduplicates the same native push token',
    pair: ['115', '116'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      nativePush(targetId, 'target-installation'),
      nativePush(duplicateId, 'duplicate-installation'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE user_id = $2::uuid)::int AS duplicate_rows
           FROM native_push_targets
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { total: 1, duplicate_rows: 0 });
    },
  },
  {
    name: 'manual merge consolidates colliding open test attempts without losing results',
    pair: ['117', '118'],
    expected: 'merge',
    reason: 'manual',
    fixtures: openAttemptFixtures,
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(DISTINCT attempt.id)::int AS attempts,
                count(result.id)::int AS results,
                count(*) FILTER (WHERE attempt.patient_user_id = $2::uuid)::int AS duplicate_rows
           FROM test_attempts attempt
           LEFT JOIN test_results result ON result.attempt_id = attempt.id
          WHERE attempt.patient_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { attempts: 1, results: 2, duplicate_rows: 0 });
    },
  },
  {
    name: 'manual merge reconciles same-organization active doctor programs',
    pair: ['119', '120'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      program(targetId, ORG_A, 'doctor', 'target-doctor-program'),
      program(duplicateId, ORG_A, 'doctor', 'duplicate-doctor-program'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT array_agg(status ORDER BY status)::text[] AS statuses,
                count(*) FILTER (WHERE patient_user_id = $2::uuid)::int AS duplicate_rows
           FROM treatment_program_instances
          WHERE patient_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], {
        statuses: ['active', 'completed'],
        duplicate_rows: 0,
      });
    },
  },
];

test(
  'live PostgreSQL enforces the organization merge gate and completes collision-prone transfers',
  { skip: !ENABLED },
  async () => {
    assert.ok(ALLOWED_DATABASES.has(DATABASE), `refusing to run merge proof on ${DATABASE}`);

    const pgPath = path.join(repoRoot, 'apps', 'webapp', 'node_modules', 'pg', 'lib', 'index.js');
    const mergePath = path.join(
      repoRoot,
      'packages',
      'platform-merge',
      'src',
      'pgPlatformUserMerge.ts',
    );
    const [{ default: pg }, { mergePlatformUsersInTransaction }] = await Promise.all([
      import(pathToFileURL(pgPath).href),
      import(pathToFileURL(mergePath).href),
    ]);

    if (typeof process.setuid === 'function' && process.getuid?.() === 0) {
      process.setgid('postgres');
      process.setuid('postgres');
    }

    const client = new pg.Client({
      host: '/var/run/postgresql',
      port: 5432,
      database: DATABASE,
      user: 'postgres',
    });
    await client.connect();
    const query = (text, values) => client.query(text, values);
    const results = [];
    let residualRows = -1;

    await query('BEGIN');
    try {
      await query("SELECT pg_advisory_xact_lock(hashtext('platform-user-merge-dev-proof'))");
      const index = await query(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'uq_treatment_program_instances_one_active_per_patient'`,
      );
      if (!index.rows[0]?.indexdef.includes('(organization_id, patient_user_id)')) {
        await query('DROP INDEX public.uq_treatment_program_instances_one_active_per_patient');
        await query(
          `CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient
             ON public.treatment_program_instances (organization_id, patient_user_id)
             NULLS NOT DISTINCT
          WHERE status = 'active'::text`,
        );
      }

      await query(
        `INSERT INTO be_organizations (id, title)
         VALUES ($1::uuid, 'merge proof org A'), ($2::uuid, 'merge proof org B')`,
        [ORG_A, ORG_B],
      );
      await query(
        `INSERT INTO platform_users (id, display_name, role)
         VALUES ($1::uuid, 'merge proof doctor A', 'doctor'),
                ($2::uuid, 'merge proof doctor B', 'doctor')`,
        [DOCTOR, uid('4')],
      );

      for (const scenario of scenarios) {
        const targetId = uid(scenario.pair[0]);
        const duplicateId = uid(scenario.pair[1]);
        await query('SAVEPOINT scenario');
        let actual = 'merge';
        let detail = '';
        try {
          await query(
            `INSERT INTO platform_users (id, display_name, role)
             VALUES ($1::uuid, $3, 'client'), ($2::uuid, $4, 'client')`,
            [targetId, duplicateId, `target-${scenario.pair[0]}`, `duplicate-${scenario.pair[1]}`],
          );
          for (const [sql, values] of scenario.fixtures(targetId, duplicateId)) {
            await query(sql, values);
          }
          try {
            await mergePlatformUsersInTransaction(
              client,
              targetId,
              duplicateId,
              scenario.reason ?? 'phone_bind',
              scenario.reason === 'manual'
                ? { resolution: manualResolution(targetId, duplicateId) }
                : undefined,
            );
          } catch (error) {
            if (
              error?.name === 'MergeConflictError' ||
              error?.name === 'MergeDependentConflictError'
            ) {
              actual = 'block';
            } else {
              actual = 'crash';
            }
            detail = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
          }
          if (actual === 'merge' && scenario.verify) {
            await scenario.verify(query, targetId, duplicateId);
          }
          assert.equal(actual, scenario.expected, detail || scenario.name);
          results.push(`PASS ${scenario.name}`);
        } catch (error) {
          results.push(`FAIL ${scenario.name}: ${error?.message ?? String(error)}`);
        } finally {
          await query('ROLLBACK TO SAVEPOINT scenario');
        }
      }
    } finally {
      await query('ROLLBACK');
      const residual = await query(
        `SELECT (
           (SELECT count(*) FROM platform_users WHERE id::text LIKE $1) +
           (SELECT count(*) FROM be_organizations WHERE id::text LIKE $1) +
           (SELECT count(*) FROM doctor_notes WHERE user_id::text LIKE $1) +
           (SELECT count(*) FROM user_phone_history WHERE platform_user_id::text LIKE $1) +
           (SELECT count(*) FROM treatment_program_instances WHERE patient_user_id::text LIKE $1)
         )::int AS count`,
        [`${prefix}%`],
      );
      residualRows = residual.rows[0]?.count ?? -1;
      await client.end();
    }

    for (const result of results) console.log(result);
    const failures = results.filter((result) => result.startsWith('FAIL'));
    assert.deepEqual(failures, [], failures.join('\n'));
    assert.equal(residualRows, 0, `ROLLBACK left ${residualRows} proof rows`);
    console.log(
      `proof_status=PASS scenarios=${results.length} rollback=complete residual_rows=${residualRows}`,
    );
  },
);

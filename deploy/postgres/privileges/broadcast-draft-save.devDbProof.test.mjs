/**
 * Живое rollback-only доказательство tenant-owned черновиков рассылки на именованной DEV-базе.
 * Opt-in: без RUN_BROADCAST_DRAFT_SAVE_DB=1 файл пропускается и в CI к БД не ходит.
 *
 * Oracle: owner walkthrough 2026-08-23 — «Сохранить черновик отвечает 500»; решение круга 2
 * закрепляет владельца строки как пару «врач + клиника».
 *
 * Поломки, которые ловит:
 *   1. снят backfill — legacy NULL-строки не получают единственную клинику или не удаляются;
 *   2. снят NOT NULL — новый код снова может оставить невидимый и несохраняемый NULL-черновик;
 *   3. ослаблена арендная политика — клиника читает черновик другой клиники.
 *
 * Кандидатная миграция исполняется из своего файла под теми же owner/backfill-классами, а
 * кандидатный INSERT-грант ставится внутри одной DEV-транзакции. В конце всегда ROLLBACK.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseOwnerStatements } from './migrate-local-parse.mjs';

const ENABLED = process.env.RUN_BROADCAST_DRAFT_SAVE_DB === '1';
const DATABASE = process.env.BROADCAST_DRAFT_SAVE_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.BROADCAST_DRAFT_SAVE_FAULT ?? '';
const PROOF_PREFIX = '# bcb broadcast draft rollback proof 20260823 round2';
const MIGRATION_TAG = '20260823T021426_broadcast_drafts_belong_to_doctor_and_clinic';
const MIGRATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../../apps/webapp/db/drizzle-migrations/${MIGRATION_TAG}.sql`,
);

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!['', 'omit-backfill', 'omit-not-null', 'weaken-org-policy'].includes(FAULT)) {
  throw new Error(`unknown BROADCAST_DRAFT_SAVE_FAULT '${FAULT}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

function answers(output) {
  return new Map(output.split('\n').filter((line) => line.includes('=')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function oneRow(sql, what) {
  const value = psql(sql);
  assert.notEqual(value, '', `${DATABASE}: нет фикстуры — ${what}`);
  return value.split('|');
}

function checkedUuid(value, what) {
  assert.match(value, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu, what);
  return value;
}

function fixture() {
  const fixtureColumns = oneRow(`
WITH single_membership AS (
  SELECT membership.platform_user_id,
         (array_agg(membership.organization_id ORDER BY membership.organization_id))[1]
           AS organization_id
  FROM public.be_organization_members AS membership
  WHERE membership.status = 'active'
  GROUP BY membership.platform_user_id
  HAVING count(*) = 1
), candidates AS (
  SELECT membership.platform_user_id,
         membership.organization_id,
         ref.opaque_ref AS actor_ref
  FROM single_membership AS membership
  JOIN app_ext.variant_a_identity_refs AS ref
    ON ref.physical_user_id = membership.platform_user_id
   AND ref.ref_kind = 'actor'
)
SELECT primary_actor.platform_user_id || '|' || primary_actor.organization_id || '|'
       || primary_actor.actor_ref || '|' || ambiguous_actor.platform_user_id || '|'
       || ambiguous_actor.organization_id || '|' || primary_foreign.id || '|'
       || ambiguous_foreign.id
FROM candidates AS primary_actor
JOIN LATERAL (
  SELECT candidate.*
  FROM candidates AS candidate
  WHERE candidate.platform_user_id <> primary_actor.platform_user_id
  ORDER BY candidate.platform_user_id
  LIMIT 1
) AS ambiguous_actor ON true
JOIN LATERAL (
  SELECT organization.id
  FROM public.be_organizations AS organization
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.be_organization_members AS membership
    WHERE membership.platform_user_id = primary_actor.platform_user_id
      AND membership.organization_id = organization.id
  )
  ORDER BY organization.id
  LIMIT 1
) AS primary_foreign ON true
JOIN LATERAL (
  SELECT organization.id
  FROM public.be_organizations AS organization
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.be_organization_members AS membership
    WHERE membership.platform_user_id = ambiguous_actor.platform_user_id
      AND membership.organization_id = organization.id
  )
  ORDER BY organization.id
  LIMIT 1
) AS ambiguous_foreign ON true
ORDER BY primary_actor.platform_user_id
LIMIT 1;`, 'два сотрудника с одной активной клиникой и доступные вторые клиники');

  const [capabilityId, login, argsHash] = oneRow(`
SELECT capability.capability_id || '|' || capability.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex')
FROM app_ext.port_context_capabilities AS capability
WHERE capability.context_class = 'staff'
  AND capability.target_role = 'app_staff'
  AND capability.purpose = 'relation'
  AND capability.function_identity IS NULL
ORDER BY capability.session_login
LIMIT 1;`, 'relation capability webapp staff-порта');

  assert.equal(fixtureColumns.length, 7, 'invalid broadcast draft fixture shape');
  assert.match(login, /^[a-z_][a-z0-9_]*$/u, `unsafe login '${login}'`);
  assert.match(argsHash, /^[0-9a-f]{64}$/u, 'invalid empty-args hash');
  return {
    doctorUserId: checkedUuid(fixtureColumns[0], 'invalid primary doctor user id'),
    organizationA: checkedUuid(fixtureColumns[1], 'invalid primary organization id'),
    actorRef: checkedUuid(fixtureColumns[2], 'invalid primary actor ref'),
    ambiguousDoctorUserId: checkedUuid(fixtureColumns[3], 'invalid ambiguous doctor user id'),
    ambiguousOrganizationA: checkedUuid(fixtureColumns[4], 'invalid ambiguous organization id'),
    organizationB: checkedUuid(fixtureColumns[5], 'invalid primary second organization id'),
    ambiguousOrganizationB: checkedUuid(fixtureColumns[6], 'invalid ambiguous second organization id'),
    zeroMembershipDoctorUserId: 'bcb00000-0000-4000-8000-000000000023',
    capabilityId: checkedUuid(capabilityId, 'invalid capability id'),
    login,
    argsHash,
  };
}

function candidateMigrationSql() {
  const source = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const parsed = parseOwnerStatements(source, MIGRATION_TAG);
  const selected = parsed.filter((statement) => {
    if (FAULT === 'omit-backfill' && statement.backfill) return false;
    if (FAULT === 'omit-not-null' && statement.sql.includes('SET NOT NULL')) return false;
    return true;
  });
  if (FAULT === 'omit-backfill') assert.ok(selected.length < parsed.length, 'backfill fault did not apply');
  if (FAULT === 'omit-not-null') assert.ok(selected.length < parsed.length, 'NOT NULL fault did not apply');
  return selected.map((statement) => statement.backfill
    ? `RESET ROLE;\nRESET SESSION AUTHORIZATION;\n${statement.sql}`
    : `RESET SESSION AUTHORIZATION;\nSET LOCAL ROLE ${statement.owner};\n${statement.sql}\nRESET ROLE;`)
    .join('\n');
}

function clearContext() {
  return `RESET SESSION AUTHORIZATION;
DELETE FROM app_ext.accepted_port_contexts
WHERE backend_pid = pg_backend_pid()
  AND transaction_id = pg_current_xact_id()
  AND cleared_at IS NULL;`;
}

function installContext(f, organizationId) {
  return `SET LOCAL SESSION AUTHORIZATION ${f.login};
SELECT app.begin_port_context(
  '${f.capabilityId}'::uuid,
  ROW(
    1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
    NULL::regprocedure, decode('${f.argsHash}', 'hex'), '${f.actorRef}'::uuid,
    NULL::uuid, '${organizationId}'::uuid, NULL::bigint, NULL::uuid
  )::app.port_context_claims
);`;
}

function saveSql(f, title) {
  return `INSERT INTO public.broadcast_drafts
  (doctor_user_id, organization_id, category, audience, channels, title, body,
   media_url, media_type, updated_at)
VALUES (
  '${f.doctorUserId}'::uuid, app.current_org_id(), NULL, NULL, '[]'::jsonb,
  '${title}', 'rollback-only', NULL, NULL, now()
)
ON CONFLICT (doctor_user_id, organization_id)
DO UPDATE SET
  category = EXCLUDED.category,
  audience = EXCLUDED.audience,
  channels = EXCLUDED.channels,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  media_url = EXCLUDED.media_url,
  media_type = EXCLUDED.media_type,
  updated_at = now();`;
}

test('миграция и production-shape upsert сохраняют отдельный черновик врача в каждой клинике',
  { skip: !ENABLED }, () => {
    const f = fixture();
    const seen = answers(psql(`
BEGIN;
DELETE FROM public.broadcast_drafts
WHERE doctor_user_id IN (
  '${f.doctorUserId}'::uuid,
  '${f.ambiguousDoctorUserId}'::uuid,
  '${f.zeroMembershipDoctorUserId}'::uuid
);
INSERT INTO public.broadcast_drafts (doctor_user_id, organization_id, title, body)
VALUES
  ('${f.doctorUserId}'::uuid, NULL, '${PROOF_PREFIX} legacy-one', 'rollback-only'),
  ('${f.ambiguousDoctorUserId}'::uuid, NULL, '${PROOF_PREFIX} legacy-many', 'rollback-only'),
  ('${f.zeroMembershipDoctorUserId}'::uuid, NULL, '${PROOF_PREFIX} legacy-zero', 'rollback-only');
INSERT INTO public.be_organization_members
  (organization_id, platform_user_id, role, status)
VALUES
  ('${f.ambiguousOrganizationB}'::uuid, '${f.ambiguousDoctorUserId}'::uuid, 'doctor', 'active');

${candidateMigrationSql()}

SELECT 'legacy_backfilled=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid
  AND organization_id = '${f.organizationA}'::uuid;
SELECT 'ambiguous_removed=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.ambiguousDoctorUserId}'::uuid;
SELECT 'zero_removed=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.zeroMembershipDoctorUserId}'::uuid;
SELECT 'null_rows=' || count(*)
FROM public.broadcast_drafts
WHERE organization_id IS NULL;
SELECT 'not_null=' || attnotnull
FROM pg_catalog.pg_attribute
WHERE attrelid = 'public.broadcast_drafts'::regclass
  AND attname = 'organization_id'
  AND NOT attisdropped;
SELECT 'composite_key=' || EXISTS (
  SELECT 1
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.broadcast_drafts'::regclass
    AND conname = 'broadcast_drafts_doctor_user_id_organization_id_key'
    AND contype = 'u'
);
SELECT 'old_key=' || EXISTS (
  SELECT 1
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.broadcast_drafts'::regclass
    AND conname = 'broadcast_drafts_doctor_user_id_key'
);

INSERT INTO public.be_organization_members
  (organization_id, platform_user_id, role, status)
VALUES ('${f.organizationB}'::uuid, '${f.doctorUserId}'::uuid, 'doctor', 'active');
GRANT INSERT (organization_id) ON TABLE public.broadcast_drafts TO app_staff;
${FAULT === 'weaken-org-policy' ? `ALTER POLICY rev10_saas_org_dormant_p0_8_3
  ON public.broadcast_drafts USING (true) WITH CHECK (true);` : ''}
SELECT set_config('bcb.proof_clinic_a_id', id::text, true)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid
  AND organization_id = '${f.organizationA}'::uuid;

${installContext(f, f.organizationA)}
${saveSql(f, `${PROOF_PREFIX} clinic-a-first`)}
${saveSql(f, `${PROOF_PREFIX} clinic-a-second`)}
SELECT 'clinic_a_repeat=' || count(*) || '|' || min(title) || '|'
       || bool_and(id::text = current_setting('bcb.proof_clinic_a_id'))
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
${clearContext()}

${installContext(f, f.organizationB)}
SELECT 'foreign_before=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
${saveSql(f, `${PROOF_PREFIX} clinic-b-first`)}
SELECT 'clinic_b_read=' || count(*) || '|' || min(title)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
${clearContext()}

${installContext(f, f.organizationA)}
SELECT 'clinic_a_read=' || count(*) || '|' || min(title)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
${clearContext()}

SELECT 'physical_rows=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
SELECT 'clinic_a_untouched=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid
  AND organization_id = '${f.organizationA}'::uuid
  AND title = '${PROOF_PREFIX} clinic-a-second'
  AND id::text = current_setting('bcb.proof_clinic_a_id');
SELECT 'clinic_b_created=' || count(*)
FROM public.broadcast_drafts
WHERE doctor_user_id = '${f.doctorUserId}'::uuid
  AND organization_id = '${f.organizationB}'::uuid
  AND title = '${PROOF_PREFIX} clinic-b-first';
ROLLBACK;
`));

    assert.equal(seen.get('legacy_backfilled'), '1');
    assert.equal(seen.get('ambiguous_removed'), '0');
    assert.equal(seen.get('zero_removed'), '0');
    assert.equal(seen.get('null_rows'), '0');
    assert.equal(seen.get('not_null'), 'true');
    assert.equal(seen.get('composite_key'), 'true');
    assert.equal(seen.get('old_key'), 'false');
    assert.equal(seen.get('clinic_a_repeat'), `1|${PROOF_PREFIX} clinic-a-second|true`);
    assert.equal(seen.get('foreign_before'), '0');
    assert.equal(seen.get('clinic_b_read'), `1|${PROOF_PREFIX} clinic-b-first`);
    assert.equal(seen.get('clinic_a_read'), `1|${PROOF_PREFIX} clinic-a-second`);
    assert.equal(seen.get('physical_rows'), '2');
    assert.equal(seen.get('clinic_a_untouched'), '1');
    assert.equal(seen.get('clinic_b_created'), '1');
  });

test('rollback не оставляет данных, прав или кандидатной схемы', { skip: !ENABLED }, () => {
  const seen = answers(psql(`
SELECT 'proof_rows=' || count(*)
FROM public.broadcast_drafts
WHERE title LIKE '${PROOF_PREFIX}%';
SELECT 'candidate_grant=' || has_column_privilege(
  'app_staff', 'public.broadcast_drafts', 'organization_id', 'INSERT'
);
SELECT 'live_not_null=' || attnotnull
FROM pg_catalog.pg_attribute
WHERE attrelid = 'public.broadcast_drafts'::regclass
  AND attname = 'organization_id'
  AND NOT attisdropped;
SELECT 'live_old_key=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.broadcast_drafts'::regclass
    AND conname = 'broadcast_drafts_doctor_user_id_key'
);
SELECT 'live_composite_key=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.broadcast_drafts'::regclass
    AND conname = 'broadcast_drafts_doctor_user_id_organization_id_key'
);`));
  assert.equal(seen.get('proof_rows'), '0');
  assert.equal(seen.get('candidate_grant'), 'false');
  assert.equal(seen.get('live_not_null'), 'false');
  assert.equal(seen.get('live_old_key'), 'true');
  assert.equal(seen.get('live_composite_key'), 'false');
});

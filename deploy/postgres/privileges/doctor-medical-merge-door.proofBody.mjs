/**
 * Живое доказательство: врач нажимает «Слить» на медицинском конфликте, и слияние проходит целиком
 * под НАСТОЯЩЕЙ рантайм-ролью врача, без единого `permission denied`.
 *
 * Тело proof'а. Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`:
 * ему нужен процесс от OS-пользователя `postgres` (peer-сокет), потому что кандидатная миграция и
 * кандидатные права ставятся в ТОЙ ЖЕ транзакции, в которой затем работает роль врача, а сама
 * транзакция всегда заканчивается `ROLLBACK`. Ничего не коммитится, ledger миграций не трогается.
 *
 * Ловит уже случившийся отказ D2/E1: идентификационно-аутентификационная часть переноса выполняется
 * вне двери `SECURITY DEFINER`, и «Слить» падает на `permission denied for table
 * user_password_credentials` — молча для журнала и дорого для врача, потому что конфликт остаётся
 * неразобранным, а пациент — раздвоенным.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { mergePlatformUsersInTransaction } from '@bersoncare/platform-merge';

const REPO = process.env.BCB_PROOF_REPO;
const DB = 'bcb_webapp_dev';
const MIGRATION = path.join(
  REPO,
  'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql',
);
const PRIVILEGES = path.join(REPO, 'deploy/postgres/generated', `privileges.${DB}.sql`);
const SEAM = 'app_seam_identity_lookup_owner';
const FAULT = process.env.BCB_PROOF_FAULT ?? '';
if (!['', 'privilege'].includes(FAULT)) throw new Error(`unknown BCB_PROOF_FAULT '${FAULT}'`);

const TARGET = '00000000-0000-4000-8000-00000000e1a1';
const DUPLICATE = '00000000-0000-4000-8000-00000000e1a2';
const CONFLICT = '00000000-0000-4000-8000-00000000e1c1';

function migrationBlocks() {
  let source = fs.readFileSync(MIGRATION, 'utf8');
  return source.split('--> statement-breakpoint').map((block) => {
    const owner = /--\s*BCB-MIGRATION-OWNER:\s*([a-z_0-9]+)/u.exec(block)?.[1];
    if (!owner) throw new Error('migration block without an owner header');
    return { owner, sql: block };
  });
}

async function alreadyGrantedPolicies() {
  const rows = await client.query(
    `SELECT pg_catalog.format('%I.%I', n.nspname, c.relname) || '|' || p.polname AS key
       FROM pg_catalog.pg_policy AS p
       JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE $1::regrole = ANY (p.polroles)`,
    [SEAM],
  );
  return new Set(rows.rows.map((row) => row.key));
}

function candidatePrivilegeStatements(installed) {
  const lines = fs.readFileSync(PRIVILEGES, 'utf8').split('\n');
  const out = [];
  const grantRe = new RegExp(`^GRANT .* TO "${SEAM}";$`, 'u');
  const newDoors =
    /^GRANT EXECUTE ON FUNCTION app\.(record_patient_medical_merge_conflict|transfer_staff_approved_platform_user_merge_data|read_staff_patient_medical_merge_conflict|refuse_staff_patient_medical_merge_conflict|resolve_platform_patient_medical_merge_conflicts)\(/u;
  const policyRe = /^CREATE POLICY "([^"]+)" ON ("[^"]+"\."[^"]+")/u;
  for (const raw of lines) {
    const line = raw.trim();
    if (grantRe.test(line) || newDoors.test(line)) {
      out.push(line);
      continue;
    }
    if (line.startsWith('CREATE POLICY ') && line.includes(SEAM)) {
      const m = policyRe.exec(line);
      if (!m) throw new Error(`unparsed policy: ${line.slice(0, 80)}`);
      // Only move DEV forward where the candidate actually adds this seam owner to a wall.
      // Reinstalling every policy from the artifact would also drag in unrelated pending
      // declaration changes and break contexts this proof does not own.
      const key = `${m[2].replaceAll('"', '')}|${m[1]}`;
      if (installed.has(key)) continue;
      out.push(`DROP POLICY IF EXISTS "${m[1]}" ON ${m[2]};`);
      out.push(line);
    }
  }
  return out;
}

const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: DB });
const log = [];
function say(line) {
  log.push(line);
  process.stdout.write(`${line}\n`);
}

async function main() {
  await client.connect();
  const who = await client.query('SELECT current_database() AS db, current_user AS who');
  if (who.rows[0].db !== DB) throw new Error(`refusing to run against ${who.rows[0].db}`);
  say(`connected: db=${who.rows[0].db} as=${who.rows[0].who}`);

  await client.query('BEGIN');
  try {
    // --- candidate migration, owner-ordered, inside the rollback-only transaction ---
    await client.query(`GRANT CREATE ON SCHEMA app, app_ext TO ${SEAM}`);
    await client.query(`GRANT USAGE ON LANGUAGE plpgsql, sql TO ${SEAM}`);
    const blocks = migrationBlocks();
    for (const block of blocks) {
      await client.query(`SET LOCAL ROLE ${block.owner}`);
      await client.query(block.sql);
      await client.query('RESET ROLE');
    }
    say(`candidate migration applied: ${blocks.length} owner-ordered blocks`);

    const privileges = candidatePrivilegeStatements(await alreadyGrantedPolicies());
    for (const statement of privileges) await client.query(statement);
    say(`candidate privileges applied: ${privileges.length} generated statements`);
    if (FAULT === 'privilege') {
      // Blind fault: take one declared table away from the door owner. A proof that stays green
      // here is not proving anything about privileges.
      await client.query(`REVOKE ALL ON TABLE public.user_password_credentials FROM ${SEAM}`);
      say('FAULT INJECTED: user_password_credentials revoked from the door owner');
    }

    // --- fixture: one clinic, its doctor, two patient accounts with a real medical conflict ---
    const fixture = await client.query(`
      WITH actor AS (
        SELECT membership.platform_user_id, membership.organization_id, ref.opaque_ref
        FROM public.be_organization_members AS membership
        JOIN app_ext.variant_a_identity_refs AS ref
          ON ref.physical_user_id = membership.platform_user_id AND ref.ref_kind = 'actor'
        WHERE membership.status = 'active'
          AND EXISTS (SELECT 1 FROM public.org_enrollments AS enrollment
                       WHERE enrollment.organization_id = membership.organization_id
                         AND enrollment.status IN ('active', 'archived'))
        ORDER BY membership.platform_user_id, membership.organization_id
        LIMIT 1
      ), capability AS (
        SELECT capability_id, session_login
        FROM app_ext.port_context_capabilities
        WHERE context_class = 'staff' AND target_role = 'app_staff'
          AND purpose = 'relation' AND function_identity IS NULL
        ORDER BY session_login
        LIMIT 1
      )
      SELECT actor.platform_user_id::text AS staff_id, actor.organization_id::text AS org_id,
             actor.opaque_ref::text AS actor_ref, capability.capability_id::text AS capability_id,
             capability.session_login::text AS login,
             encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') AS args_hash
      FROM actor CROSS JOIN capability`);
    const f = fixture.rows[0];
    if (!f) throw new Error('DEV has no active clinic member with an actor ref');
    say(`fixture clinic=${f.org_id} doctor=${f.staff_id} login=${f.login}`);

    for (const [id, name] of [
      [TARGET, 'E1 proof canonical'],
      [DUPLICATE, 'E1 proof duplicate'],
    ]) {
      await client.query(
        `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'client')`,
        [id, name],
      );
      await client.query(
        `INSERT INTO public.org_enrollments(organization_id, platform_user_id, status)
         VALUES ($1::uuid, $2::uuid, 'active')`,
        [f.org_id, id],
      );
      // Qualifying medical history on BOTH sides in the SAME clinic == the real blocker.
      await client.query(
        `INSERT INTO public.clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id)
         VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`,
        [id, f.staff_id, f.org_id],
      );
      // Identity/auth rows: the tables app_staff must never be able to touch.
      await client.query(
        `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-e1-proof')`,
        [id],
      );
      await client.query(
        `INSERT INTO public.email_send_cooldowns(user_id, email_normalized, last_sent_at)
         VALUES ($1::uuid, 'e1-proof@example.test', now())`,
        [id],
      );
      await client.query(
        `INSERT INTO public.user_channel_preferences(user_id, platform_user_id, channel_code, is_preferred_for_auth)
         VALUES ($1::text, $1::uuid, 'telegram', true)`,
        [id],
      );
    }
    await client.query(
      `INSERT INTO public.patient_merge_candidates(id, organization_id, anchor_user_id, candidate_user_id, reason, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:projection', 'pending')`,
      [CONFLICT, f.org_id, TARGET, DUPLICATE],
    );
    say('fixture rows inserted (2 accounts, clinical history on both sides, pending conflict)');

    // --- the doctor runtime role, exactly as the webapp opens it ---
    await client.query(`SET LOCAL SESSION AUTHORIZATION ${f.login}`);
    await client.query(
      `SELECT app.begin_port_context($1::uuid,
         ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
             NULL::regprocedure, decode($2, 'hex'), $3::uuid, NULL::uuid, $4::uuid,
             NULL::bigint, NULL::uuid)::app.port_context_claims)`,
      [f.capability_id, f.args_hash, f.actor_ref, f.org_id],
    );
    const runtime = await client.query(
      `SELECT session_user AS login, current_user AS role, app.current_org_id()::text AS org`,
    );
    say(
      `runtime role installed: session_user=${runtime.rows[0].login} current_user=${runtime.rows[0].role} org=${runtime.rows[0].org}`,
    );

    // --- the actual product call behind the doctor's "Слить" button ---
    const result = await mergePlatformUsersInTransaction(client, TARGET, DUPLICATE, 'projection', {
      medicalConflictApproval: {
        conflictId: CONFLICT,
        organizationId: f.org_id,
        actorId: f.staff_id,
      },
      mergeContext: { actorId: f.staff_id, source: 'doctor_medical_conflict_review' },
    });
    say(`merge returned: ${JSON.stringify(result)}`);

    // Back to the audit seat: app_staff deliberately cannot read the identity tables at all,
    // so the post-merge inspection must not pretend to be the doctor.
    await client.query('RESET SESSION AUTHORIZATION');
    const after = await client.query(
      `SELECT (SELECT merged_into_id::text FROM public.platform_users WHERE id = $2::uuid) AS duplicate_merged_into,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS duplicate_credentials,
              (SELECT count(*)::int FROM public.clinical_visit WHERE patient_user_id = $1::uuid) AS target_visits,
              (SELECT status FROM public.patient_merge_candidates WHERE id = $3::uuid) AS conflict_status`,
      [TARGET, DUPLICATE, CONFLICT],
    );
    say(`after merge: ${JSON.stringify(after.rows[0])}`);
    say('RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal');
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
    if (err.hint) say(`  hint: ${err.hint}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK');
    const check = await client.query(
      `SELECT count(*)::int AS leftovers FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid)`,
      [TARGET, DUPLICATE],
    );
    say(`rolled back; fixture rows left in the database: ${check.rows[0].leftovers}`);
    await client.end();
  }
}

main();

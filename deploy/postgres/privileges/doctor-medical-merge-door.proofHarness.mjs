/**
 * Общая оснастка живых доказательств двери «врач разбирает медицинский конфликт слияния».
 *
 * Кандидатная миграция ветки и кандидатные права ставятся ВНУТРИ транзакции, которая всегда
 * заканчивается `ROLLBACK`: миграция ветки на DEV по-настоящему не применяется, ledger миграций не
 * трогается, постоянных строк не остаётся. Тела-доказательства (`*.proofBody.mjs`) отличаются только
 * фикстурой и утверждениями, поэтому установка кандидата, роль врача и порт-контекст живут здесь.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const DB = 'bcb_webapp_dev';
export const SEAM = 'app_seam_identity_lookup_owner';

const REPO = process.env.BCB_PROOF_REPO;
const MIGRATION = path.join(
  REPO ?? '',
  'apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql',
);
const PRIVILEGES = path.join(REPO ?? '', 'deploy/postgres/generated', `privileges.${DB}.sql`);

/** Слепые поломки: каждая возвращает поверхность к тому состоянию, ради которого фикс и делался. */
export const FAULTS = new Set(['', 'privilege', 'two-clinic-blindness', 'staff-insert', 'foreign-org-conflict']);

export function faultFromEnv() {
  const fault = process.env.BCB_PROOF_FAULT ?? '';
  if (!FAULTS.has(fault)) throw new Error(`unknown BCB_PROOF_FAULT '${fault}'`);
  return fault;
}

function migrationBlocks(fault) {
  let source = fs.readFileSync(MIGRATION, 'utf8');
  if (fault === 'two-clinic-blindness') {
    // Дверь перестаёт видеть блокер ЧУЖОЙ клиники — ровно то, что чинит Д1. Прогон, который после
    // этого остаётся зелёным, про «второй клинике решать самой» ничего не доказывает.
    const marker = 'WHERE target_history.organization_id IS DISTINCT FROM v_organization_id';
    if (!source.includes(marker)) throw new Error('fault two-clinic-blindness: marker not found');
    source = source.replace(marker, 'WHERE false');
  }
  if (fault === 'foreign-org-conflict') {
    // Дверь перестаёт сверять, ЧЬЕЙ организации конфликт — ровно то, что держит §18б («разбирает
    // врач своей организации»). Прогон, который после этого остаётся зелёным, про принадлежность
    // конфликта ничего не доказывает.
    const marker = 'AND candidate.organization_id = v_organization_id';
    if (!source.includes(marker)) throw new Error('fault foreign-org-conflict: marker not found');
    source = source.replace(marker, 'AND TRUE');
  }
  return source.split('--> statement-breakpoint').map((block) => {
    const owner = /--\s*BCB-MIGRATION-OWNER:\s*([a-z_0-9]+)/u.exec(block)?.[1];
    if (!owner) throw new Error('migration block without an owner header');
    return { owner, sql: block };
  });
}

async function alreadyGrantedPolicies(client) {
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
  // Доверенность двери — строка `patient_merge_candidates`, поэтому права САМОЙ этой таблицы
  // переигрываются целиком: сначала REVOKE артефакта, затем его GRANT'ы, в порядке файла. Иначе
  // снятый в декларации колоночный INSERT роли врача до прогона не доезжает, и прогон проверяет
  // старое состояние базы вместо кандидатного.
  const doorTableRe = /^(GRANT|REVOKE) .* ON TABLE "public"\."patient_merge_candidates" (TO|FROM) /u;
  const newDoors =
    /^GRANT EXECUTE ON FUNCTION app\.(record_patient_medical_merge_conflict|transfer_staff_approved_platform_user_merge_data|read_staff_patient_medical_merge_conflict|refuse_staff_patient_medical_merge_conflict|resolve_platform_patient_medical_merge_conflicts)\(/u;
  const policyRe = /^CREATE POLICY "([^"]+)" ON ("[^"]+"\."[^"]+")/u;
  for (const raw of lines) {
    const line = raw.trim();
    if (doorTableRe.test(line)) {
      out.push(line);
      continue;
    }
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

/**
 * Кандидатная миграция + кандидатные права внутри уже открытой транзакции. Возвращает строки для
 * журнала прогона: сколько блоков и сколько операторов прав реально применено.
 */
export async function installCandidate(client, fault, say) {
  await client.query(`GRANT CREATE ON SCHEMA app, app_ext TO ${SEAM}`);
  await client.query(`GRANT USAGE ON LANGUAGE plpgsql, sql TO ${SEAM}`);
  const blocks = migrationBlocks(fault);
  for (const block of blocks) {
    await client.query(`SET LOCAL ROLE ${block.owner}`);
    await client.query(block.sql);
    await client.query('RESET ROLE');
  }
  say(`candidate migration applied: ${blocks.length} owner-ordered blocks`);
  if (fault === 'two-clinic-blindness') {
    say("FAULT INJECTED: the door no longer sees another clinic's blocker");
  }
  if (fault === 'foreign-org-conflict') {
    say("FAULT INJECTED: the door no longer checks that the conflict belongs to the doctor's organization");
  }

  const privileges = candidatePrivilegeStatements(await alreadyGrantedPolicies(client));
  for (const statement of privileges) await client.query(statement);
  say(`candidate privileges applied: ${privileges.length} generated statements`);

  if (fault === 'privilege') {
    // Blind fault: take one declared table away from the door owner. A proof that stays green
    // here is not proving anything about privileges.
    await client.query(`REVOKE ALL ON TABLE public.user_password_credentials FROM ${SEAM}`);
    say('FAULT INJECTED: user_password_credentials revoked from the door owner');
  }
  if (fault === 'staff-insert') {
    // Blind fault: вернуть самодельную доверенность — колоночный INSERT роли врача, снятый в Д2.
    await client.query(`GRANT INSERT ("anchor_user_id", "candidate_user_id", "created_at", "id",
      "organization_id", "payload", "reason", "resolved_at", "resolved_by", "status",
      "trigger_appointment_id") ON TABLE public.patient_merge_candidates TO app_staff`);
    say('FAULT INJECTED: app_staff column INSERT on patient_merge_candidates granted back');
  }
}

/** Возможность порт-контекста класса `staff` — та же, что открывает рантайм webapp. */
export async function staffCapability(client) {
  const rows = await client.query(`
    SELECT capability_id::text AS capability_id, session_login::text AS login,
           encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') AS args_hash
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'staff' AND target_role = 'app_staff'
       AND purpose = 'relation' AND function_identity IS NULL
     ORDER BY session_login
     LIMIT 1`);
  const capability = rows.rows[0];
  if (!capability) throw new Error('DEV has no staff relation port-context capability');
  return capability;
}

/**
 * `count` РАЗНЫХ клиник, у каждой — активный сотрудник со ссылкой актора. Живых клиник на DEV
 * сегодня одна, а конфликт «в двух клиниках» без второй не показать, поэтому недостающие клиники
 * заводятся тут же, внутри той же транзакции с `ROLLBACK`, и об этом пишется в журнал прогона.
 */
export async function clinicsWithDoctors(client, count, say) {
  const real = await client.query(
    `WITH ranked AS (
       SELECT membership.platform_user_id, membership.organization_id, ref.opaque_ref,
              row_number() OVER (PARTITION BY membership.organization_id
                                 ORDER BY membership.platform_user_id) AS position
         FROM public.be_organization_members AS membership
         JOIN app_ext.variant_a_identity_refs AS ref
           ON ref.physical_user_id = membership.platform_user_id AND ref.ref_kind = 'actor'
        WHERE membership.status = 'active'
     )
     SELECT platform_user_id::text AS staff_id, organization_id::text AS org_id,
            opaque_ref::text AS actor_ref, false AS synthesized
       FROM ranked
      WHERE position = 1
      ORDER BY organization_id
      LIMIT $1`,
    [count],
  );
  const clinics = [...real.rows];
  for (let index = clinics.length; index < count; index += 1) {
    const suffix = `${index}`.padStart(3, '0');
    const orgId = `00000000-0000-4000-8000-0000000c1${suffix}`;
    const staffId = `00000000-0000-4000-8000-0000000c2${suffix}`;
    const actorRef = `00000000-0000-4000-8000-0000000c3${suffix}`;
    await client.query(`INSERT INTO public.be_organizations(id, title) VALUES ($1::uuid, $2)`, [
      orgId,
      `proof clinic ${suffix}`,
    ]);
    await client.query(
      `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'doctor')`,
      [staffId, `proof doctor ${suffix}`],
    );
    await client.query(
      `INSERT INTO public.be_organization_members(organization_id, platform_user_id, role, status)
       VALUES ($1::uuid, $2::uuid, 'owner', 'active')`,
      [orgId, staffId],
    );
    await client.query(
      `INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref, ref_kind)
       VALUES ($1::uuid, $2::uuid, 'actor')`,
      [staffId, actorRef],
    );
    clinics.push({ staff_id: staffId, org_id: orgId, actor_ref: actorRef, synthesized: true });
    if (say) say(`clinic ${orgId} synthesized inside the rollback transaction (DEV has ${real.rows.length})`);
  }
  return clinics;
}

/** Роль врача ровно так, как её открывает webapp: mTLS-логин + принятый порт-контекст клиники. */
export async function installDoctorContext(client, capability, doctor) {
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${capability.login}`);
  await client.query(
    `SELECT app.begin_port_context($1::uuid,
       ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
           NULL::regprocedure, decode($2, 'hex'), $3::uuid, NULL::uuid, $4::uuid,
           NULL::bigint, NULL::uuid)::app.port_context_claims)`,
    [capability.capability_id, capability.args_hash, doctor.actor_ref, doctor.org_id],
  );
  const runtime = await client.query(
    `SELECT session_user AS login, current_user AS role, app.current_org_id()::text AS org`,
  );
  return runtime.rows[0];
}

/**
 * Возможность порт-контекста именованного корня — из КАНДИДАТНОГО артефакта, а не выдуманная: у
 * новых дверей ветки её на DEV ещё нет, а `require_accepted_context` без неё отказывает (42501).
 */
export async function installCandidateNamedRootCapability(client, functionIdentity) {
  const source = fs.readFileSync(
    path.join(REPO ?? '', 'deploy/postgres/generated', `port-context-capabilities.${DB}.sql`),
    'utf8',
  );
  const line = source
    .split('\n')
    .find((candidate) => candidate.includes(`'${functionIdentity}'::regprocedure`));
  if (!line) throw new Error(`candidate capability for ${functionIdentity} not found`);
  const values = [...line.matchAll(/'([^']*)'(?:::[a-z_. ]+)?/gu)].map((match) => match[1]);
  const [capabilityId, port, login, targetRole, contextClass, purpose] = values;
  await client.query(
    `INSERT INTO app_ext.port_context_capabilities(capability_id, port, session_login, target_role,
       context_class, purpose, function_identity, active_from)
     VALUES ($1::uuid, $2::app.port_name, $3::name, $4::name, $5::app.port_context_class, $6,
             $7::regprocedure, now())
     ON CONFLICT DO NOTHING`,
    [capabilityId, port, login, targetRole, contextClass, purpose, functionIdentity],
  );
  return { capability_id: capabilityId, login, purpose, function_identity: functionIdentity };
}

/** Порт-контекст ИМЕНОВАННОГО КОРНЯ: ровно то, что открывает `runWebappNamedRoot`. */
export async function installDoctorNamedRootContext(client, capability, doctor, uuidArgs) {
  // Хеш типизированных аргументов считается ДО смены авторизации: логину роли врача исполнять
  // `app.hash_port_typed_args` не положено, это делает рантайм до входа в контекст.
  const hash = await client.query(
    `SELECT encode(app.hash_port_typed_args(ARRAY(
              SELECT ROW('uuid@1', pg_catalog.uuid_send(value::uuid))::app.port_typed_arg
                FROM pg_catalog.unnest($1::text[]) WITH ORDINALITY AS argument(value, position)
               ORDER BY argument.position
            )), 'hex') AS args_hash`,
    [uuidArgs],
  );
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${capability.login}`);
  await client.query(
    `SELECT app.begin_port_context($1::uuid,
       ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, $2,
           $3::regprocedure, decode($4, 'hex'), $5::uuid, NULL::uuid, $6::uuid,
           NULL::bigint, NULL::uuid)::app.port_context_claims)`,
    [
      capability.capability_id,
      capability.purpose,
      capability.function_identity,
      hash.rows[0].args_hash,
      doctor.actor_ref,
      doctor.org_id,
    ],
  );
}

/** Вернуться на место аудитора: app_staff учётные таблицы не читает вовсе. */
export async function clearDoctorContext(client) {
  await client.query('RESET SESSION AUTHORIZATION');
  await client.query(
    `DELETE FROM app_ext.accepted_port_contexts
      WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()
        AND cleared_at IS NULL`,
  );
}

export async function connect() {
  const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: DB });
  await client.connect();
  const who = await client.query('SELECT current_database() AS db, current_user AS who');
  if (who.rows[0].db !== DB) throw new Error(`refusing to run against ${who.rows[0].db}`);
  return { client, db: who.rows[0].db, who: who.rows[0].who };
}

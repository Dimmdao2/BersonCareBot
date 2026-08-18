/**
 * Живое доказательство одного свойства шва port-context на именованной DEV-базе. Opt-in: без
 * `RUN_PORT_CONTEXT_TENANT_CLAIM_DB=1` файл пропускается, поэтому в CI он не ходит в базу.
 *
 * Какую поломку ловит (одной строкой): установка контекста принимает ЛЮБУЮ названную организацию —
 * чужую или выдуманную, — потому что заявку на арендатора никто не сверяет с членством.
 *
 * Это не гипотеза. 19.08 замерено на dev под настоящим рабочим логином `bcb_dev_webapp_staff`, с
 * законно полученным идентификатором актора, у которого действующее членство ровно в одной клинике:
 * чужая организация — установка ПРИНЯТА, `current_org_id()` вернула чужую, строки чужой клиники
 * видны; выдуманный uuid — тоже принят. Тот, кто может выполнить SQL под рабочим логином, назначал
 * себе любую клинику, а вся конструкция строилась ровно против этого.
 *
 * Проверяется ПОВЕДЕНИЕ гейта `app_ext.assert_port_context_claim` — того самого, который
 * `app.install_port_context` зовёт до вставки строки контекста: принята ли своя заявка и отвергнута
 * ли чужая, с кодом 42501. Гейт вызывается напрямую, а не через логин, потому что доказательство
 * должно держаться на правиле, а не на клиентских сертификатах mTLS; сквозная проверка через
 * настоящие логины лежит рядом в `.proof/tenant-claim-proof.sh`.
 *
 * Фикстуры берутся из самой базы, а не зашиты: нужен человек с ДЕЙСТВУЮЩИМ членством ровно в одной
 * организации и вторая организация, в которой его членства нет.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PORT_CONTEXT_TENANT_CLAIM_DB=1 node --test \
 *     deploy/postgres/privileges/port-context-tenant-claim.devDbProof.test.mjs
 * Гейт и таблицы членства закрыты для всех, кроме своего владельца, поэтому проба идёт локальным
 * админ-сокетом (`sudo -n -u postgres psql`), как читающие проверки в AGENTS.md §6.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_PORT_CONTEXT_TENANT_CLAIM_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

const INVENTED = '11111111-2222-4333-8444-555555555555';

/** Возвращает 'ok' либо 'SQLSTATE|сообщение' — так один прогон покрывает и приём, и отказ. */
function claim({ contextClass, targetRole, actorRef, subjectRef, organizationId, integratorUserId }) {
  const literal = (value, cast) => (value === undefined || value === null ? 'NULL' : `'${value}'::${cast}`);
  // Итог кладётся в параметр сессии, а не в NOTICE: NOTICE уходит в stderr и до `execFileSync` не
  // доезжает, а исход отказа — ровно то, что здесь доказывается.
  return psql(`
DO $$
BEGIN
  PERFORM app_ext.assert_port_context_claim(
    '${contextClass}', '${targetRole}'::name,
    ${literal(actorRef, 'uuid')}, ${literal(subjectRef, 'uuid')},
    ${literal(organizationId, 'uuid')}, ${integratorUserId ?? 'NULL'}::bigint);
  PERFORM set_config('bcb.claim_result', 'ok', false);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bcb.claim_result', SQLSTATE || '|' || SQLERRM, false);
END $$;
SELECT current_setting('bcb.claim_result');
`).trim();
}

function fixture(sql, what) {
  const value = psql(sql);
  assert.notEqual(value, '', `DEV-база не содержит фикстуры: ${what}`);
  return value.split('|');
}

test('staff: заявка принимается только на организацию с действующим членством актора', { skip: !ENABLED }, () => {
  const [actorRef, ownOrg, foreignOrg] = fixture(`
SELECT ref.opaque_ref || '|' || own.organization_id || '|' || foreign_org.organization_id
  FROM app_ext.variant_a_identity_refs ref
  JOIN public.be_organization_members own
    ON own.platform_user_id = ref.physical_user_id AND own.status = 'active'
  JOIN LATERAL (
    SELECT other.organization_id FROM public.be_organization_members other
     WHERE other.organization_id <> own.organization_id
       AND NOT EXISTS (SELECT 1 FROM public.be_organization_members mine
                        WHERE mine.platform_user_id = ref.physical_user_id
                          AND mine.organization_id = other.organization_id
                          AND mine.status = 'active')
     LIMIT 1) AS foreign_org ON TRUE
 LIMIT 1;`, 'сотрудник с действующим членством и вторая организация без его членства');

  assert.equal(claim({ contextClass: 'staff', targetRole: 'app_staff', actorRef, organizationId: ownOrg }), 'ok');

  for (const [label, organizationId] of [['чужая', foreignOrg], ['выдуманная', INVENTED]]) {
    const refusal = claim({ contextClass: 'staff', targetRole: 'app_staff', actorRef, organizationId });
    assert.match(refusal, /^42501\|/u, `${label} организация принята: ${refusal}`);
  }
});

test('patient: заявка принимается только на организацию с действующим зачислением, и только на себя', { skip: !ENABLED }, () => {
  const [patientRef, ownOrg, foreignOrg] = fixture(`
SELECT ref.opaque_ref || '|' || own.organization_id || '|' || foreign_org.organization_id
  FROM app_ext.variant_a_identity_refs ref
  JOIN public.org_enrollments own
    ON own.platform_user_id = ref.physical_user_id AND own.status = 'active'
  JOIN LATERAL (
    SELECT other.organization_id FROM public.org_enrollments other
     WHERE other.organization_id <> own.organization_id
       AND NOT EXISTS (SELECT 1 FROM public.org_enrollments mine
                        WHERE mine.platform_user_id = ref.physical_user_id
                          AND mine.organization_id = other.organization_id
                          AND mine.status = 'active')
     LIMIT 1) AS foreign_org ON TRUE
 LIMIT 1;`, 'пациент с действующим зачислением и вторая организация без его зачисления');

  assert.equal(
    claim({ contextClass: 'patient', targetRole: 'app_patient', actorRef: patientRef, subjectRef: patientRef, organizationId: ownOrg }),
    'ok',
  );
  // Спящий режим: организации ещё нет — проверять нечего, но личность обязана разрешаться.
  assert.equal(
    claim({ contextClass: 'patient', targetRole: 'app_patient', actorRef: patientRef, subjectRef: patientRef }),
    'ok',
  );

  for (const [label, organizationId] of [['чужая', foreignOrg], ['выдуманная', INVENTED]]) {
    const refusal = claim({ contextClass: 'patient', targetRole: 'app_patient', actorRef: patientRef, subjectRef: patientRef, organizationId });
    assert.match(refusal, /^42501\|/u, `${label} организация принята: ${refusal}`);
  }

  const [otherRef] = fixture(
    `SELECT opaque_ref FROM app_ext.variant_a_identity_refs WHERE opaque_ref <> '${patientRef}'::uuid LIMIT 1;`,
    'вторая известная личность',
  );
  const split = claim({ contextClass: 'patient', targetRole: 'app_patient', actorRef: patientRef, subjectRef: otherRef, organizationId: ownOrg });
  assert.match(split, /^42501\|/u, `стена пациента шире, чем «только свои данные»: ${split}`);
});

test('platform: класс достаётся только настоящему администратору платформы', { skip: !ENABLED }, () => {
  const [adminRef] = fixture(`
SELECT ref.opaque_ref FROM app_ext.variant_a_identity_refs ref
  JOIN public.platform_users u ON u.id = ref.physical_user_id
 WHERE u.role = 'admin' AND u.merged_into_id IS NULL LIMIT 1;`, 'администратор платформы');
  const [otherRef] = fixture(`
SELECT ref.opaque_ref FROM app_ext.variant_a_identity_refs ref
  JOIN public.platform_users u ON u.id = ref.physical_user_id
 WHERE u.role <> 'admin' LIMIT 1;`, 'пользователь без роли администратора');

  assert.equal(claim({ contextClass: 'platform', targetRole: 'app_platform_admin', actorRef: adminRef }), 'ok');
  const refusal = claim({ contextClass: 'platform', targetRole: 'app_platform_admin', actorRef: otherRef });
  assert.match(refusal, /^42501\|/u, `класс платформы выдан не администратору: ${refusal}`);
});

test('integrator: организация обязана быть действующей для этого integrator_user_id', { skip: !ENABLED }, () => {
  const [integratorUserId, ownOrg, foreignOrg] = fixture(`
SELECT u.integrator_user_id || '|' || own.organization_id || '|' || foreign_org.organization_id
  FROM public.platform_users u
  JOIN public.org_enrollments own ON own.platform_user_id = u.id AND own.status = 'active'
  JOIN LATERAL (
    SELECT other.organization_id FROM public.org_enrollments other
     WHERE other.organization_id <> own.organization_id
       AND NOT EXISTS (SELECT 1 FROM public.org_enrollments mine
                        WHERE mine.platform_user_id = u.id AND mine.organization_id = other.organization_id
                          AND mine.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM public.be_organization_members mine
                        WHERE mine.platform_user_id = u.id AND mine.organization_id = other.organization_id
                          AND mine.status = 'active')
     LIMIT 1) AS foreign_org ON TRUE
 WHERE u.integrator_user_id IS NOT NULL LIMIT 1;`, 'пользователь интегратора с одной действующей организацией');

  assert.equal(
    claim({ contextClass: 'integrator', targetRole: 'app_integrator_request', organizationId: ownOrg, integratorUserId }),
    'ok',
  );
  for (const [label, organizationId] of [['чужая', foreignOrg], ['выдуманная', INVENTED]]) {
    const refusal = claim({ contextClass: 'integrator', targetRole: 'app_integrator_request', organizationId, integratorUserId });
    assert.match(refusal, /^42501\|/u, `${label} организация принята: ${refusal}`);
  }
  // У резолвера личности нет вовсе — ему нечего подделывать, и он обязан продолжать работать.
  assert.equal(claim({ contextClass: 'integrator', targetRole: 'app_integrator_resolver' }), 'ok');
});

test('tenant_service и service: выдуманная организация отвергается, настоящая работает', { skip: !ENABLED }, () => {
  const [realOrg] = fixture(
    'SELECT organization_id FROM public.be_organization_members LIMIT 1;', 'настоящая организация');

  for (const [contextClass, targetRole] of [['tenant_service', 'app_tenant_service'], ['service', 'app_worker']]) {
    assert.equal(claim({ contextClass, targetRole, organizationId: realOrg }), 'ok');
    const refusal = claim({ contextClass, targetRole, organizationId: INVENTED });
    assert.match(refusal, /^42501\|/u, `${contextClass}: выдуманная организация принята: ${refusal}`);
  }
  // Без организации служебному классу проверять нечего.
  assert.equal(claim({ contextClass: 'service', targetRole: 'app_service' }), 'ok');
  assert.equal(claim({ contextClass: 'pre_session', targetRole: 'app_pre_session' }), 'ok');
});

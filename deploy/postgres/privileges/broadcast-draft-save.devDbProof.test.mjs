/**
 * Живое доказательство сохранения черновика рассылки на именованной DEV-базе.
 * Opt-in: без RUN_BROADCAST_DRAFT_SAVE_DB=1 файл пропускается и в CI к БД не ходит.
 *
 * Поломки, которые ловит:
 *   1. staff-путь не записывает organization_id из принятого контекста — своя клиника получает
 *      42501 вместо сохранённого черновика;
 *   2. RLS перестаёт сравнивать organization_id записи с app.current_org_id() — клиника пишет
 *      черновик с чужим organization_id.
 *
 * Кандидатный INSERT-грант на organization_id ставится внутри той же транзакции, что и проба,
 * потому что brief запрещает migrate-dev.sh --execute. Вся транзакция, включая GRANT и запись,
 * заканчивается ROLLBACK. Остальные гранты и обе RLS-политики берутся из живого каталога DEV.
 *
 * Fault injection (оба запуска обязаны быть красными, изменения БД откатываются):
 *   BROADCAST_DRAFT_SAVE_FAULT=omit-org RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test \
 *     deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs
 *   BROADCAST_DRAFT_SAVE_FAULT=weaken-org-policy RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test \
 *     deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_BROADCAST_DRAFT_SAVE_DB === '1';
const DATABASE = process.env.BROADCAST_DRAFT_SAVE_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.BROADCAST_DRAFT_SAVE_FAULT ?? '';
const PROOF_TITLE = '# bcb broadcast draft rollback proof 20260823';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!['', 'omit-org', 'weaken-org-policy'].includes(FAULT)) {
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

function oneRow(sql, what) {
  const value = psql(sql);
  assert.notEqual(value, '', `${DATABASE}: нет фикстуры — ${what}`);
  return value.split('|');
}

function checkedUuid(value, what) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu, what);
  return value;
}

function fixture() {
  const [doctorUserId, organizationId, actorRef, foreignOrganizationId] = oneRow(`
SELECT m.platform_user_id || '|' || m.organization_id || '|' || ref.opaque_ref || '|' || foreign_org.id
  FROM public.be_organization_members m
  JOIN app_ext.variant_a_identity_refs ref
    ON ref.physical_user_id = m.platform_user_id AND ref.ref_kind = 'actor'
  JOIN LATERAL (
    SELECT o.id FROM public.be_organizations o
     WHERE o.id <> m.organization_id
     ORDER BY o.id LIMIT 1
  ) foreign_org ON true
 WHERE m.status = 'active'
 ORDER BY m.organization_id, m.platform_user_id
 LIMIT 1;`, 'действующий сотрудник и вторая клиника');

  const [capabilityId, login, argsHash] = oneRow(`
SELECT c.capability_id || '|' || c.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex')
  FROM app_ext.port_context_capabilities c
 WHERE c.context_class = 'staff'
   AND c.target_role = 'app_staff'
   AND c.purpose = 'relation'
   AND c.function_identity IS NULL
 ORDER BY c.session_login
 LIMIT 1;`, 'relation capability webapp staff-порта');

  assert.match(login, /^[a-z_][a-z0-9_]*$/u, `unsafe login '${login}'`);
  assert.match(argsHash, /^[0-9a-f]{64}$/u, 'invalid empty-args hash');
  return {
    doctorUserId: checkedUuid(doctorUserId, 'invalid doctor user id'),
    organizationId: checkedUuid(organizationId, 'invalid own organization id'),
    actorRef: checkedUuid(actorRef, 'invalid actor ref'),
    foreignOrganizationId: checkedUuid(foreignOrganizationId, 'invalid foreign organization id'),
    capabilityId: checkedUuid(capabilityId, 'invalid capability id'),
    login,
    argsHash,
  };
}

function insertSql(f, requestedOrganizationId) {
  const organizationColumn = FAULT === 'omit-org' ? '' : ', organization_id';
  const organizationValue = FAULT === 'omit-org'
    ? ''
    : `, '${requestedOrganizationId}'::uuid`;
  return `
INSERT INTO public.broadcast_drafts
  (doctor_user_id${organizationColumn}, category, audience, channels, title, body,
   media_url, media_type, updated_at)
VALUES (
  '${f.doctorUserId}'::uuid${organizationValue}, NULL, NULL, '[]'::jsonb,
  '${PROOF_TITLE}', 'rollback-only', NULL, NULL, now()
)
ON CONFLICT (doctor_user_id)
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

function probe(f, requestedOrganizationId) {
  const weakenRls = FAULT === 'weaken-org-policy'
    ? `ALTER POLICY rev10_saas_org_dormant_p0_8_3
         ON public.broadcast_drafts USING (true) WITH CHECK (true);`
    : '';
  return psql(`
\\set ON_ERROR_STOP off
BEGIN;
GRANT INSERT (organization_id) ON TABLE public.broadcast_drafts TO app_staff;
${weakenRls}
DELETE FROM public.broadcast_drafts WHERE doctor_user_id = '${f.doctorUserId}'::uuid;
SET LOCAL SESSION AUTHORIZATION ${f.login};
SELECT app.begin_port_context(
  '${f.capabilityId}'::uuid,
  ROW(
    1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
    NULL::regprocedure, decode('${f.argsHash}', 'hex'), '${f.actorRef}'::uuid,
    NULL::uuid, '${f.organizationId}'::uuid, NULL::bigint, NULL::uuid
  )::app.port_context_claims
);
SELECT current_user AS proof_runtime_role,
       app.current_org_id() AS proof_accepted_org
\\gset
${insertSql(f, requestedOrganizationId)}
\\set proof_sqlstate :LAST_ERROR_SQLSTATE
ROLLBACK;
SELECT :'proof_sqlstate' || '|' || :'proof_runtime_role' || '|' || :'proof_accepted_org';`).split('\n').at(-1);
}

test('своя клиника сохраняет черновик под app_staff с organization_id из принятого контекста',
  { skip: !ENABLED }, () => {
    const f = fixture();
    const result = probe(f, f.organizationId);
    console.log(`own_probe=${result}`);
    assert.equal(result, `00000|app_staff|${f.organizationId}`);
  });

test('app_staff не может записать черновик с organization_id другой клиники',
  { skip: !ENABLED }, () => {
    const f = fixture();
    const result = probe(f, f.foreignOrganizationId);
    console.log(`foreign_probe=${result}`);
    assert.equal(result, `42501|app_staff|${f.organizationId}`);
  });

test('обе пробы и кандидатный GRANT не оставляют данных или прав после ROLLBACK',
  { skip: !ENABLED }, () => {
    assert.equal(
      psql(`SELECT count(*) FROM public.broadcast_drafts WHERE title = '${PROOF_TITLE}';`),
      '0',
    );
    assert.equal(
      psql(`SELECT has_column_privilege('app_staff', 'public.broadcast_drafts', 'organization_id', 'INSERT');`),
      'f',
    );
  });

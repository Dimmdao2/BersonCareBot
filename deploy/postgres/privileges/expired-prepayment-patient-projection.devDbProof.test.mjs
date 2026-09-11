/**
 * Rollback-only S7 proof against the named DEV database.
 *
 * Expensive silent failure: the expiry root releases the canonical appointment while the patient
 * projection remains payable. The proof applies the candidate function from its migration inside
 * the same rolled-back transaction, expires one existing linked pair, and observes both records
 * plus the canonical history source.
 *
 * Run:
 *   RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB=1 node --test \
 *     deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs
 * Fault injection (each must fail):
 *   RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB=1 \
 *   EXPIRED_PREPAYMENT_PATIENT_PROJECTION_FAULT=omit_projection node --test \
 *     deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs
 *   EXPIRED_PREPAYMENT_PATIENT_PROJECTION_FAULT=omit_tenant_filter — то же, но снимает фильтр
 *   организации: проекция чужого арендатора обязана уцелеть.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB === '1';
const FAULT = process.env.EXPIRED_PREPAYMENT_PATIENT_PROJECTION_FAULT ?? '';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!['', 'omit_projection', 'omit_tenant_filter'].includes(FAULT)) {
  throw new Error(`unknown EXPIRED_PREPAYMENT_PATIENT_PROJECTION_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const migrationPath = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260912T002000_expired_prepayment_cancels_patient_booking.sql',
);
const privilegesPath = path.join(
  repoRoot,
  'deploy/postgres/generated/privileges.bcb_webapp_dev.sql',
);

/**
 * F3 независимого аудита: прежняя версия сверяла исходник миграции с точной многострочной строкой,
 * то есть краснела от переноса строки и от комментария внутри запроса. Тест должен проверять,
 * работает ли код, а не как он написан. Здесь запрос находится по телу, и единственное его
 * назначение — ВНЕСЕНИЕ ПОЛОМКИ, которой доказывается, что проверка не декоративная.
 *
 * Привязка идёт к `UPDATE` + перевод строки + `SET`, а не к имени таблицы: то же имя стоит одной
 * строкой в заголовке `BCB-MIGRATION-VERIFY`, и поломка, зацепившая заголовок вместо запроса,
 * оставляла канарейку зелёной — то есть тихо выключала доказательство.
 */
const PROJECTION_UPDATE_RE =
  /[ \t]*UPDATE\s+public\.patient_bookings\s+AS\s+booking\s*\n\s*SET[\s\S]*?;\s*\n/;

/**
 * Ровно тот фильтр арендатора, чьё отсутствие было дырой F1. Точка с запятой забирается вместе с
 * ним и возвращается отдельной строкой: перед фильтром стоит комментарий, и осиротевший `;` уехал
 * бы внутрь него — тогда поломка дала бы синтаксическую ошибку вместо того поведения, которое
 * проверяется.
 */
const TENANT_FILTER_RE = /\n[ \t]*AND\s+booking\.organization_id\s*=\s*v_organization_id\s*;/;

function candidateFunction() {
  const source = fs.readFileSync(migrationPath, 'utf8');
  if (FAULT === 'omit_projection') {
    assert.ok(
      PROJECTION_UPDATE_RE.test(source),
      'нечего ломать: запрос к patient_bookings в миграции не найден',
    );
    return source.replace(PROJECTION_UPDATE_RE, '');
  }
  if (FAULT === 'omit_tenant_filter') {
    assert.ok(TENANT_FILTER_RE.test(source), 'нечего ломать: фильтр арендатора в миграции не найден');
    return source.replace(TENANT_FILTER_RE, '\n       ;');
  }
  return source;
}

function candidatePrivileges() {
  const source = fs.readFileSync(privilegesPath, 'utf8');
  const startMarker = '-- ── public.patient_bookings (org=true, rls=force) ──';
  const endMarker = '-- ── public.patient_comorbidity (org=true, rls=force) ──';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'generated patient_bookings privilege block is missing');
  return source.slice(start, end);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n',
      '-u',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-q',
      '-h',
      '/var/run/postgresql',
      '-p',
      '5432',
      '-d',
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

test(
  'expiry atomically cancels the patient projection with the canonical prepayment source',
  { skip: !ENABLED, concurrency: false },
  () => {
    const output = psql(`BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_payment_webhook_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_payment_webhook_owner;
SET LOCAL ROLE app_seam_payment_webhook_owner;
${candidateFunction()}
RESET ROLE;
${candidatePrivileges()}

CREATE TEMP TABLE s7_probe AS
SELECT appointment.id AS appointment_id, booking.id AS booking_id
FROM public.be_appointments appointment
JOIN public.patient_bookings booking ON booking.canonical_appointment_id = appointment.id
WHERE appointment.deleted_at IS NULL
  AND appointment.prepayment_paid_minor = 0
  AND appointment.payment_ref IS NULL
ORDER BY appointment.updated_at DESC
LIMIT 1;

DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM s7_probe) THEN
    RAISE EXCEPTION 'named DEV needs one linked patient booking for the rollback-only S7 proof';
  END IF;
END
$fixture$;

UPDATE public.be_appointments
SET status = 'awaiting_payment',
    payment_deadline_at = pg_catalog.clock_timestamp() - interval '1 minute',
    prepayment_paid_minor = 0,
    payment_ref = NULL
WHERE id = (SELECT appointment_id FROM s7_probe);
UPDATE public.patient_bookings
SET status = 'awaiting_payment', cancelled_at = NULL, cancel_reason = NULL
WHERE id = (SELECT booking_id FROM s7_probe);

-- Стена арендатора (F1 независимого аудита). Внешний ключ проекции ссылается ТОЛЬКО на
-- be_appointments(id) — составного ключа с organization_id нет, и схема ПРИНИМАЕТ строку чужой
-- организации, указывающую на эту же запись. Кладём ровно такую строку и требуем, чтобы тик её не
-- тронул. Ноль таких строк на сегодняшней базе — совпадение, а не ограничение.
--
-- Вторая организация создаётся здесь же, а не ищется в базе: на named DEV организация ровно одна,
-- и проверка, которая молча отключается на однотенантной базе, — не проверка. Клон живёт внутри
-- той же откатываемой транзакции.
CREATE TEMP TABLE s7_org AS
SELECT * FROM public.be_organizations WHERE id = (
  SELECT booking.organization_id
  FROM public.patient_bookings booking
  WHERE booking.id = (SELECT booking_id FROM s7_probe)
);
UPDATE s7_org SET id = '00000000-0000-4000-8000-0000000000f9'::uuid;
INSERT INTO public.be_organizations SELECT * FROM s7_org;

CREATE TEMP TABLE s7_clone AS
SELECT * FROM public.patient_bookings WHERE id = (SELECT booking_id FROM s7_probe);

UPDATE s7_clone
SET id = '00000000-0000-4000-8000-0000000000f8'::uuid,
    organization_id = '00000000-0000-4000-8000-0000000000f9'::uuid,
    status = 'awaiting_payment',
    cancelled_at = NULL,
    cancel_reason = NULL;

DO $foreign$
BEGIN
  IF (SELECT organization_id FROM s7_clone)
     = (SELECT organization_id FROM public.patient_bookings
        WHERE id = (SELECT booking_id FROM s7_probe)) THEN
    RAISE EXCEPTION 'tenant wall fixture is a no-op: both rows share one organization';
  END IF;
END
$foreign$;

INSERT INTO public.patient_bookings SELECT * FROM s7_clone;

INSERT INTO app_ext.port_context_capabilities (
  capability_id, port, session_login, target_role, context_class, purpose, function_identity
)
SELECT '00000000-0000-4000-8000-0000000000f7'::uuid, capability.port, session_user,
       capability.target_role, capability.context_class, capability.purpose,
       capability.function_identity
FROM app_ext.port_context_capabilities capability
WHERE capability.purpose = 'booking-payment.prepayment.expire'
  AND capability.function_identity =
      'app.expire_due_booking_prepayments(integer)'::regprocedure
LIMIT 1;

INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash
)
SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
       capability.session_login, capability.port, capability.target_role,
       capability.context_class, capability.purpose, capability.function_identity,
       app.hash_port_typed_args(ARRAY[
         ROW('integer@1', pg_catalog.int4send(1))::app.port_typed_arg
       ])
FROM pg_database database
JOIN app_ext.port_context_capabilities capability
  ON capability.capability_id = '00000000-0000-4000-8000-0000000000f7'::uuid
WHERE database.datname = current_database();

CREATE TEMP TABLE s7_expired AS
SELECT app.expire_due_booking_prepayments(1) AS value;

SELECT pg_catalog.jsonb_build_object(
  'expired', (SELECT value->>'expired' FROM s7_expired),
  'appointmentStatus', appointment.status,
  'patientBookingStatus', booking.status,
  'patientCancelReason', booking.cancel_reason,
  'historySource', history.payload->>'source',
  'foreignTenantBookingStatus', (
    SELECT foreign_booking.status
    FROM public.patient_bookings foreign_booking
    WHERE foreign_booking.id = '00000000-0000-4000-8000-0000000000f8'::uuid
  )
)::text
FROM s7_probe probe
JOIN public.be_appointments appointment ON appointment.id = probe.appointment_id
JOIN public.patient_bookings booking ON booking.id = probe.booking_id
JOIN LATERAL (
  SELECT event.payload
  FROM public.be_appointment_history_events event
  WHERE event.appointment_id = probe.appointment_id
    AND event.payload->>'source' = 'prepayment_expired'
  ORDER BY event.occurred_at DESC
  LIMIT 1
) history ON true;
ROLLBACK;`);

    const resultLine = output.split('\n').filter(Boolean).at(-1);
    assert.ok(resultLine, 'S7 proof returned no result');
    const result = JSON.parse(resultLine);
    assert.deepEqual(result, {
      expired: '1',
      appointmentStatus: 'cancelled_by_specialist',
      patientBookingStatus: 'cancelled',
      patientCancelReason: 'prepayment_expired',
      historySource: 'prepayment_expired',
      // Чужая организация не тронута: тик отменил только свою проекцию.
      foreignTenantBookingStatus: 'awaiting_payment',
    });
    console.log('S7 live result:', result);
  },
);

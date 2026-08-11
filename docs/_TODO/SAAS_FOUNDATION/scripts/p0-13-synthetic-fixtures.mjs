#!/usr/bin/env node

export const fixtureVersion = 'p0.13.1';

export const syntheticFixtureIds = Object.freeze({
  orgA: '13000000-0000-4000-8000-0000000000a1',
  orgB: '13000000-0000-4000-8000-0000000000b1',
  doctorA: '13000000-0000-4000-8000-00000000d0a1',
  doctorB: '13000000-0000-4000-8000-00000000d0b1',
  patientA1: '13000000-0000-4000-8000-00000000a101',
  patientA2: '13000000-0000-4000-8000-00000000a102',
  patientB1: '13000000-0000-4000-8000-00000000b101',
  packageA: '13000000-0000-4000-8000-00000000f0a1',
  packageB: '13000000-0000-4000-8000-00000000f0b1',
  serviceA: '13000000-0000-4000-8000-00000000e0a1',
  serviceB: '13000000-0000-4000-8000-00000000e0b1',
  patientPackageA1: '13000000-0000-4000-8000-00000000c0a1',
  patientPackageA2: '13000000-0000-4000-8000-00000000c0a2',
  patientPackageB1: '13000000-0000-4000-8000-00000000c0b1',
});

export const syntheticIntegratorUserIds = Object.freeze({
  doctorA: 13001301,
  doctorB: 13001302,
  patientA1: 13001311,
  patientA2: 13001312,
  patientB1: 13001321,
});

export const requiredFixtureFamilies = Object.freeze([
  'direct_org',
  'fk_path',
  'denorm_path',
  'bootstrap',
  'integrator_denorm',
]);

export const p013SyntheticFixture = Object.freeze({
  version: fixtureVersion,
  organizations: Object.freeze([
    Object.freeze({ key: 'org_a', id: syntheticFixtureIds.orgA, title: 'P0.13 Synthetic Org A' }),
    Object.freeze({ key: 'org_b', id: syntheticFixtureIds.orgB, title: 'P0.13 Synthetic Org B' }),
  ]),
  platformUsers: Object.freeze([
    Object.freeze({
      key: 'doctor_a',
      id: syntheticFixtureIds.doctorA,
      role: 'doctor',
      organizationKey: 'org_a',
    }),
    Object.freeze({
      key: 'doctor_b',
      id: syntheticFixtureIds.doctorB,
      role: 'doctor',
      organizationKey: 'org_b',
    }),
    Object.freeze({
      key: 'patient_a1',
      id: syntheticFixtureIds.patientA1,
      role: 'client',
      organizationKey: 'org_a',
    }),
    Object.freeze({
      key: 'patient_a2',
      id: syntheticFixtureIds.patientA2,
      role: 'client',
      organizationKey: 'org_a',
    }),
    Object.freeze({
      key: 'patient_b1',
      id: syntheticFixtureIds.patientB1,
      role: 'client',
      organizationKey: 'org_b',
    }),
  ]),
  rows: Object.freeze([
    Object.freeze({
      fixtureId: 'direct-org-member-a',
      family: 'direct_org',
      table: 'public.be_organization_members',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'doctor_a',
      principalUserId: syntheticFixtureIds.doctorA,
      expectedScope: 'org_a',
      notes: 'staff membership row with materialized organization_id',
    }),
    Object.freeze({
      fixtureId: 'direct-org-member-b',
      family: 'direct_org',
      table: 'public.be_organization_members',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'doctor_b',
      principalUserId: syntheticFixtureIds.doctorB,
      expectedScope: 'org_b',
      notes: 'second organization staff membership row',
    }),
    Object.freeze({
      fixtureId: 'direct-org-enrollment-a1',
      family: 'direct_org',
      table: 'public.org_enrollments',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a1',
      patientUserId: syntheticFixtureIds.patientA1,
      principalKey: 'patient_a1',
      principalUserId: syntheticFixtureIds.patientA1,
      expectedScope: 'org_a/patient_a1',
      notes: 'patient wall baseline row for org A patient 1',
    }),
    Object.freeze({
      fixtureId: 'direct-org-enrollment-a2',
      family: 'direct_org',
      table: 'public.org_enrollments',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a2',
      patientUserId: syntheticFixtureIds.patientA2,
      principalKey: 'patient_a2',
      principalUserId: syntheticFixtureIds.patientA2,
      expectedScope: 'org_a/patient_a2',
      notes: 'same-org second patient for patient-wall negative assertions',
    }),
    Object.freeze({
      fixtureId: 'direct-org-enrollment-b1',
      family: 'direct_org',
      table: 'public.org_enrollments',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'patient_b1',
      patientUserId: syntheticFixtureIds.patientB1,
      principalKey: 'patient_b1',
      principalUserId: syntheticFixtureIds.patientB1,
      expectedScope: 'org_b/patient_b1',
      notes: 'cross-org patient row for tenant-wall negative assertions',
    }),
    Object.freeze({
      fixtureId: 'fk-package-item-a',
      family: 'fk_path',
      table: 'public.be_package_items',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'doctor_a',
      principalUserId: syntheticFixtureIds.doctorA,
      expectedScope: 'org_a via be_subscription_packages.organization_id',
      notes: 'P0.8.4 public FK-path representative',
    }),
    Object.freeze({
      fixtureId: 'fk-package-item-b',
      family: 'fk_path',
      table: 'public.be_package_items',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'doctor_b',
      principalUserId: syntheticFixtureIds.doctorB,
      expectedScope: 'org_b via be_subscription_packages.organization_id',
      notes: 'second organization P0.8.4 public FK-path representative',
    }),
    Object.freeze({
      fixtureId: 'fk-patient-package-item-a1',
      family: 'fk_path',
      table: 'public.be_patient_package_items',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a1',
      patientUserId: syntheticFixtureIds.patientA1,
      principalKey: 'patient_a1',
      principalUserId: syntheticFixtureIds.patientA1,
      expectedScope: 'org_a/patient_a1 via be_patient_packages.organization_id',
      notes: 'P0.8.4 patient-bearing FK-path representative',
    }),
    Object.freeze({
      fixtureId: 'fk-patient-package-item-a2',
      family: 'fk_path',
      table: 'public.be_patient_package_items',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a2',
      patientUserId: syntheticFixtureIds.patientA2,
      principalKey: 'patient_a2',
      principalUserId: syntheticFixtureIds.patientA2,
      expectedScope: 'org_a/patient_a2 via be_patient_packages.organization_id',
      notes: 'same-org wrong-patient FK-path negative assertion row',
    }),
    Object.freeze({
      fixtureId: 'fk-patient-package-item-b1',
      family: 'fk_path',
      table: 'public.be_patient_package_items',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'patient_b1',
      patientUserId: syntheticFixtureIds.patientB1,
      principalKey: 'patient_b1',
      principalUserId: syntheticFixtureIds.patientB1,
      expectedScope: 'org_b/patient_b1 via be_patient_packages.organization_id',
      notes: 'cross-org patient-bearing FK-path representative',
    }),
    Object.freeze({
      fixtureId: 'denorm-notification-attempt-a1',
      family: 'denorm_path',
      table: 'public.notification_delivery_attempts',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a1',
      patientUserId: syntheticFixtureIds.patientA1,
      principalKey: 'patient_a1',
      principalUserId: syntheticFixtureIds.patientA1,
      expectedScope: 'org_a/patient_a1',
      notes: 'P0.8.4 denorm organization_id plus user_id representative',
    }),
    Object.freeze({
      fixtureId: 'denorm-notification-attempt-a2',
      family: 'denorm_path',
      table: 'public.notification_delivery_attempts',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a2',
      patientUserId: syntheticFixtureIds.patientA2,
      principalKey: 'patient_a2',
      principalUserId: syntheticFixtureIds.patientA2,
      expectedScope: 'org_a/patient_a2',
      notes: 'same-org wrong-patient denorm negative assertion row',
    }),
    Object.freeze({
      fixtureId: 'denorm-notification-attempt-b1',
      family: 'denorm_path',
      table: 'public.notification_delivery_attempts',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'patient_b1',
      patientUserId: syntheticFixtureIds.patientB1,
      principalKey: 'patient_b1',
      principalUserId: syntheticFixtureIds.patientB1,
      expectedScope: 'org_b/patient_b1',
      notes: 'cross-org denorm organization_id plus user_id representative',
    }),
    Object.freeze({
      fixtureId: 'bootstrap-global-setting',
      family: 'bootstrap',
      table: 'public.system_settings',
      organizationKey: 'global',
      organizationId: '',
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'none',
      principalUserId: '',
      expectedScope: 'global bootstrap readable',
      notes: 'organization_id IS NULL default row',
    }),
    Object.freeze({
      fixtureId: 'bootstrap-org-setting-b',
      family: 'bootstrap',
      table: 'public.system_settings',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'none',
      patientUserId: '',
      principalKey: 'doctor_b',
      principalUserId: syntheticFixtureIds.doctorB,
      expectedScope: 'org_b override',
      notes: 'organization-specific system_settings override row',
    }),
    Object.freeze({
      fixtureId: 'integrator-reminder-log-a1',
      family: 'integrator_denorm',
      table: 'integrator.user_reminder_delivery_logs',
      organizationKey: 'org_a',
      organizationId: syntheticFixtureIds.orgA,
      patientKey: 'patient_a1',
      patientUserId: syntheticFixtureIds.patientA1,
      principalKey: 'patient_a1',
      principalUserId: syntheticFixtureIds.patientA1,
      expectedScope: 'org_a/patient_a1',
      notes: 'P0.8.5 integrator parent denorm representative',
    }),
    Object.freeze({
      fixtureId: 'integrator-reminder-log-b1',
      family: 'integrator_denorm',
      table: 'integrator.user_reminder_delivery_logs',
      organizationKey: 'org_b',
      organizationId: syntheticFixtureIds.orgB,
      patientKey: 'patient_b1',
      patientUserId: syntheticFixtureIds.patientB1,
      principalKey: 'patient_b1',
      principalUserId: syntheticFixtureIds.patientB1,
      expectedScope: 'org_b/patient_b1',
      notes: 'P0.8.5 integrator parent denorm representative',
    }),
  ]),
});

const tsvHeader = [
  'fixture_id',
  'family',
  'table',
  'organization_key',
  'organization_id',
  'patient_key',
  'patient_user_id',
  'principal_key',
  'principal_user_id',
  'expected_scope',
  'notes',
];

function quoteSqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteSqlUuid(value) {
  return value ? `${quoteSqlText(value)}::uuid` : 'NULL';
}

function tsvCell(value) {
  return String(value).replaceAll('\t', ' ').replaceAll('\n', ' ');
}

export function getP013SyntheticFixtureRows() {
  return p013SyntheticFixture.rows.map((row) => ({ ...row }));
}

export function renderP013SyntheticFixtureManifestTsv({
  rows = getP013SyntheticFixtureRows(),
} = {}) {
  const lines = rows.map((row) =>
    [
      row.fixtureId,
      row.family,
      row.table,
      row.organizationKey,
      row.organizationId,
      row.patientKey,
      row.patientUserId,
      row.principalKey,
      row.principalUserId,
      row.expectedScope,
      row.notes,
    ]
      .map(tsvCell)
      .join('\t'),
  );

  return `${tsvHeader.join('\t')}\n${lines.join('\n')}\n`;
}

export function assertScratchDatabaseName(databaseName) {
  if (!databaseName || typeof databaseName !== 'string') {
    throw new Error('scratch database name is required');
  }

  if (/bcb_webapp_(dev|prod|test)/.test(databaseName)) {
    throw new Error('P0.13 fixture refuses dev/prod/test application databases');
  }

  if (!databaseName.startsWith('bcb_saas_') && !databaseName.includes('scratch')) {
    throw new Error('P0.13 fixture requires a bcb_saas_* or scratch database');
  }
}

export function assertScratchDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new Error(`invalid scratch database URL: ${error.message}`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('scratch database URL must use postgres/postgresql');
  }

  assertScratchDatabaseName(parsed.pathname.replace(/^\//, ''));
}

function renderP013ManifestSql({ rows = getP013SyntheticFixtureRows() } = {}) {
  const values = rows
    .map((row) =>
      [
        quoteSqlText(row.fixtureId),
        quoteSqlText(row.family),
        quoteSqlText(row.table),
        quoteSqlText(row.organizationKey),
        quoteSqlUuid(row.organizationId),
        quoteSqlText(row.patientKey),
        quoteSqlUuid(row.patientUserId),
        quoteSqlText(row.principalKey),
        quoteSqlUuid(row.principalUserId),
        quoteSqlText(row.expectedScope),
        quoteSqlText(row.notes),
      ].join(', '),
    )
    .map((valueTuple) => `  (${valueTuple})`)
    .join(',\n');

  return String.raw`DROP SCHEMA IF EXISTS p0_13_fixture CASCADE;
CREATE SCHEMA p0_13_fixture;

CREATE TABLE p0_13_fixture.synthetic_rows (
  fixture_id text PRIMARY KEY,
  family text NOT NULL,
  table_name text NOT NULL,
  organization_key text NOT NULL,
  organization_id uuid,
  patient_key text NOT NULL,
  patient_user_id uuid,
  principal_key text NOT NULL,
  principal_user_id uuid,
  expected_scope text NOT NULL,
  notes text NOT NULL
);

INSERT INTO p0_13_fixture.synthetic_rows (
  fixture_id,
  family,
  table_name,
  organization_key,
  organization_id,
  patient_key,
  patient_user_id,
  principal_key,
  principal_user_id,
  expected_scope,
  notes
)
VALUES
${values};

CREATE INDEX p0_13_fixture_rows_org_idx ON p0_13_fixture.synthetic_rows (organization_id);
CREATE INDEX p0_13_fixture_rows_patient_idx ON p0_13_fixture.synthetic_rows (patient_user_id);`;
}

export function renderP013SyntheticFixtureCompatSchemaSql() {
  return String.raw`CREATE SCHEMA IF NOT EXISTS integrator;

DROP TABLE IF EXISTS
  integrator.user_reminder_delivery_logs,
  integrator.user_reminder_occurrences,
  public.notification_delivery_attempts,
  public.be_patient_package_items,
  public.be_package_items,
  public.be_patient_packages,
  public.be_subscription_packages,
  public.be_clinic_services,
  public.org_enrollments,
  public.be_organization_members,
  public.system_settings,
  public.be_organizations,
  public.platform_users,
  public.reminder_rules
CASCADE;

CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  display_name text NOT NULL,
  integrator_user_id bigint UNIQUE
);

CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY,
  title text NOT NULL
);

CREATE TABLE public.be_organization_members (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  UNIQUE (organization_id, platform_user_id)
);

CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  status text NOT NULL,
  UNIQUE (organization_id, platform_user_id)
);

CREATE TABLE public.be_subscription_packages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  price_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'RUB'
);

CREATE TABLE public.be_clinic_services (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  duration_minutes integer NOT NULL,
  price_minor integer NOT NULL
);

CREATE TABLE public.be_package_items (
  id uuid PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.be_subscription_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.be_clinic_services(id) ON DELETE CASCADE,
  quantity integer NOT NULL
);

CREATE TABLE public.be_patient_packages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  status text NOT NULL,
  display_number integer NOT NULL UNIQUE,
  title text NOT NULL,
  price_minor integer NOT NULL
);

CREATE TABLE public.be_patient_package_items (
  id uuid PRIMARY KEY,
  patient_package_id uuid NOT NULL REFERENCES public.be_patient_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.be_clinic_services(id) ON DELETE CASCADE,
  quantity_initial integer NOT NULL
);

CREATE TABLE public.notification_delivery_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  user_id uuid,
  channel text NOT NULL,
  status text NOT NULL,
  event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX p0_13_system_settings_global_uidx
  ON public.system_settings (key, scope)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX p0_13_system_settings_org_uidx
  ON public.system_settings (key, scope, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE TABLE public.reminder_rules (
  integrator_rule_id text PRIMARY KEY,
  integrator_user_id bigint NOT NULL,
  category text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  schedule_type text NOT NULL DEFAULT 'interval_window',
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  interval_minutes integer NOT NULL,
  window_start_minute integer NOT NULL,
  window_end_minute integer NOT NULL,
  days_mask text NOT NULL DEFAULT '1111111',
  content_mode text NOT NULL DEFAULT 'none',
  organization_id uuid
);

CREATE TABLE integrator.user_reminder_occurrences (
  id text PRIMARY KEY,
  rule_id text NOT NULL REFERENCES public.reminder_rules(integrator_rule_id) ON DELETE RESTRICT,
  occurrence_key text NOT NULL UNIQUE,
  planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  organization_id uuid
);

CREATE TABLE integrator.user_reminder_delivery_logs (
  id text PRIMARY KEY,
  occurrence_id text NOT NULL REFERENCES integrator.user_reminder_occurrences(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL,
  organization_id uuid
);`;
}

export function renderP013SyntheticFixtureScratchSql({
  rows = getP013SyntheticFixtureRows(),
} = {}) {
  return String.raw`\set ON_ERROR_STOP on

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_13_1_scratch_db_ok \gset

\if :p0_13_1_scratch_db_ok
\else
\echo 'FATAL: P0.13.1 synthetic fixture must run only on a scratch/SaaS proof database.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (current_database() ~ 'bcb_webapp_(dev|prod|test)')::int AS p0_13_1_runtime_db \gset
\if :p0_13_1_runtime_db
\echo 'FATAL: P0.13.1 synthetic fixture refuses dev/prod/test application databases.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

${renderP013ManifestSql({ rows })}

INSERT INTO public.platform_users (id, role, display_name, integrator_user_id)
VALUES
  ('${syntheticFixtureIds.doctorA}'::uuid, 'doctor', 'P0.13 Doctor A', ${syntheticIntegratorUserIds.doctorA}),
  ('${syntheticFixtureIds.doctorB}'::uuid, 'doctor', 'P0.13 Doctor B', ${syntheticIntegratorUserIds.doctorB}),
  ('${syntheticFixtureIds.patientA1}'::uuid, 'client', 'P0.13 Patient A1', ${syntheticIntegratorUserIds.patientA1}),
  ('${syntheticFixtureIds.patientA2}'::uuid, 'client', 'P0.13 Patient A2', ${syntheticIntegratorUserIds.patientA2}),
  ('${syntheticFixtureIds.patientB1}'::uuid, 'client', 'P0.13 Patient B1', ${syntheticIntegratorUserIds.patientB1})
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      integrator_user_id = EXCLUDED.integrator_user_id;

INSERT INTO public.be_organizations (id, title)
VALUES
  ('${syntheticFixtureIds.orgA}'::uuid, 'P0.13 Synthetic Org A'),
  ('${syntheticFixtureIds.orgB}'::uuid, 'P0.13 Synthetic Org B')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

INSERT INTO public.be_organization_members (id, organization_id, platform_user_id, role, status)
VALUES
  (md5('p0.13 direct-org-member-a')::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.doctorA}'::uuid, 'doctor', 'active'),
  (md5('p0.13 direct-org-member-b')::uuid, '${syntheticFixtureIds.orgB}'::uuid, '${syntheticFixtureIds.doctorB}'::uuid, 'doctor', 'active')
ON CONFLICT (organization_id, platform_user_id) DO UPDATE
  SET role = EXCLUDED.role,
      status = EXCLUDED.status;

INSERT INTO public.org_enrollments (id, organization_id, platform_user_id, status)
VALUES
  (md5('p0.13 direct-org-enrollment-a1')::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA1}'::uuid, 'active'),
  (md5('p0.13 direct-org-enrollment-a2')::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA2}'::uuid, 'active'),
  (md5('p0.13 direct-org-enrollment-b1')::uuid, '${syntheticFixtureIds.orgB}'::uuid, '${syntheticFixtureIds.patientB1}'::uuid, 'active')
ON CONFLICT (organization_id, platform_user_id) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO public.be_subscription_packages (id, organization_id, title, price_minor)
VALUES
  ('${syntheticFixtureIds.packageA}'::uuid, '${syntheticFixtureIds.orgA}'::uuid, 'P0.13 Package A', 0),
  ('${syntheticFixtureIds.packageB}'::uuid, '${syntheticFixtureIds.orgB}'::uuid, 'P0.13 Package B', 0)
ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      title = EXCLUDED.title,
      price_minor = EXCLUDED.price_minor;

INSERT INTO public.be_clinic_services (id, organization_id, title, duration_minutes, price_minor)
VALUES
  ('${syntheticFixtureIds.serviceA}'::uuid, '${syntheticFixtureIds.orgA}'::uuid, 'P0.13 Service A', 30, 0),
  ('${syntheticFixtureIds.serviceB}'::uuid, '${syntheticFixtureIds.orgB}'::uuid, 'P0.13 Service B', 30, 0)
ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      title = EXCLUDED.title,
      duration_minutes = EXCLUDED.duration_minutes,
      price_minor = EXCLUDED.price_minor;

INSERT INTO public.be_package_items (id, package_id, service_id, quantity)
VALUES
  (md5('p0.13 fk-package-item-a')::uuid, '${syntheticFixtureIds.packageA}'::uuid, '${syntheticFixtureIds.serviceA}'::uuid, 1),
  (md5('p0.13 fk-package-item-b')::uuid, '${syntheticFixtureIds.packageB}'::uuid, '${syntheticFixtureIds.serviceB}'::uuid, 1)
ON CONFLICT (id) DO UPDATE
  SET package_id = EXCLUDED.package_id,
      service_id = EXCLUDED.service_id,
      quantity = EXCLUDED.quantity;

INSERT INTO public.be_patient_packages (id, organization_id, platform_user_id, status, display_number, title, price_minor)
VALUES
  ('${syntheticFixtureIds.patientPackageA1}'::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA1}'::uuid, 'active', 130131, 'P0.13 Patient Package A1', 0),
  ('${syntheticFixtureIds.patientPackageA2}'::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA2}'::uuid, 'active', 130132, 'P0.13 Patient Package A2', 0),
  ('${syntheticFixtureIds.patientPackageB1}'::uuid, '${syntheticFixtureIds.orgB}'::uuid, '${syntheticFixtureIds.patientB1}'::uuid, 'active', 130133, 'P0.13 Patient Package B1', 0)
ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      platform_user_id = EXCLUDED.platform_user_id,
      status = EXCLUDED.status,
      title = EXCLUDED.title,
      price_minor = EXCLUDED.price_minor;

INSERT INTO public.be_patient_package_items (id, patient_package_id, service_id, quantity_initial)
VALUES
  (md5('p0.13 fk-patient-package-item-a1')::uuid, '${syntheticFixtureIds.patientPackageA1}'::uuid, '${syntheticFixtureIds.serviceA}'::uuid, 1),
  (md5('p0.13 fk-patient-package-item-a2')::uuid, '${syntheticFixtureIds.patientPackageA2}'::uuid, '${syntheticFixtureIds.serviceA}'::uuid, 1),
  (md5('p0.13 fk-patient-package-item-b1')::uuid, '${syntheticFixtureIds.patientPackageB1}'::uuid, '${syntheticFixtureIds.serviceB}'::uuid, 1)
ON CONFLICT (id) DO UPDATE
  SET patient_package_id = EXCLUDED.patient_package_id,
      service_id = EXCLUDED.service_id,
      quantity_initial = EXCLUDED.quantity_initial;

INSERT INTO public.notification_delivery_attempts (id, organization_id, user_id, channel, status, event_id)
VALUES
  (md5('p0.13 denorm-notification-attempt-a1')::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA1}'::uuid, 'p0_13', 'sent', 'denorm-notification-attempt-a1'),
  (md5('p0.13 denorm-notification-attempt-a2')::uuid, '${syntheticFixtureIds.orgA}'::uuid, '${syntheticFixtureIds.patientA2}'::uuid, 'p0_13', 'sent', 'denorm-notification-attempt-a2'),
  (md5('p0.13 denorm-notification-attempt-b1')::uuid, '${syntheticFixtureIds.orgB}'::uuid, '${syntheticFixtureIds.patientB1}'::uuid, 'p0_13', 'sent', 'denorm-notification-attempt-b1')
ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      user_id = EXCLUDED.user_id,
      channel = EXCLUDED.channel,
      status = EXCLUDED.status,
      event_id = EXCLUDED.event_id;

INSERT INTO public.system_settings (key, scope, organization_id, value_json)
VALUES ('p0_13_fixture_global', 'admin', NULL, '{"value":"global"}'::jsonb)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json;

INSERT INTO public.system_settings (key, scope, organization_id, value_json)
VALUES ('p0_13_fixture_global', 'admin', '${syntheticFixtureIds.orgB}'::uuid, '{"value":"org-b"}'::jsonb)
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
  SET value_json = EXCLUDED.value_json;

INSERT INTO public.reminder_rules (
  integrator_rule_id,
  integrator_user_id,
  category,
  is_enabled,
  interval_minutes,
  window_start_minute,
  window_end_minute,
  organization_id
)
VALUES
  ('p0-13-rule-a1', ${syntheticIntegratorUserIds.patientA1}, 'p0_13_fixture_a1', true, 60, 0, 1440, '${syntheticFixtureIds.orgA}'::uuid),
  ('p0-13-rule-b1', ${syntheticIntegratorUserIds.patientB1}, 'p0_13_fixture_b1', true, 60, 0, 1440, '${syntheticFixtureIds.orgB}'::uuid)
ON CONFLICT (integrator_rule_id) DO UPDATE
  SET integrator_user_id = EXCLUDED.integrator_user_id,
      category = EXCLUDED.category,
      is_enabled = EXCLUDED.is_enabled,
      interval_minutes = EXCLUDED.interval_minutes,
      window_start_minute = EXCLUDED.window_start_minute,
      window_end_minute = EXCLUDED.window_end_minute,
      organization_id = EXCLUDED.organization_id;

INSERT INTO integrator.user_reminder_occurrences (id, rule_id, occurrence_key, planned_at, status, organization_id)
VALUES
  ('p0-13-occurrence-a1', 'p0-13-rule-a1', 'p0-13-occurrence-a1', '2099-01-01T00:00:00Z', 'planned', '${syntheticFixtureIds.orgA}'::uuid),
  ('p0-13-occurrence-b1', 'p0-13-rule-b1', 'p0-13-occurrence-b1', '2099-01-01T00:00:00Z', 'planned', '${syntheticFixtureIds.orgB}'::uuid)
ON CONFLICT (id) DO UPDATE
  SET rule_id = EXCLUDED.rule_id,
      occurrence_key = EXCLUDED.occurrence_key,
      planned_at = EXCLUDED.planned_at,
      status = EXCLUDED.status,
      organization_id = EXCLUDED.organization_id;

INSERT INTO integrator.user_reminder_delivery_logs (id, occurrence_id, channel, status, organization_id)
VALUES
  ('integrator-reminder-log-a1', 'p0-13-occurrence-a1', 'p0_13', 'sent', '${syntheticFixtureIds.orgA}'::uuid),
  ('integrator-reminder-log-b1', 'p0-13-occurrence-b1', 'p0_13', 'sent', '${syntheticFixtureIds.orgB}'::uuid)
ON CONFLICT (id) DO UPDATE
  SET occurrence_id = EXCLUDED.occurrence_id,
      channel = EXCLUDED.channel,
      status = EXCLUDED.status,
      organization_id = EXCLUDED.organization_id;
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const format = process.argv[2] ?? '--tsv';

  if (format === '--tsv') {
    process.stdout.write(renderP013SyntheticFixtureManifestTsv());
  } else if (format === '--sql') {
    process.stdout.write(renderP013SyntheticFixtureScratchSql());
  } else if (format === '--json') {
    process.stdout.write(`${JSON.stringify(p013SyntheticFixture, null, 2)}\n`);
  } else {
    throw new Error(`Unsupported format ${format}. Use --tsv, --sql, or --json.`);
  }
}

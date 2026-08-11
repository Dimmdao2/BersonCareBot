#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  renderP013SyntheticFixtureCompatSchemaSql,
  renderP013SyntheticFixtureScratchSql,
} from './p0-13-synthetic-fixtures.mjs';

const repoRoot = process.cwd();
const dbName = `bcb_saas_p0_13_1_scratch_${process.pid}_${Date.now()}`;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status ?? 'unknown status'}`,
    );
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(sql) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', dbName], {
    input: sql,
  });
}

const assertionSql = `
SELECT (count(*) = 2)::int AS org_count_ok FROM public.be_organizations \\gset
\\if :org_count_ok
\\else
\\echo 'FATAL: expected two synthetic organizations.'
SELECT 1/0; -- psql 16's quit ignores an exit-status argument; force a real error under ON_ERROR_STOP instead
\\endif

SELECT (count(*) = 5)::int AS user_count_ok FROM public.platform_users \\gset
\\if :user_count_ok
\\else
\\echo 'FATAL: expected five synthetic platform users.'
SELECT 1/0; -- psql 16's quit ignores an exit-status argument; force a real error under ON_ERROR_STOP instead
\\endif

SELECT (count(*) FILTER (WHERE organization_key = 'org_a') > 0 AND count(*) FILTER (WHERE organization_key = 'org_b') > 0)::int AS manifest_orgs_ok
FROM p0_13_fixture.synthetic_rows \\gset
\\if :manifest_orgs_ok
\\else
\\echo 'FATAL: manifest must include org A and org B rows.'
SELECT 1/0; -- psql 16's quit ignores an exit-status argument; force a real error under ON_ERROR_STOP instead
\\endif

SELECT (count(*) FILTER (WHERE patient_key = 'patient_a1') > 0 AND count(*) FILTER (WHERE patient_key = 'patient_a2') > 0 AND count(*) FILTER (WHERE patient_key = 'patient_b1') > 0)::int AS manifest_patients_ok
FROM p0_13_fixture.synthetic_rows \\gset
\\if :manifest_patients_ok
\\else
\\echo 'FATAL: manifest must include same-org and cross-org patient rows.'
SELECT 1/0; -- psql 16's quit ignores an exit-status argument; force a real error under ON_ERROR_STOP instead
\\endif

SELECT (
  EXISTS (SELECT 1 FROM public.be_organization_members WHERE organization_id = '13000000-0000-4000-8000-0000000000a1'::uuid AND platform_user_id = '13000000-0000-4000-8000-00000000d0a1'::uuid)
  AND EXISTS (SELECT 1 FROM public.be_organization_members WHERE organization_id = '13000000-0000-4000-8000-0000000000b1'::uuid AND platform_user_id = '13000000-0000-4000-8000-00000000d0b1'::uuid)
  AND EXISTS (SELECT 1 FROM public.org_enrollments WHERE organization_id = '13000000-0000-4000-8000-0000000000a1'::uuid AND platform_user_id = '13000000-0000-4000-8000-00000000a101'::uuid)
  AND EXISTS (SELECT 1 FROM public.org_enrollments WHERE organization_id = '13000000-0000-4000-8000-0000000000b1'::uuid AND platform_user_id = '13000000-0000-4000-8000-00000000b101'::uuid)
  AND EXISTS (SELECT 1 FROM public.be_package_items WHERE id = md5('p0.13 fk-package-item-a')::uuid)
  AND EXISTS (SELECT 1 FROM public.be_package_items WHERE id = md5('p0.13 fk-package-item-b')::uuid)
  AND EXISTS (SELECT 1 FROM public.be_patient_package_items WHERE id = md5('p0.13 fk-patient-package-item-a2')::uuid)
  AND EXISTS (SELECT 1 FROM public.notification_delivery_attempts WHERE event_id = 'denorm-notification-attempt-b1')
  AND EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'p0_13_fixture_global' AND scope = 'admin' AND organization_id IS NULL)
  AND EXISTS (SELECT 1 FROM integrator.user_reminder_delivery_logs WHERE id = 'integrator-reminder-log-a1')
)::int AS target_rows_ok \\gset
\\if :target_rows_ok
\\else
\\echo 'FATAL: representative synthetic target rows missing.'
SELECT 1/0; -- psql 16's quit ignores an exit-status argument; force a real error under ON_ERROR_STOP instead
\\endif
`;

try {
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);
  psql(renderP013SyntheticFixtureCompatSchemaSql());
  psql(renderP013SyntheticFixtureScratchSql());
  psql(assertionSql);
  console.log(`smoke-p0-13-synthetic-fixtures: OK (${dbName})`);
} finally {
  run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
}

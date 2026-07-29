#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const contractPath = 'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const scenarios = new Map(
  [...contract.readOnlyScenarios, ...contract.mutationScenarios].map((scenario) => [
    scenario.id,
    scenario,
  ]),
);

const health = scenarios.get('global-admin.system-health.api');
if (
  health?.actor !== 'global_admin' ||
  health.expectStatus !== 200 ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.schemaVersion') ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.coverageComplete') ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.trend.daily7Days')
) {
  throw new Error(`${contractPath}: global-admin System Health contract is incomplete`);
}
for (const id of ['doctor.system-health.denied', 'clinic-admin.system-health.denied']) {
  const scenario = scenarios.get(id);
  if (scenario?.expectStatus !== 403 || scenario.expectAuthDenial !== true) {
    throw new Error(`${contractPath}: ${id} must be an explicit 403 denial`);
  }
}
for (const id of [
  'public.app.entry',
  'public.login.config',
  'public.specialist-clinic-registration.entry',
  'public.booking.entry',
]) {
  if (scenarios.get(id)?.actor !== 'public') {
    throw new Error(`${contractPath}: ${id} must use public auth`);
  }
}
const adminWrite = scenarios.get('global-admin.clinical-write.denied');
if (
  adminWrite?.actor !== 'global_admin' ||
  adminWrite.method !== 'POST' ||
  adminWrite.expectStatus !== 403 ||
  adminWrite.expectAuthDenial !== true ||
  adminWrite.disabledByDefault !== true
) {
  throw new Error(`${contractPath}: global-admin clinical-write denial is incomplete`);
}
const specialistEngagementAnalytics = scenarios.get('doctor.analytics.patient-engagement');
if (
  !['doctor', 'clinic_admin'].includes(specialistEngagementAnalytics?.actor) ||
  specialistEngagementAnalytics?.path !==
    '/api/doctor/treatment-program-instances/{patientProgramInstanceId}/action-log' ||
  specialistEngagementAnalytics.jsonExpectation?.requireSuccess !== true ||
  !specialistEngagementAnalytics.jsonExpectation?.nonEmptyPaths?.includes('entries')
) {
  throw new Error(`${contractPath}: tenant specialist engagement analytics contract is incomplete`);
}

function runWrapperSourceGuardSelfTest() {
  const wrapperPath = 'deploy/host/run-u5a-patient-organization-test-lifecycle.sh';
  const scratch = mkdtempSync(path.join(tmpdir(), 'bcb-u5a-wrapper-source-guard.'));
  const canonicalRoot = path.join(scratch, 'canonical-test');
  const exactPath = path.join(
    canonicalRoot,
    'deploy/host/run-u5a-patient-organization-test-lifecycle.sh',
  );
  const payloadPath = path.join(scratch, 'wrapper-payload.sh');
  const aliasPath = path.join(scratch, 'wrapper-alias.sh');
  const transformed = readFileSync(wrapperPath, 'utf8')
    .replace(
      'readonly REQUIRED_PROJECT_ROOT="/opt/projects/bersoncarebot-test"',
      `readonly REQUIRED_PROJECT_ROOT="${canonicalRoot}"`,
    )
    .replace(
      'readonly WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"',
      `readonly WEBAPP_ENV="${path.join(scratch, 'missing-webapp.test')}"`,
    );
  const run = (sourcePath, cwd = scratch) =>
    spawnSync('bash', [sourcePath, 'status'], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
  const output = (result) => `${result.stdout ?? ''}${result.stderr ?? ''}`;

  try {
    mkdirSync(path.dirname(exactPath), { recursive: true });
    writeFileSync(payloadPath, transformed, { mode: 0o755 });
    writeFileSync(exactPath, transformed, { mode: 0o755 });

    const canonical = run(exactPath);
    assert.notEqual(canonical.status, 0);
    assert.doesNotMatch(output(canonical), /wrapper source (?:must|alias)/u);

    writeFileSync(aliasPath, transformed, { mode: 0o755 });
    assert.match(output(run(aliasPath)), /wrapper source must be the exact canonical path/u);
    assert.match(
      output(run(path.relative(canonicalRoot, exactPath), canonicalRoot)),
      /wrapper source must be the exact canonical path/u,
    );

    unlinkSync(exactPath);
    symlinkSync(payloadPath, exactPath);
    assert.match(output(run(exactPath)), /contains a symlink component/u);

    unlinkSync(exactPath);
    const fifo = spawnSync('mkfifo', [exactPath], { encoding: 'utf8' });
    assert.equal(fifo.status, 0, fifo.stderr);
    const writer = spawn('sh', ['-c', 'exec cat "$1" > "$2"', 'writer', payloadPath, exactPath], {
      stdio: 'ignore',
    });
    assert.match(output(run(exactPath)), /must be a regular file/u);
    writer.kill();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  runWrapperSourceGuardSelfTest();
  console.log('check-owner-ready-test-integration self-test: OK');
} else {
  console.log('check-owner-ready-test-integration: contract data OK');
}

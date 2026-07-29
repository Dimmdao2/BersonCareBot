#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const files = {
  contract: 'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json',
  smokeRunner: 'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs',
  smokeLoginPacket: 'deploy/host/smoke-login-packet.mjs',
  smokeLoginPasswordConverger: 'apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs',
  smokeLoginPasswordConvergerTest: 'deploy/host/converge-saas-smoke-login-passwords.test.mjs',
};

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function validateContract(contractText = read(files.contract)) {
  const contract = JSON.parse(contractText);
  const patientMediaPlayback = contract.readOnlyScenarios?.find(
    (scenario) => scenario.id === 'patient.media.playback',
  );
  if (patientMediaPlayback?.actor !== 'patient') {
    throw new Error(`${files.contract}: patient.media.playback must use the patient actor`);
  }

  const scenariosById = new Map(
    contract.readOnlyScenarios.map((scenario) => [scenario.id, scenario]),
  );
  const systemHealth = scenariosById.get('global-admin.system-health.api');
  if (
    systemHealth?.actor !== 'global_admin' ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.schemaVersion') ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.coverageComplete') ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.trend.daily7Days')
  ) {
    throw new Error(`${files.contract}: global-admin system-health contract is incomplete`);
  }

  const specialistAnalytics = scenariosById.get('doctor.analytics.patient-engagement');
  if (
    !['doctor', 'clinic_admin'].includes(specialistAnalytics?.actor) ||
    specialistAnalytics?.category !== 'analytics' ||
    specialistAnalytics?.method !== 'GET' ||
    specialistAnalytics?.path !==
      '/api/doctor/treatment-program-instances/{patientProgramInstanceId}/action-log' ||
    specialistAnalytics.expectStatus !== 200 ||
    specialistAnalytics.jsonExpectation?.requireSuccess !== true ||
    !specialistAnalytics.jsonExpectation?.nonEmptyPaths?.includes('entries')
  ) {
    throw new Error(`${files.contract}: specialist engagement analytics contract is incomplete`);
  }

  for (const id of ['doctor.system-health.denied', 'clinic-admin.system-health.denied']) {
    const scenario = scenariosById.get(id);
    if (scenario?.expectStatus !== 403 || scenario.expectAuthDenial !== true) {
      throw new Error(`${files.contract}: ${id} must be an explicit authorization denial`);
    }
  }

  const clinicalWriteDenied = contract.mutationScenarios.find(
    (scenario) => scenario.id === 'global-admin.clinical-write.denied',
  );
  if (
    clinicalWriteDenied?.actor !== 'global_admin' ||
    clinicalWriteDenied.method !== 'POST' ||
    clinicalWriteDenied.expectStatus !== 403 ||
    clinicalWriteDenied.expectAuthDenial !== true ||
    clinicalWriteDenied.disabledByDefault !== true
  ) {
    throw new Error(`${files.contract}: global-admin clinical-write denial is incomplete`);
  }

  for (const id of [
    'public.app.entry',
    'public.login.config',
    'public.specialist-clinic-registration.entry',
    'public.booking.entry',
  ]) {
    if (scenariosById.get(id)?.actor !== 'public') {
      throw new Error(`${files.contract}: ${id} must use public auth`);
    }
  }

  for (const [id, path] of [
    ['doctor.working-hours.api', 'rows'],
    ['doctor.appointments.list', 'appointments'],
    ['public.booking.slots', 'slots'],
  ]) {
    const expectation = scenariosById.get(id)?.jsonExpectation;
    if (
      expectation?.type !== 'object' ||
      expectation.requireSuccess !== true ||
      !expectation.nonEmptyPaths?.includes(path)
    ) {
      throw new Error(`${files.contract}: ${id} must require non-empty ${path}`);
    }
  }

  const publicBookingSlots = scenariosById.get('public.booking.slots');
  const expectedQuery = new Map([
    ['type', 'in_person'],
    ['branchId', '{publicBookingBranchId}'],
    ['serviceId', '{publicBookingClinicServiceId}'],
    ['orgSlug', '{publicBookingOrganizationSlug}'],
  ]);
  const slotsUrl = new URL(publicBookingSlots?.path ?? '', 'https://smoke.invalid');
  if (
    slotsUrl.pathname !== '/api/booking/public/slots' ||
    [...slotsUrl.searchParams.keys()].length !== expectedQuery.size ||
    [...expectedQuery].some(
      ([key, value]) =>
        slotsUrl.searchParams.getAll(key).length !== 1 || slotsUrl.searchParams.get(key) !== value,
    )
  ) {
    throw new Error(`${files.contract}: public booking fixture bindings are incomplete`);
  }

  const serialized = JSON.stringify(contract);
  if (serialized.includes('branchServiceId') || serialized.includes('publicBookingServiceId')) {
    throw new Error(`${files.contract}: retired public-booking keys remain`);
  }

  const discussion = scenariosById.get('patient.program.item.discussion-summary')?.jsonExpectation;
  if (
    discussion?.requireSuccess !== true ||
    !discussion.fixtureKeys?.some(
      (check) => check.path === 'summaryByItemId' && check.ref === 'patientProgramItemId',
    )
  ) {
    throw new Error(`${files.contract}: discussion summary fixture binding is incomplete`);
  }

  const playback = patientMediaPlayback?.jsonExpectation;
  if (
    !playback?.fixtureEquals?.some(
      (check) => check.path === 'mediaId' && check.ref === 'mediaFileId',
    ) ||
    !playback.fixtureContains?.some(
      (check) => check.path === 'mp4.url' && check.ref === 'mediaFileId',
    ) ||
    !playback.allowedValues?.some(
      (check) =>
        check.path === 'delivery' &&
        ['hls', 'mp4', 'file'].every((delivery) => check.values?.includes(delivery)),
    )
  ) {
    throw new Error(`${files.contract}: playback fixture binding is incomplete`);
  }

  return contract;
}

function makeSyntheticFixtureFile({ globalAdminMode = true } = {}) {
  const contract = validateContract();
  const tempDir = mkdtempSync(resolve(tmpdir(), 'bcb-saas-product-smoke-'));
  const fixturePath = resolve(tempDir, 'synthetic.fixture.json');
  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: 'synthetic-doctor-cookie' } },
      clinic_admin: { headers: { Cookie: 'synthetic-admin-cookie' } },
      patient: { headers: { Cookie: 'synthetic-patient-cookie' } },
      global_admin: {
        headers: { Cookie: 'synthetic-global-admin-cookie' },
        ...(globalAdminMode ? { adminMode: true } : {}),
      },
      public: { headers: {} },
    },
    refs: Object.fromEntries(contract.requiredFixtureRefs.map((key) => [key, `synthetic-${key}`])),
    forbiddenBodyText: ['synthetic-forbidden-sentinel'],
  };
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  return { tempDir, fixturePath };
}

function runStep(step, stdio = 'inherit') {
  const result = spawnSync(step[0], step.slice(1), { stdio });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function expectContractMutationRejected(label, mutatedText) {
  try {
    validateContract(mutatedText);
  } catch {
    return;
  }
  throw new Error(`self-test failed to reject ${label}`);
}

function runSelfTest() {
  const contractText = read(files.contract);
  expectContractMutationRejected(
    'global-admin authority mutation',
    contractText.replace('"actor": "global_admin"', '"actor": "clinic_admin"'),
  );
  const specialistMutation = JSON.parse(contractText);
  specialistMutation.readOnlyScenarios.find(
    (scenario) => scenario.id === 'doctor.analytics.patient-engagement',
  ).actor = 'global_admin';
  expectContractMutationRejected(
    'specialist analytics authority mutation',
    JSON.stringify(specialistMutation),
  );

  const { tempDir, fixturePath } = makeSyntheticFixtureFile({ globalAdminMode: false });
  try {
    const status = runStep(
      [
        'node',
        files.smokeRunner,
        '--check-fixture',
        `--fixture-file=${fixturePath}`,
        '--categories=system_health',
      ],
      'ignore',
    );
    if (status === 0) {
      throw new Error('self-test failed to reject fixture without global-admin adminMode');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('check-saas-product-smoke-contract self-test: OK');
}

function runMain() {
  validateContract();
  const steps = [
    ['node', '--check', files.smokeRunner],
    ['node', files.smokeRunner, '--check-contract'],
    ['node', files.smokeRunner, '--self-test'],
    ['node', '--check', files.smokeLoginPacket],
    ['node', '--check', files.smokeLoginPasswordConverger],
    ['node', '--test', files.smokeLoginPasswordConvergerTest],
  ];
  const { tempDir, fixturePath } = makeSyntheticFixtureFile();
  steps.push([
    'node',
    files.smokeRunner,
    '--check-fixture',
    `--fixture-file=${fixturePath}`,
    '--categories=doctor',
  ]);
  try {
    for (const step of steps) {
      console.log(`check-saas-product-smoke-contract: $ ${step.join(' ')}`);
      const status = runStep(step);
      if (status !== 0) {
        console.error(`check-saas-product-smoke-contract: FAILED ${step.join(' ')}`);
        process.exit(status);
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('check-saas-product-smoke-contract: OK');
}

if (process.argv.includes('--self-test')) runSelfTest();
else runMain();

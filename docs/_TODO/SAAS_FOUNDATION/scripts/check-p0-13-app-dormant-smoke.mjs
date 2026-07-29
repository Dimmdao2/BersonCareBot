#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();

const files = {
  checklist: 'docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md',
  appRouterSmoke: 'apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts',
  doctorSmoke: 'apps/webapp/e2e/doctor-pages-inprocess.test.ts',
  patientSmoke: 'apps/webapp/e2e/patient-playback-inprocess.test.ts',
  devBypassRoute: 'apps/webapp/src/app/api/auth/dev-bypass/route.ts',
  devBypassPolicy: 'apps/webapp/src/modules/auth/devBypassPolicy.ts',
  devBypassClassification: 'apps/webapp/src/modules/auth/appEntryClassification.test.ts',
  devBypassExchange:
    'apps/webapp/src/modules/auth/exchangeIntegratorToken.devBypassPhoneTrust.test.ts',
};

const appSmokeTestFiles = [
  'e2e/smoke-app-router-rsc-pages-inprocess.test.ts',
  'e2e/doctor-pages-inprocess.test.ts',
  'e2e/patient-playback-inprocess.test.ts',
  'src/modules/auth/appEntryClassification.test.ts',
  'src/modules/auth/exchangeIntegratorToken.devBypassPhoneTrust.test.ts',
];

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function assertContains(path, text, token) {
  if (!text.includes(token)) throw new Error(`${path} missing token: ${token}`);
}

function runChecks(overrides = {}) {
  const checklist = overrides.checklist ?? read(files.checklist);
  const appRouterSmoke = overrides.appRouterSmoke ?? read(files.appRouterSmoke);
  const doctorSmoke = overrides.doctorSmoke ?? read(files.doctorSmoke);
  const patientSmoke = overrides.patientSmoke ?? read(files.patientSmoke);
  const devBypassRoute = overrides.devBypassRoute ?? read(files.devBypassRoute);
  const devBypassPolicy = overrides.devBypassPolicy ?? read(files.devBypassPolicy);
  const devBypassClassification =
    overrides.devBypassClassification ?? read(files.devBypassClassification);
  const devBypassExchange = overrides.devBypassExchange ?? read(files.devBypassExchange);

  for (const token of [
    '- [x] Current single-clinic doctor smoke unchanged.',
    '- [x] Current patient smoke unchanged.',
    '- [x] Dev-bypass still works in development.',
    '- [x] No subagent starts a dev server unless the stage explicitly requires UI smoke.',
    '- [x] No real external channels are triggered.',
  ]) {
    assertContains(files.checklist, checklist, token);
  }

  for (const token of [
    'doctorRoot',
    'doctorAppointments',
    'doctorMessages',
    'patientDiary',
    'patientBookingNew',
    'patientContentSlug',
    'patientGoReminderTarget',
  ]) {
    assertContains(files.appRouterSmoke, appRouterSmoke, token);
  }

  for (const token of [
    'doctorStats getDashboardMetrics',
    'doctorMessaging listAllMessages',
    'DoctorSupportInbox',
    'DoctorChatPanel',
  ]) {
    assertContains(files.doctorSmoke, doctorSmoke, token);
  }

  for (const token of [
    'GET /api/media/[id]/playback',
    'resolveMediaPlaybackPayload',
    'PatientContentAdaptiveVideo',
  ]) {
    assertContains(files.patientSmoke, patientSmoke, token);
  }

  for (const token of [
    'isDevAuthBypassEnabled',
    'dev:client',
    'dev:doctor',
    'dev:clinic-admin',
    'dev:admin',
    'getPostAuthRedirectTarget',
  ]) {
    assertContains(files.devBypassRoute, devBypassRoute, token);
  }

  for (const token of ["input.nodeEnv === 'development'", 'input.allowDevAuthBypass']) {
    assertContains(files.devBypassPolicy, devBypassPolicy, token);
  }

  for (const token of [
    'detects dev bypass tokens',
    'blocks dev bypass token exchange without switch=1',
    'allows dev bypass token exchange only with switch=1',
  ]) {
    assertContains(files.devBypassClassification, devBypassClassification, token);
  }

  for (const token of [
    'writes phone + patient_phone_trust_at for dev:client',
    'writes phone only for dev:admin',
    'forces preset role for dev:admin',
    'provisions an owner workspace for dev:clinic-admin',
    'getTelegramBotToken: async () => ""',
    'getMaxBotApiKey: async () => ""',
  ]) {
    assertContains(files.devBypassExchange, devBypassExchange, token);
  }
}

function runAppSmoke() {
  const args = ['--dir', 'apps/webapp', 'exec', 'vitest', 'run', ...appSmokeTestFiles];
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: '',
      USE_REAL_DATABASE: '0',
    },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `app dormant smoke failed: pnpm ${args.join(' ')} exited with ${result.status ?? 'unknown status'}`,
    );
  }
}

if (process.argv.includes('--self-test')) {
  const checklist = read(files.checklist).replace(
    '- [x] Dev-bypass still works in development.',
    '- [ ] Dev-bypass still works in development.',
  );

  try {
    runChecks({ checklist });
  } catch {
    console.log('check-p0-13-app-dormant-smoke self-test: OK');
    process.exit(0);
  }

  throw new Error('self-test did not detect missing dev-bypass checklist seal');
}

try {
  runChecks();
  runAppSmoke();
  console.log('check-p0-13-app-dormant-smoke: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-13-app-dormant-smoke: ${message}`);
  process.exit(1);
}

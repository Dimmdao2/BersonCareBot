#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const appSmokeTestFiles = [
  'e2e/smoke-app-router-rsc-pages-inprocess.test.ts',
  'e2e/doctor-pages-inprocess.test.ts',
  'e2e/patient-playback-inprocess.test.ts',
  'src/modules/auth/appEntryClassification.test.ts',
  'src/modules/auth/exchangeIntegratorToken.devBypassPhoneTrust.test.ts',
];

const args = ['--dir', 'apps/webapp', 'exec', 'vitest', 'run', ...appSmokeTestFiles];
const result = spawnSync('pnpm', args, {
  cwd: process.cwd(),
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

console.log('check-p0-13-app-dormant-smoke: executable smoke OK');

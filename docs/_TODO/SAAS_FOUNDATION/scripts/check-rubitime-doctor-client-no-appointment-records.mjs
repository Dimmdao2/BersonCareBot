#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-doctor-client-no-appointment-records.mjs

Checks that doctor/patient runtime routes, UI and modules do not read public.appointment_records.
The deprecated table may still be used by projection/archive/backfill code until R7.`;

const scanRoots = [
  'apps/webapp/src/app/api/doctor',
  'apps/webapp/src/app/api/patient',
  'apps/webapp/src/app/app/doctor',
  'apps/webapp/src/app/app/patient',
  'apps/webapp/src/modules/appointments',
  'apps/webapp/src/modules/doctor-appointments',
  'apps/webapp/src/modules/doctor-clients',
  'apps/webapp/src/modules/patient-booking',
  'apps/webapp/src/modules/patient-cabinet',
];

const explicitFiles = [
  'apps/webapp/src/app-layer/di/buildAppDeps.ts',
  'apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts',
];

const forbiddenPatterns = [
  /appointment_records/g,
  /appointmentRecords/g,
  /createPgDoctorAppointmentsPort/g,
  /doctorAppointmentsLegacyPort/g,
];

function shouldSkipDir(name) {
  return name === 'node_modules' || name === '.next' || name === 'dist' || name === 'coverage';
}

function shouldScanFile(name) {
  return (
    (name.endsWith('.ts') || name.endsWith('.tsx')) &&
    !name.endsWith('.test.ts') &&
    !name.endsWith('.test.tsx') &&
    !name.endsWith('.spec.ts') &&
    !name.endsWith('.spec.tsx') &&
    !name.endsWith('.d.ts')
  );
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (!shouldSkipDir(name)) out.push(...listFiles(abs));
      continue;
    }
    if (shouldScanFile(name)) out.push(abs);
  }
  return out;
}

function countMatches(src) {
  let count = 0;
  for (const pattern of forbiddenPatterns) {
    pattern.lastIndex = 0;
    count += [...src.matchAll(pattern)].length;
  }
  return count;
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const files = [
  ...scanRoots.flatMap((root) => listFiles(join(repoRoot, root))),
  ...explicitFiles.map((rel) => join(repoRoot, rel)).filter((abs) => existsSync(abs)),
];

const offenders = [];
for (const abs of files) {
  const src = readFileSync(abs, 'utf8');
  const hits = countMatches(src);
  if (hits > 0) {
    offenders.push({
      path: relative(repoRoot, abs).replace(/\\/g, '/'),
      hits,
    });
  }
}

if (offenders.length > 0) {
  console.error('check-rubitime-doctor-client-no-appointment-records: FAILED');
  for (const offender of offenders) {
    console.error(`  - ${offender.path} (${offender.hits})`);
  }
  process.exit(1);
}

console.log(
  `check-rubitime-doctor-client-no-appointment-records: OK (${files.length} runtime files scanned)`,
);

#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs [--expect-post-r6]

Static, aggregate-only R6/R7 inventory. It does not connect to DB, read env files,
call Rubitime, or inspect patient data.

Default mode records known pre-cutoff runtime references.
--expect-post-r6 fails if R6 runtime blockers remain.`;

const scanRoots = [
  'apps/integrator/src',
  'apps/webapp/src',
  'apps/webapp/scripts',
  'packages/booking-rubitime-sync/src',
  'packages/operator-db-schema/src',
];

const runtimeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

const categories = [
  {
    key: 'mountedRubitimeRouteLiterals',
    description: 'Runtime route literals that still expose Rubitime-named HTTP surfaces.',
    phase: 'R6',
    postR6MustBeZero: true,
    patterns: [
      /\bapp\.(?:get|post|put|patch|delete)\(\s*["'][^"']*rubitime[^"']*["']/g,
      /["']\/api\/bersoncare\/rubitime\/[^"']*["']/g,
      /["']\/webhook\/rubitime\/[^"']*["']/g,
      /["']\/api\/rubitime[^"']*["']/g,
    ],
  },
  {
    key: 'integratorRubitimeRuntimeImports',
    description: 'Runtime imports from apps/integrator/src/integrations/rubitime.',
    phase: 'R6',
    postR6MustBeZero: true,
    patterns: [
      /from\s+["'][^"']*integrations\/rubitime\/[^"']*["']/g,
      /import\(\s*["'][^"']*integrations\/rubitime\/[^"']*["']/g,
      /from\s+["']\.\.\/integrations\/rubitime\/[^"']*["']/g,
      /from\s+["']\.\/rubitime\/[^"']*["']/g,
    ],
  },
  {
    key: 'rubitimeApiClientRuntimeTokens',
    description: 'Runtime code that can still call or throttle Rubitime API/client paths.',
    phase: 'R6',
    postR6MustBeZero: true,
    patterns: [
      /createRubitimeClient/g,
      /RubitimeClient/g,
      /rubitimeApiThrottle/g,
      /withRubitimeApiThrottle/g,
      /api2\/(?:get-schedule|get-record|create-record|update-record|remove-record)/g,
      /runPostCreateProjection/g,
    ],
  },
  {
    key: 'legacyAppointmentRecordRuntimeRefs',
    description: 'Runtime references to public.appointment_records / appointmentRecords.',
    phase: 'R6/R7',
    postR6MustBeZero: false,
    patterns: [
      /appointment_records/g,
      /appointmentRecords/g,
    ],
  },
  {
    key: 'rubitimeRawTableRuntimeRefs',
    description: 'Runtime references to raw Rubitime tables scheduled for archive/drop.',
    phase: 'R7',
    postR6MustBeZero: false,
    patterns: [
      /rubitime_records/g,
      /rubitimeRecords/g,
      /rubitime_events/g,
      /rubitimeEvents/g,
      /rubitime_api_throttle/g,
      /rubitimeApiThrottle/g,
      /rubitime_create_retry_jobs/g,
      /rubitime_booking_profiles/g,
      /rubitimeBookingProfiles/g,
      /rubitime_branches/g,
      /rubitimeBranches/g,
      /rubitime_services/g,
      /rubitimeServices/g,
      /rubitime_cooperators/g,
      /rubitimeCooperators/g,
    ],
  },
  {
    key: 'providerNeutralKeepTableRefs',
    description: 'Provider-neutral or explicitly kept table references; not a drop signal.',
    phase: 'R7 keep-list',
    postR6MustBeZero: false,
    patterns: [
      /booking_calendar_map/g,
      /bookingCalendarMap/g,
      /be_external_entity_mappings/g,
      /externalEntityMappings/g,
      /patient_bookings/g,
      /patientBookings/g,
    ],
  },
  {
    key: 'rubitimeOpsToolingRefs',
    description: 'Ops/audit scripts with Rubitime references; reported but not a post-R6 runtime blocker.',
    phase: 'R6/R7 ops',
    postR6MustBeZero: false,
    fileFilter: (rel) => isOpsToolingFile(rel),
    patterns: [
      /rubitime/gi,
      /appointment_records/g,
      /appointmentRecords/g,
    ],
  },
];

function shouldSkipDir(name) {
  return name === 'node_modules' || name === '.next' || name === 'dist' || name === 'coverage';
}

function extensionOf(name) {
  const match = name.match(/(\.[^.]+)$/);
  return match?.[1] ?? '';
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
    if (runtimeExtensions.has(extensionOf(name))) out.push(abs);
  }
  return out;
}

function isRuntimeFile(rel) {
  return !(
    rel.endsWith('.test.ts') ||
    rel.endsWith('.test.tsx') ||
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.spec.tsx') ||
    rel.endsWith('.d.ts') ||
    rel.includes('/__tests__/') ||
    rel.includes('/test-fixtures/')
  );
}

function isOpsToolingFile(rel) {
  return rel.startsWith('apps/webapp/scripts/') || rel.includes('/infra/scripts/');
}

function countMatches(src, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    count += [...src.matchAll(pattern)].length;
  }
  return count;
}

function collect() {
  const files = scanRoots
    .flatMap((root) => listFiles(join(repoRoot, root)))
    .map((abs) => ({
      abs,
      rel: relative(repoRoot, abs).replace(/\\/g, '/'),
    }))
    .filter((file) => isRuntimeFile(file.rel));

  const sourceFiles = files.map((file) => ({
    ...file,
    src: readFileSync(file.abs, 'utf8'),
  }));

  const categoryResults = categories.map((category) => {
    const filesWithHits = [];
    let totalHits = 0;
    const filesForCategory = sourceFiles.filter((file) => {
      if (category.fileFilter) return category.fileFilter(file.rel);
      if (category.postR6MustBeZero && isOpsToolingFile(file.rel)) return false;
      return true;
    });
    for (const file of filesForCategory) {
      const hits = countMatches(file.src, category.patterns);
      if (hits === 0) continue;
      totalHits += hits;
      filesWithHits.push({ path: file.rel, hits });
    }
    return {
      key: category.key,
      description: category.description,
      phase: category.phase,
      postR6MustBeZero: category.postR6MustBeZero,
      totalHits,
      fileCount: filesWithHits.length,
      files: filesWithHits,
    };
  });

  return {
    mode: process.argv.includes('--expect-post-r6') ? 'expect-post-r6' : 'pre-cutoff-inventory',
    repoRoot,
    scannedRoots: scanRoots,
    scannedRuntimeFiles: sourceFiles.length,
    generatedAt: new Date().toISOString(),
    categories: categoryResults,
  };
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const result = collect();
console.log(JSON.stringify(result, null, 2));

if (process.argv.includes('--expect-post-r6')) {
  const blockers = result.categories.filter(
    (category) => category.postR6MustBeZero && category.totalHits > 0,
  );
  if (blockers.length > 0) {
    console.error(
      `rubitime-r6-r7-static-inventory: post-R6 blockers remain: ${blockers
        .map((item) => `${item.key}=${item.totalHits}`)
        .join(', ')}`,
    );
    process.exit(1);
  }
}

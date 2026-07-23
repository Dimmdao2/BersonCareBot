#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const HELP = `Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs [--expect-post-r6|--self-test]

Static, aggregate-only R6/R7 inventory. It does not connect to DB, read env files,
call Rubitime, or inspect patient data.

Default mode records known pre-cutoff runtime references.
--expect-post-r6 fails if R6/direct-public retirement blockers remain.
--self-test proves every D0 blocker category changes the post-R6 verdict.`;

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
    key: 'rubitimeBookingUpsertRuntime',
    description: 'Rubitime-specific booking.upsert branch or booking-rubitime-sync package runtime.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) =>
      rel === 'apps/integrator/src/infra/db/writePort.ts'
      || rel.startsWith('packages/booking-rubitime-sync/src/'),
    pathPatterns: [
      /^packages\/booking-rubitime-sync\/src\/.+\.(?:ts|tsx|js|mjs)$/,
    ],
    patterns: [
      /case\s+["']booking\.upsert["']\s*:/g,
      /@bersoncare\/booking-rubitime-sync/g,
      /upsertPatientBookingFromRubitime/g,
      /resolveRubitimeStatusFromBookingUpsert/g,
    ],
  },
  {
    key: 'appointmentRecordUpsertedFanoutBuilder',
    description: 'buildAppointmentRecordUpsertedFanout producer builder remains in runtime.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/infra/db/'),
    patterns: [
      /buildAppointmentRecordUpsertedFanout/g,
    ],
  },
  {
    key: 'appointmentRecordUpsertedProducer',
    description: 'Integrator still produces the appointment.record.upserted projection event.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) =>
      rel === 'apps/integrator/src/kernel/contracts/projectionEventTypes.ts'
      || rel === 'apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts',
    patterns: [
      /export\s+const\s+APPOINTMENT_RECORD_UPSERTED\s*=\s*["']appointment\.record\.upserted["']/g,
      /eventType\s*:\s*APPOINTMENT_RECORD_UPSERTED/g,
    ],
  },
  {
    key: 'appointmentRecordUpsertedHandler',
    description: 'Webapp still handles the appointment.record.upserted projection event.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel === 'apps/webapp/src/modules/integrator/events.ts',
    patterns: [
      /const\s+APPOINTMENT_RECORD_UPSERTED\s*=\s*["']appointment\.record\.upserted["']/g,
      /event\.eventType\s*===\s*APPOINTMENT_RECORD_UPSERTED/g,
    ],
  },
  {
    key: 'integratorEventsRoute',
    description: 'Legacy webapp POST /api/integrator/events projection receiver remains mounted.',
    phase: 'D10',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel === 'apps/webapp/src/app/api/integrator/events/route.ts',
    pathPatterns: [
      /^apps\/webapp\/src\/app\/api\/integrator\/events\/route\.(?:ts|tsx|js|mjs)$/,
    ],
    patterns: [],
  },
  {
    key: 'projectionEmitOrEnqueueRuntime',
    description: 'Immediate HTTP projection fanout with outbox fallback remains in runtime.',
    phase: 'D10',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/'),
    patterns: [
      /tryEmitWebappProjectionThenEnqueue/g,
    ],
  },
  {
    key: 'projectionOutboxRuntime',
    description: 'Legacy projection_outbox transport storage/repositories remain in runtime.',
    phase: 'D10',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/'),
    patterns: [
      /projection_outbox/g,
      /projectionOutbox/g,
      /enqueueProjectionEvent/g,
      /claimDueProjectionEvents/g,
    ],
  },
  {
    key: 'projectionWorkerRuntime',
    description: 'Legacy projection-outbox worker implementation or loop remains in runtime.',
    phase: 'D10',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/infra/runtime/worker/'),
    pathPatterns: [
      /^apps\/integrator\/src\/infra\/runtime\/worker\/projectionWorker\.(?:ts|tsx|js|mjs)$/,
    ],
    patterns: [
      /runProjectionWorkerTick/g,
      /projectionOutboxLoop/g,
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
    description: 'Runtime references to raw Rubitime tables scheduled for archive/drop; ops tooling is reported separately.',
    phase: 'R7',
    postR6MustBeZero: false,
    fileFilter: (rel) => !isOpsToolingFile(rel),
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

function countPathMatches(rel, patterns = []) {
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(rel)) count += 1;
  }
  return count;
}

function collect(root = repoRoot) {
  const files = scanRoots
    .flatMap((scanRoot) => listFiles(join(root, scanRoot)))
    .map((abs) => ({
      abs,
      rel: relative(root, abs).replace(/\\/g, '/'),
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
      const hits =
        countMatches(file.src, category.patterns)
        + countPathMatches(file.rel, category.pathPatterns);
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
    repoRoot: root,
    scannedRoots: scanRoots,
    scannedRuntimeFiles: sourceFiles.length,
    generatedAt: new Date().toISOString(),
    postR6Verdict: {
      ready: categoryResults.every(
        (category) => !category.postR6MustBeZero || category.totalHits === 0,
      ),
      blockerCategories: categoryResults
        .filter((category) => category.postR6MustBeZero && category.totalHits > 0)
        .map((category) => ({ key: category.key, hits: category.totalHits })),
    },
    categories: categoryResults,
  };
}

function postR6Blockers(result) {
  return result.categories.filter(
    (category) => category.postR6MustBeZero && category.totalHits > 0,
  );
}

function writeSelfTestFixture(root, rel, source) {
  const absolutePath = join(root, rel);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

function runSelfTest() {
  const fixtures = [
    {
      key: 'rubitimeBookingUpsertRuntime',
      path: 'packages/booking-rubitime-sync/src/index.ts',
      source: 'export const activeRubitimeBookingSync = true;\n',
    },
    {
      key: 'appointmentRecordUpsertedFanoutBuilder',
      path: 'apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts',
      source: 'export function buildAppointmentRecordUpsertedFanout() { return {}; }\n',
    },
    {
      key: 'appointmentRecordUpsertedProducer',
      path: 'apps/integrator/src/kernel/contracts/projectionEventTypes.ts',
      source: "export const APPOINTMENT_RECORD_UPSERTED = 'appointment.record.upserted';\n",
    },
    {
      key: 'appointmentRecordUpsertedHandler',
      path: 'apps/webapp/src/modules/integrator/events.ts',
      source: [
        "const APPOINTMENT_RECORD_UPSERTED = 'appointment.record.upserted';",
        'export const handles = (event) => event.eventType === APPOINTMENT_RECORD_UPSERTED;',
        '',
      ].join('\n'),
    },
    {
      key: 'integratorEventsRoute',
      path: 'apps/webapp/src/app/api/integrator/events/route.ts',
      source: 'export async function POST() { return new Response(null); }\n',
    },
    {
      key: 'projectionEmitOrEnqueueRuntime',
      path: 'apps/integrator/src/infra/db/repos/projectionFanout.ts',
      source: 'export async function tryEmitWebappProjectionThenEnqueue() {}\n',
    },
    {
      key: 'projectionOutboxRuntime',
      path: 'apps/integrator/src/infra/db/repos/projectionOutbox.ts',
      source: "export const tableName = 'projection_outbox';\n",
    },
    {
      key: 'projectionWorkerRuntime',
      path: 'apps/integrator/src/infra/runtime/worker/projectionWorker.ts',
      source: 'export async function runProjectionWorkerTick() { return 0; }\n',
    },
  ];

  const resultRows = [];
  for (const fixture of fixtures) {
    const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-inventory-'));
    try {
      writeSelfTestFixture(
        root,
        'apps/integrator/src/self-test-placeholder.ts',
        'export const cleanFixture = true;\n',
      );
      const cleanBlockers = postR6Blockers(collect(root));
      if (cleanBlockers.length !== 0) {
        throw new Error(
          `clean fixture unexpectedly failed: ${cleanBlockers.map((item) => item.key).join(', ')}`,
        );
      }

      writeSelfTestFixture(root, fixture.path, fixture.source);
      const blockers = postR6Blockers(collect(root));
      const target = blockers.find((item) => item.key === fixture.key);
      if (!target || target.totalHits < 1) {
        throw new Error(`${fixture.key} fixture did not change the post-R6 verdict`);
      }
      const unexpected = blockers.filter((item) => item.key !== fixture.key);
      if (unexpected.length > 0) {
        throw new Error(
          `${fixture.key} fixture also triggered: ${unexpected.map((item) => item.key).join(', ')}`,
        );
      }
      resultRows.push({
        category: fixture.key,
        fixture: fixture.path,
        cleanVerdict: 'pass',
        fixtureVerdict: 'fail',
        hits: target.totalHits,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        selfTest: 'rubitime-r6-r7-static-inventory-d0',
        ok: true,
        cases: resultRows,
      },
      null,
      2,
    ),
  );
}

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const result = collect();
console.log(JSON.stringify(result, null, 2));
const blockers = postR6Blockers(result);

if (process.argv.includes('--expect-post-r6')) {
  if (blockers.length > 0) {
    console.error(
      `rubitime-r6-r7-static-inventory: post-R6 blockers remain: ${blockers
        .map((item) => `${item.key}=${item.totalHits}`)
        .join(', ')}`,
    );
    process.exit(1);
  }
} else if (blockers.length > 0) {
  console.error(
    `rubitime-r6-r7-static-inventory: inventory-only mode; post-R6 is NOT READY: ${blockers
      .map((item) => `${item.key}=${item.totalHits}`)
      .join(', ')}`,
  );
}

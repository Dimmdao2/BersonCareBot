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
    description:
      'Rubitime-specific booking.upsert branch or booking-rubitime-sync package runtime.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) =>
      rel === 'apps/integrator/src/infra/db/writePort.ts' ||
      rel.startsWith('packages/booking-rubitime-sync/src/'),
    fileContracts: [
      {
        path: /^apps\/integrator\/src\/infra\/db\/writePort\.ts$/,
        patterns: [
          /case\s+["']booking\.upsert["']\s*:/g,
          /@bersoncare\/booking-rubitime-sync/g,
          /upsertPatientBookingFromRubitime/g,
          /resolveRubitimeStatusFromBookingUpsert/g,
        ],
      },
      {
        path: /^packages\/booking-rubitime-sync\/src\/.+\.(?:ts|tsx|js|mjs)$/,
        patterns: [
          /\bexport\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*/g,
          /\bexport\s+(?:const|let|var|class)\s+[A-Za-z_$][\w$]*/g,
          /\bexport\s*\{[^}]+\}\s*from\s*["'][^"']+["']/g,
          /\bimport\s+(?!type\b)[^;]+from\s*["'][^"']+["']/g,
        ],
      },
    ],
    patterns: [],
  },
  {
    key: 'appointmentRecordUpsertedFanoutBuilder',
    description: 'buildAppointmentRecordUpsertedFanout producer builder remains in runtime.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/infra/db/'),
    patterns: [/buildAppointmentRecordUpsertedFanout/g],
  },
  {
    key: 'appointmentRecordUpsertedProducer',
    description: 'Integrator still produces the appointment.record.upserted projection event.',
    phase: 'R6/D9',
    postR6MustBeZero: true,
    fileFilter: (rel) =>
      rel === 'apps/integrator/src/kernel/contracts/projectionEventTypes.ts' ||
      rel === 'apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts',
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
    patterns: [/export\s+(?:async\s+)?function\s+POST\s*\(/g, /export\s+const\s+POST\s*=/g],
  },
  {
    key: 'projectionEmitOrEnqueueRuntime',
    description: 'Immediate HTTP projection fanout with outbox fallback remains in runtime.',
    phase: 'D10',
    postR6MustBeZero: true,
    fileFilter: (rel) => rel.startsWith('apps/integrator/src/'),
    patterns: [/tryEmitWebappProjectionThenEnqueue/g],
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
    patterns: [/runProjectionWorkerTick/g, /projectionOutboxLoop/g],
  },
  {
    key: 'legacyAppointmentRecordRuntimeRefs',
    description: 'Runtime references to public.appointment_records / appointmentRecords.',
    phase: 'R6/R7',
    postR6MustBeZero: false,
    patterns: [/appointment_records/g, /appointmentRecords/g],
  },
  {
    key: 'rubitimeRawTableRuntimeRefs',
    description:
      'Runtime references to raw Rubitime tables scheduled for archive/drop; ops tooling is reported separately.',
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
    description:
      'Ops/audit scripts with Rubitime references; reported but not a post-R6 runtime blocker.',
    phase: 'R6/R7 ops',
    postR6MustBeZero: false,
    fileFilter: (rel) => isOpsToolingFile(rel),
    patterns: [/rubitime/gi, /appointment_records/g, /appointmentRecords/g],
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
    rel.endsWith('.test.js') ||
    rel.endsWith('.test.mjs') ||
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.spec.tsx') ||
    rel.endsWith('.spec.js') ||
    rel.endsWith('.spec.mjs') ||
    rel.endsWith('.d.ts') ||
    rel.includes('/__tests__/') ||
    rel.includes('/test-fixtures/')
  );
}

function isOpsToolingFile(rel) {
  return rel.startsWith('apps/webapp/scripts/') || rel.includes('/infra/scripts/');
}

function isHistoricalMigrationFile(rel) {
  return rel.includes('/migrations/');
}

function looksLikeTestHelperFile(rel) {
  const basename = rel.slice(rel.lastIndexOf('/') + 1);
  return (
    rel.includes('/test-helpers/') ||
    rel.includes('/test-utils/') ||
    rel.includes('/testing/') ||
    rel.includes('/fixtures/') ||
    rel.includes('/mocks/') ||
    /(?:ForTests?|TestHelper|TestUtils|TestingHelper)\.(?:ts|tsx|js|mjs)$/.test(basename) ||
    /(?:^|[._-])(?:stub|fixture|mock|harness)(?:[._-]|[A-Z]|$)/.test(basename)
  );
}

function isTestOnlyHelperFile(rel, importUsage) {
  if (!looksLikeTestHelperFile(rel)) return false;
  const usage = importUsage.get(rel);
  return Boolean(usage && usage.testConsumers.size > 0 && usage.runtimeConsumers.size === 0);
}

function isExecutableRuntimeFile(rel, importUsage) {
  return (
    !isOpsToolingFile(rel) &&
    !isHistoricalMigrationFile(rel) &&
    !isTestOnlyHelperFile(rel, importUsage)
  );
}

const regexPrefixKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

/**
 * Replaces JavaScript/TypeScript line and block comments with spaces while preserving
 * source length, newlines, strings, regex literals and template raw text. Template
 * expressions return to normal code scanning so comments inside `${...}` are masked.
 */
function maskJsComments(source) {
  let output = '';
  let state = 'code';
  let quote = null;
  let regexInClass = false;
  let canStartRegex = true;
  const templateReturnStates = [];
  const templateExpressionDepths = [];

  function masked(char) {
    return char === '\n' || char === '\r' ? char : ' ';
  }

  for (let index = 0; index < source.length; ) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      output += masked(char);
      index += 1;
      if (char === '\n' || char === '\r') state = 'code';
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 2;
        state = 'code';
      } else {
        output += masked(char);
        index += 1;
      }
      continue;
    }

    if (state === 'string') {
      output += char;
      index += 1;
      if (char === '\\' && index < source.length) {
        output += source[index];
        index += 1;
      } else if (char === quote) {
        state = 'code';
        quote = null;
        canStartRegex = false;
      }
      continue;
    }

    if (state === 'regex') {
      output += char;
      index += 1;
      if (char === '\\' && index < source.length) {
        output += source[index];
        index += 1;
      } else if (char === '[') {
        regexInClass = true;
      } else if (char === ']') {
        regexInClass = false;
      } else if (char === '/' && !regexInClass) {
        while (index < source.length && /[A-Za-z]/.test(source[index])) {
          output += source[index];
          index += 1;
        }
        state = 'code';
        canStartRegex = false;
      } else if (char === '\n' || char === '\r') {
        state = 'code';
        canStartRegex = true;
      }
      continue;
    }

    if (state === 'template') {
      output += char;
      index += 1;
      if (char === '\\' && index < source.length) {
        output += source[index];
        index += 1;
      } else if (char === '`') {
        state = templateReturnStates.pop() ?? 'code';
        canStartRegex = false;
      } else if (char === '$' && source[index] === '{') {
        output += '{';
        index += 1;
        templateExpressionDepths.push(1);
        state = 'code';
        canStartRegex = true;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 2;
      state = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      output += '  ';
      index += 2;
      state = 'block-comment';
      continue;
    }
    if (char === "'" || char === '"') {
      output += char;
      index += 1;
      quote = char;
      state = 'string';
      continue;
    }
    if (char === '`') {
      output += char;
      index += 1;
      templateReturnStates.push('code');
      state = 'template';
      continue;
    }
    if (char === '/' && canStartRegex) {
      output += char;
      index += 1;
      regexInClass = false;
      state = 'regex';
      continue;
    }
    if (/\s/.test(char)) {
      output += char;
      index += 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[\w$]/.test(source[end])) end += 1;
      const word = source.slice(index, end);
      output += word;
      index = end;
      canStartRegex = regexPrefixKeywords.has(word);
      continue;
    }
    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[\w.]/.test(source[end])) end += 1;
      output += source.slice(index, end);
      index = end;
      canStartRegex = false;
      continue;
    }

    output += char;
    index += 1;
    if (char === '{' && templateExpressionDepths.length > 0) {
      templateExpressionDepths[templateExpressionDepths.length - 1] += 1;
      canStartRegex = true;
    } else if (char === '}' && templateExpressionDepths.length > 0) {
      const last = templateExpressionDepths.length - 1;
      templateExpressionDepths[last] -= 1;
      if (templateExpressionDepths[last] === 0) {
        templateExpressionDepths.pop();
        state = 'template';
      }
      canStartRegex = false;
    } else if (char === ')' || char === ']' || char === '}') {
      canStartRegex = false;
    } else if (char === '.') {
      canStartRegex = false;
    } else {
      canStartRegex = true;
    }
  }

  return output;
}

function countMatches(src, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    count += [...src.matchAll(pattern)].length;
  }
  return count;
}

function countFileContractMatches(file, contracts = []) {
  let count = 0;
  for (const contract of contracts) {
    contract.path.lastIndex = 0;
    if (!contract.path.test(file.rel)) continue;
    count += countMatches(file.executableSrc, contract.patterns);
  }
  return count;
}

function extractRelativeImports(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) specifiers.add(match[1]);
    }
  }
  return specifiers;
}

function resolveRelativeImport(importerRel, specifier, knownPaths) {
  const base = join(dirname(importerRel), specifier).replace(/\\/g, '/');
  const candidates = [base];
  if (/\.(?:js|mjs)$/.test(base)) {
    const withoutExtension = base.replace(/\.(?:js|mjs)$/, '');
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`);
  } else if (!extensionOf(base)) {
    for (const extension of runtimeExtensions) {
      candidates.push(`${base}${extension}`, `${base}/index${extension}`);
    }
  }
  return candidates.find((candidate) => knownPaths.has(candidate));
}

function collectImportUsage(files) {
  const knownPaths = new Set(files.map((file) => file.rel));
  const usage = new Map();
  for (const importer of files) {
    const isRuntimeConsumer =
      isRuntimeFile(importer.rel) &&
      !isOpsToolingFile(importer.rel) &&
      !isHistoricalMigrationFile(importer.rel);
    for (const specifier of extractRelativeImports(importer.executableSrc)) {
      const target = resolveRelativeImport(importer.rel, specifier, knownPaths);
      if (!target) continue;
      const targetUsage = usage.get(target) ?? {
        testConsumers: new Set(),
        runtimeConsumers: new Set(),
      };
      if (isRuntimeConsumer) {
        targetUsage.runtimeConsumers.add(importer.rel);
      } else if (!isRuntimeFile(importer.rel)) {
        targetUsage.testConsumers.add(importer.rel);
      }
      usage.set(target, targetUsage);
    }
  }
  return usage;
}

function collect(root = repoRoot) {
  const files = scanRoots
    .flatMap((scanRoot) => listFiles(join(root, scanRoot)))
    .map((abs) => ({
      abs,
      rel: relative(root, abs).replace(/\\/g, '/'),
    }));

  const allSourceFiles = files
    .map((file) => ({
      ...file,
      src: readFileSync(file.abs, 'utf8'),
    }))
    .map((file) => ({
      ...file,
      executableSrc: maskJsComments(file.src),
    }));
  const importUsage = collectImportUsage(allSourceFiles);
  const sourceFiles = allSourceFiles.filter((file) => isRuntimeFile(file.rel));

  const categoryResults = categories.map((category) => {
    const filesWithHits = [];
    let totalHits = 0;
    const filesForCategory = sourceFiles.filter((file) => {
      if (category.postR6MustBeZero && !isExecutableRuntimeFile(file.rel, importUsage))
        return false;
      if (category.fileFilter && !category.fileFilter(file.rel)) return false;
      return true;
    });
    for (const file of filesForCategory) {
      const source = category.postR6MustBeZero ? file.executableSrc : file.src;
      const hits =
        countMatches(source, category.patterns) +
        countFileContractMatches(file, category.fileContracts);
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

function assertNoPostR6Blockers(root, label) {
  const blockers = postR6Blockers(collect(root));
  if (blockers.length > 0) {
    throw new Error(`${label} unexpectedly failed: ${blockers.map((item) => item.key).join(', ')}`);
  }
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

  const positiveRows = [];
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
      positiveRows.push({
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

  const negativeRows = [];
  for (const fixture of fixtures) {
    const commentCases = [
      {
        kind: 'line-comment-only',
        source: fixture.source
          .split('\n')
          .map((line) => `// ${line}`)
          .join('\n'),
      },
      {
        kind: 'block-comment-only',
        source: `/*\n${fixture.source}\n*/\n`,
      },
    ];

    for (const commentCase of commentCases) {
      const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-negative-'));
      try {
        writeSelfTestFixture(root, fixture.path, commentCase.source);
        assertNoPostR6Blockers(root, `${fixture.key} ${commentCase.kind}`);
        negativeRows.push({
          category: fixture.key,
          fixture: fixture.path,
          case: commentCase.kind,
          verdict: 'pass',
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }

  const exclusionCases = [
    {
      name: 'documentation-source-snippet',
      path: 'docs/retirement-example.ts',
      source: fixtures.map((fixture) => fixture.source).join('\n'),
    },
    {
      name: 'historical-typescript-migration',
      path: 'apps/integrator/src/infra/db/migrations/20260101000000_projection_history.ts',
      source: [
        'export function buildAppointmentRecordUpsertedFanout() { return {}; }',
        'export async function tryEmitWebappProjectionThenEnqueue() {}',
        "export const projectionTable = 'projection_outbox';",
        '',
      ].join('\n'),
    },
    {
      name: 'javascript-test-file',
      path: 'apps/integrator/src/infra/db/repos/projectionFanout.test.js',
      source: [
        'export function buildAppointmentRecordUpsertedFanout() { return {}; }',
        'export async function tryEmitWebappProjectionThenEnqueue() {}',
        "export const projectionTable = 'projection_outbox';",
        '',
      ].join('\n'),
    },
    {
      name: 'mjs-spec-file',
      path: 'apps/integrator/src/infra/db/repos/projectionFanout.spec.mjs',
      source: [
        'export function buildAppointmentRecordUpsertedFanout() { return {}; }',
        'export async function tryEmitWebappProjectionThenEnqueue() {}',
        "export const projectionTable = 'projection_outbox';",
        '',
      ].join('\n'),
    },
    {
      name: 'fixture-helper-imported-only-by-test',
      path: 'apps/integrator/src/infra/db/projection.fixture.ts',
      source: "export const projectionTable = 'projection_outbox';\n",
      relatedFiles: [
        {
          path: 'apps/integrator/src/infra/db/projection.fixture.test.ts',
          source: "import './projection.fixture.js';\n",
        },
      ],
    },
    {
      name: 'stub-helper-imported-only-by-test',
      path: 'apps/integrator/src/infra/db/stubProjection.ts',
      source: "export const projectionTable = 'projection_outbox';\n",
      relatedFiles: [
        {
          path: 'apps/integrator/src/infra/db/stubProjection.test.ts',
          source: "import './stubProjection.js';\n",
        },
      ],
    },
  ];

  for (const exclusionCase of exclusionCases) {
    const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-exclusion-'));
    try {
      writeSelfTestFixture(root, exclusionCase.path, exclusionCase.source);
      for (const relatedFile of exclusionCase.relatedFiles ?? []) {
        writeSelfTestFixture(root, relatedFile.path, relatedFile.source);
      }
      assertNoPostR6Blockers(root, exclusionCase.name);
      negativeRows.push({
        category: 'global-exclusion',
        fixture: exclusionCase.path,
        case: exclusionCase.name,
        verdict: 'pass',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-ops-'));
    try {
      const opsPath = 'apps/integrator/src/infra/scripts/resync-rubitime-records.ts';
      writeSelfTestFixture(
        root,
        opsPath,
        [
          'export function buildAppointmentRecordUpsertedFanout() { return {}; }',
          'export async function tryEmitWebappProjectionThenEnqueue() {}',
          "export const projectionTable = 'projection_outbox';",
          "export const source = 'rubitime_records';",
          '',
        ].join('\n'),
      );
      const result = collect(root);
      const blockers = postR6Blockers(result);
      if (blockers.length > 0) {
        throw new Error(
          `ops tooling unexpectedly failed: ${blockers.map((item) => item.key).join(', ')}`,
        );
      }
      const opsCategory = result.categories.find(
        (category) => category.key === 'rubitimeOpsToolingRefs',
      );
      if (!opsCategory || opsCategory.totalHits < 1) {
        throw new Error('ops tooling was not preserved in its separate inventory category');
      }
      negativeRows.push({
        category: 'global-exclusion',
        fixture: opsPath,
        case: 'ops-tooling-is-separate-inventory',
        verdict: 'pass',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-mixed-consumer-'));
    try {
      const helperPath = 'apps/integrator/src/infra/db/stubProjection.ts';
      writeSelfTestFixture(
        root,
        helperPath,
        "export const projectionTable = 'projection_outbox';\n",
      );
      writeSelfTestFixture(
        root,
        'apps/integrator/src/infra/db/stubProjection.test.ts',
        "import './stubProjection.js';\n",
      );
      writeSelfTestFixture(
        root,
        'apps/integrator/src/infra/db/runtimeProjectionConsumer.ts',
        "import './stubProjection.js';\n",
      );
      const blockers = postR6Blockers(collect(root));
      const target = blockers.find((category) => category.key === 'projectionOutboxRuntime');
      if (!target || target.totalHits !== 1) {
        throw new Error('mixed test/runtime helper consumer was hidden from runtime census');
      }
      const unexpected = blockers.filter((category) => category.key !== 'projectionOutboxRuntime');
      if (unexpected.length > 0) {
        throw new Error(
          `mixed helper consumer also triggered: ${unexpected
            .map((category) => category.key)
            .join(', ')}`,
        );
      }
      negativeRows.push({
        category: 'import-classification',
        fixture: helperPath,
        case: 'mixed-test-and-runtime-consumers-stays-visible',
        verdict: 'pass',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const lexicalCases = [
    {
      name: 'string-comment-markers',
      prefix: "const text = 'https://example.test/* literal */';",
    },
    {
      name: 'regex-comment-markers',
      prefix: 'const matcher = /https?:\\/\\/example\\.test\\/path/;',
    },
    {
      name: 'template-comment-markers',
      prefix: 'const text = `raw // and /* markers */ ${1 + 2}`;',
    },
  ];

  for (const lexicalCase of lexicalCases) {
    const root = mkdtempSync(join(tmpdir(), 'bcb-rubitime-d0-lexical-'));
    try {
      const fixturePath = 'apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts';
      writeSelfTestFixture(
        root,
        fixturePath,
        `${lexicalCase.prefix}\nexport function buildAppointmentRecordUpsertedFanout() { return {}; }\n`,
      );
      const blockers = postR6Blockers(collect(root));
      const target = blockers.find(
        (category) => category.key === 'appointmentRecordUpsertedFanoutBuilder',
      );
      if (!target || target.totalHits !== 1) {
        throw new Error(`${lexicalCase.name} corrupted executable source detection`);
      }
      const unexpected = blockers.filter(
        (category) => category.key !== 'appointmentRecordUpsertedFanoutBuilder',
      );
      if (unexpected.length > 0) {
        throw new Error(
          `${lexicalCase.name} also triggered: ${unexpected
            .map((category) => category.key)
            .join(', ')}`,
        );
      }
      negativeRows.push({
        category: 'lexical-mask',
        fixture: fixturePath,
        case: lexicalCase.name,
        verdict: 'pass',
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
        positiveCases: positiveRows,
        negativeCases: negativeRows,
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

#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const scanRoots = [
  'apps/integrator/src',
  'apps/webapp/src',
  'packages/booking-rubitime-sync/src',
  'packages/operator-db-schema/src',
];

const canonicalPatientPublicRoots = [
  'apps/webapp/src/app/api/booking',
  'apps/webapp/src/app/app/patient/booking',
  'apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts',
  'apps/webapp/src/app/app/patient/cabinet/useBookingSlots.ts',
  'apps/webapp/src/app/app/patient/cabinet/useCreateBooking.ts',
  'apps/webapp/src/app/book',
  'apps/webapp/src/shared/publicBook',
  'apps/webapp/src/modules/patient-booking',
  'apps/webapp/src/modules/booking-scheduling',
];

// These are deliberately narrow passive compatibility surfaces. They retain
// the opaque value for historical snapshots/type contracts, but must not be
// widened to resolver/service/route code. Any new patient/public occurrence
// remains an offender until it is reviewed here explicitly.
const allowedPatientPublicBranchServiceIdFiles = new Set([
  'apps/webapp/src/modules/patient-booking/canonicalCreate.ts',
  'apps/webapp/src/modules/patient-booking/ports.ts',
  'apps/webapp/src/modules/patient-booking/types.ts',
]);

const frozenBaselines = {
  integratorImports: new Map([
    ['apps/integrator/src/app/di.ts', 1],
    ['apps/integrator/src/app/operatorHealthProbeRunner.ts', 2],
    ['apps/integrator/src/app/routes.ts', 2],
    ['apps/integrator/src/infra/scripts/compare-rubitime-records.ts', 1],
    ['apps/integrator/src/infra/scripts/resync-rubitime-records.ts', 1],
    ['apps/integrator/src/integrations/registry.ts', 1],
  ]),
  bookingSyncImports: new Map([
    ['apps/integrator/src/infra/db/writePort.ts', 1],
    ['apps/webapp/src/infra/repos/pgPatientBookings.ts', 2],
    ['apps/webapp/src/modules/booking-rubitime-bridge/legacyProjection.ts', 1],
    ['apps/webapp/src/modules/patient-booking/compatSyncQuality.ts', 1],
  ]),
  readSourceBranches: new Map([
    ['apps/integrator/src/app/operatorHealthProbeRunner.ts', 1],
    ['apps/integrator/src/infra/db/branchTimezone.ts', 1],
    ['apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts', 1],
    ['apps/integrator/src/integrations/google-calendar/calendarDescription.ts', 1],
    ['apps/integrator/src/integrations/google-calendar/resolvePackageCalendarContext.ts', 1],
    ['apps/integrator/src/integrations/rubitime/config.ts', 1],
    ['apps/integrator/src/integrations/rubitime/connector.ts', 1],
    ['apps/integrator/src/integrations/rubitime/index.ts', 1],
    ['apps/integrator/src/integrations/rubitime/ingestNormalization.ts', 1],
    ['apps/integrator/src/integrations/rubitime/timezoneContract.fixtures.ts', 3],
    ['apps/integrator/src/integrations/rubitime/webhook.ts', 10],
    ['apps/integrator/src/kernel/domain/executor/handlers/delivery.ts', 1],
    ['apps/webapp/src/app-layer/booking/staffRubitimeBridgePolicy.ts', 1],
    ['apps/webapp/src/app-layer/di/buildAppDeps.ts', 4],
    ['apps/webapp/src/app/api/admin/booking-engine/bridge/route.ts', 1],
    ['apps/webapp/src/app/api/admin/booking-engine/overview/route.ts', 4],
    ['apps/webapp/src/app/api/admin/booking-engine/slots-probe/route.ts', 1],
    ['apps/webapp/src/app/api/admin/settings/route.ts', 7],
    ['apps/webapp/src/app/app/doctor/admin/booking/loadBookingAdminOverview.ts', 6],
    ['apps/webapp/src/app/app/settings/BookingEngineSection.tsx', 11],
    ['apps/webapp/src/app/app/settings/BookingScheduleSlotsProbeSection.tsx', 5],
    ['apps/webapp/src/app/app/settings/SystemHealthSection.tsx', 3],
    ['apps/webapp/src/infra/repos/doctorAppointmentPurgeFilter.ts', 3],
    ['apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts', 5],
    ['apps/webapp/src/infra/repos/pgAppointmentProjection.ts', 1],
    ['apps/webapp/src/infra/repos/pgBookingCalendarLegacy.ts', 3],
    ['apps/webapp/src/infra/repos/pgBookingCatalog.ts', 1],
    ['apps/webapp/src/infra/repos/pgBookingEngine.ts', 5],
    ['apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts', 9],
    // Curated operator diagnostics retain the existing provider label only; this is not a read-source branch.
    ['apps/webapp/src/infra/repos/pgCuratedSystemHealthDiagnostics.ts', 1],
    ['apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts', 8],
    ['apps/webapp/src/infra/repos/pgDoctorAppointments.ts', 1],
    ['apps/webapp/src/infra/repos/pgDoctorClients.ts', 11],
    ['apps/webapp/src/infra/repos/pgMemberships.ts', 1],
    ['apps/webapp/src/infra/repos/pgPatientClinical.ts', 1],
    ['apps/webapp/src/infra/repos/pgRubitimeMapping.ts', 8],
    ['apps/webapp/src/modules/auth/emailSetupAccess/ports.ts', 1],
    ['apps/webapp/src/modules/booking-appointment-sync/syncAttribution.ts', 1],
    ['apps/webapp/src/modules/booking-appointment-sync/types.ts', 1],
    ['apps/webapp/src/modules/booking-calendar/calendarLegacyFilters.ts', 2],
    ['apps/webapp/src/modules/booking-calendar/mapLegacyRecordToCalendarEvent.ts', 1],
    ['apps/webapp/src/modules/booking-calendar/types.ts', 1],
    ['apps/webapp/src/modules/integrator/events.ts', 2],
    ['apps/webapp/src/modules/operator-health/integrationHealthSnapshot.ts', 2],
    ['apps/webapp/src/modules/operator-health/probeOutboundMeta.ts', 1],
    ['apps/webapp/src/modules/patient-booking/canonicalCreate.ts', 1],
    ['apps/webapp/src/modules/patient-booking/service.ts', 1],
    ['apps/webapp/src/modules/patient-booking/slotsReadSource.ts', 3],
    ['apps/webapp/src/modules/system-settings/orgScopedKeys.ts', 3],
    ['apps/webapp/src/modules/system-settings/types.ts', 4],
    ['apps/webapp/src/shared/lib/fio.ts', 2],
    ['packages/operator-db-schema/src/integrationWebhook.ts', 1],
  ]),
  webappRoutes: new Map([
    ['apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/duplicates/route.ts', 1],
    ['apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/booking-profiles/[id]/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/booking-profiles/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/branches/[id]/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/branches/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/cooperators/[id]/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/cooperators/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/services/[id]/route.ts', 1],
    ['apps/webapp/src/app/api/admin/rubitime/services/route.ts', 1],
    ['apps/webapp/src/app/api/doctor/appointments/rubitime/cancel/route.ts', 1],
    ['apps/webapp/src/app/api/doctor/appointments/rubitime/update/route.ts', 1],
  ]),
  integratorRoutes: new Map([
    ['apps/integrator/src/integrations/rubitime/adminM2mRoute.ts', 12],
    ['apps/integrator/src/integrations/rubitime/recordM2mRoute.ts', 5],
    ['apps/integrator/src/integrations/rubitime/webhook.ts', 2],
  ]),
};

// Reviewed compatibility/declaration contexts are removed before the generic
// occurrence baseline is counted. Keeping the exact source snippets here is
// deliberately stricter than raising a whole-file count: moving the provider
// token to another branch or restoring a retired default becomes visible again.
const reviewedReadSourceContexts = new Map([
  [
    'apps/webapp/src/modules/system-settings/registry.ts',
    [
      '  booking_rubitime_bridge_enabled: runtime("admin", "global", "server", "boolean", "false"),',
      '  booking_doctor_appointments_read_source: runtime("admin", "global", "server", "string", "canonical"),',
      '  booking_slots_read_source: runtime("admin", "global", "server", "string", "canonical"),',
    ],
  ],
  [
    'apps/webapp/src/infra/repos/pgBookingEngine.ts',
    [
      `                    eq(beExternalEntityMappings.organizationId, input.organizationId),
                    eq(beExternalEntityMappings.entityType, "availability"),
                    eq(beExternalEntityMappings.externalSystem, "rubitime"),
                    inArray(
                      beExternalEntityMappings.canonicalId,
                      exactSpecialistRows.map((row) => row.id),
                    ),`,
    ],
  ],
]);

const readSourceBranchTokens = [
  'booking_doctor_appointments_read_source',
  'booking_slots_read_source',
  'booking_rubitime_bridge_enabled',
  'rubitime_legacy',
];

const patternGroups = {
  integratorImports: [
    /from\s+["'][^"']*integrations\/rubitime\//g,
    /import\(\s*["'][^"']*integrations\/rubitime\//g,
    /from\s+["']\.\/rubitime\//g,
    /import\(\s*["']\.\/rubitime\//g,
  ],
  bookingSyncImports: [/from\s+["']@bersoncare\/booking-rubitime-sync["']/g],
  readSourceBranches: [
    ...readSourceBranchTokens.map((token) => new RegExp(escapeRegExp(token), 'g')),
    /["']rubitime["']/g,
  ],
  integratorRoutes: [/\bapp\.(?:get|post|put|patch|delete)\(\s*["'][^"']*rubitime[^"']*["']/g],
};

function listSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
      out.push(...listSourceFiles(path));
      continue;
    }
    if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test.tsx') &&
      !name.endsWith('.spec.ts') &&
      !name.endsWith('.d.ts')
    ) {
      out.push(path);
    }
  }
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(src, patterns) {
  return patterns.reduce((sum, pattern) => {
    pattern.lastIndex = 0;
    return sum + [...src.matchAll(pattern)].length;
  }, 0);
}

function withoutReviewedReadSourceContexts(rel, src) {
  let remaining = src;
  for (const context of reviewedReadSourceContexts.get(rel) ?? []) {
    remaining = remaining.replace(context, '');
  }
  return remaining;
}

function webappRubitimeRouteCount(rel) {
  return rel.startsWith('apps/webapp/src/app/api/') && rel.endsWith('/route.ts') && rel.includes('rubitime')
    ? 1
    : 0;
}

function collectGrowthOffenders(files, category, countForFile) {
  const offenders = [];

  for (const file of files) {
    const count = countForFile(file);
    const baseline = frozenBaselines[category].get(file.rel) ?? 0;

    if (count > baseline) {
      offenders.push({
        rel: file.rel,
        baseline,
        count,
      });
    }
  }

  return offenders;
}

function collectOffenders(files) {
  return {
    integratorImports: collectGrowthOffenders(files, 'integratorImports', ({ src }) =>
      countMatches(src, patternGroups.integratorImports),
    ),
    bookingSyncImports: collectGrowthOffenders(files, 'bookingSyncImports', ({ src }) =>
      countMatches(src, patternGroups.bookingSyncImports),
    ),
    readSourceBranches: collectGrowthOffenders(files, 'readSourceBranches', ({ rel, src }) =>
      countMatches(withoutReviewedReadSourceContexts(rel, src), patternGroups.readSourceBranches),
    ),
    webappRoutes: collectGrowthOffenders(files, 'webappRoutes', ({ rel }) => webappRubitimeRouteCount(rel)),
    integratorRoutes: collectGrowthOffenders(files, 'integratorRoutes', ({ src }) =>
      countMatches(src, patternGroups.integratorRoutes),
    ),
  };
}

function collectLegacyBranchServicePatientPublicOffendersFromFiles(files) {
  const offenders = [];
  for (const { rel, src } of files) {
    if (!src.includes('branchServiceId')) continue;
    if (allowedPatientPublicBranchServiceIdFiles.has(rel)) continue;
    offenders.push(rel);
  }
  return offenders;
}

function collectLegacyBranchServicePatientPublicOffenders() {
  const files = [];
  for (const rel of canonicalPatientPublicRoots) {
    const abs = join(repoRoot, rel);
    const stat = statSync(abs);
    const paths = stat.isDirectory() ? listSourceFiles(abs) : [abs];
    for (const path of paths) {
      files.push({
        rel: relative(repoRoot, path).replace(/\\/g, '/'),
        src: readFileSync(path, 'utf8'),
      });
    }
  }
  return collectLegacyBranchServicePatientPublicOffendersFromFiles(files);
}

function printOffenders(label, offenders) {
  if (offenders.length === 0) return;
  console.error(`check-rubitime-retirement-r0-freeze: ${label}`);
  for (const offender of offenders) {
    console.error(`  - ${offender.rel} (${offender.count} > baseline ${offender.baseline})`);
  }
}

function hasAnyOffenders(offenders) {
  return Object.values(offenders).some((items) => items.length > 0);
}

if (process.argv.includes('--self-test')) {
  const offenders = collectOffenders([
    {
      rel: 'apps/integrator/src/app/newRubitimeCaller.ts',
      src: 'import { fetchRubitimeSchedule } from "../integrations/rubitime/client.js";',
    },
    {
      rel: 'apps/webapp/src/modules/new-booking/provider.ts',
      src: 'import { mapRubitimeStatus } from "@bersoncare/booking-rubitime-sync";',
    },
    {
      rel: 'apps/webapp/src/modules/new-booking/readSource.ts',
      src: 'const value = "rubitime_legacy";',
    },
    {
      rel: 'apps/webapp/src/modules/new-booking/plainSource.ts',
      src: 'const source = "rubitime";',
    },
    {
      rel: 'apps/webapp/src/app/app/settings/BookingEngineSection.tsx',
      src: Array.from({ length: 12 }, () => 'const source = "rubitime";').join('\n'),
    },
    {
      rel: 'apps/webapp/src/modules/system-settings/registry.ts',
      src: [
        '  booking_rubitime_bridge_enabled: runtime("admin", "global", "server", "boolean", "false"),',
        '  booking_doctor_appointments_read_source: runtime("admin", "global", "server", "string", "canonical"),',
        '  booking_slots_read_source: runtime("admin", "global", "server", "string", "canonical"),',
      ].join('\n'),
    },
    {
      rel: 'apps/webapp/src/modules/system-settings/registry.ts',
      src: '  booking_doctor_appointments_read_source: runtime("admin", "global", "server", "string", "rubitime_legacy"),',
    },
    {
      rel: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
      src: `${Array.from({ length: 5 }, () => 'const source = "rubitime";').join('\n')}\n+                    eq(beExternalEntityMappings.organizationId, input.organizationId),
                    eq(beExternalEntityMappings.entityType, "availability"),
                    eq(beExternalEntityMappings.externalSystem, "rubitime"),
                    inArray(
                      beExternalEntityMappings.canonicalId,
                      exactSpecialistRows.map((row) => row.id),
                    ),`,
    },
    {
      rel: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
      src: Array.from({ length: 6 }, () => 'const source = "rubitime";').join('\n'),
    },
    {
      rel: 'apps/webapp/src/app/api/admin/new-rubitime/route.ts',
      src: 'export async function GET() {}',
    },
    {
      rel: 'apps/integrator/src/integrations/newProvider.ts',
      src: 'app.post("/api/bersoncare/rubitime/new-feature", async () => undefined);',
    },
  ]);

  const branchServiceIdOffenders = collectLegacyBranchServicePatientPublicOffendersFromFiles([
    {
      rel: 'apps/webapp/src/modules/booking-scheduling/service.ts',
      src: 'resolveInPersonContext(branchServiceId) { return port.resolveCanonicalFromBranchService(branchServiceId); }',
    },
    {
      rel: 'apps/webapp/src/modules/patient-booking/canonicalCreate.ts',
      src: 'return { branchServiceId: null };',
    },
  ]);

  const readSourceOffenderSignature = offenders.readSourceBranches
    .map(({ rel, baseline, count }) => `${rel}:${count}>${baseline}`)
    .sort();
  const expectedReadSourceOffenderSignature = [
    'apps/webapp/src/app/app/settings/BookingEngineSection.tsx:12>11',
    'apps/webapp/src/infra/repos/pgBookingEngine.ts:6>5',
    'apps/webapp/src/modules/new-booking/plainSource.ts:1>0',
    'apps/webapp/src/modules/new-booking/readSource.ts:1>0',
    'apps/webapp/src/modules/system-settings/registry.ts:2>0',
  ].sort();

  const expected =
    offenders.integratorImports.length === 1 &&
    offenders.bookingSyncImports.length === 1 &&
    JSON.stringify(readSourceOffenderSignature) ===
      JSON.stringify(expectedReadSourceOffenderSignature) &&
    offenders.webappRoutes.length === 1 &&
    offenders.integratorRoutes.length === 1 &&
    JSON.stringify(branchServiceIdOffenders) ===
      JSON.stringify(['apps/webapp/src/modules/booking-scheduling/service.ts']);

  if (!expected) {
    console.error(
      'check-rubitime-retirement-r0-freeze self-test: expected synthetic offenders were not detected',
    );
    console.error(JSON.stringify(offenders, null, 2));
    process.exit(1);
  }
  console.log('check-rubitime-retirement-r0-freeze self-test: OK');
  process.exit(0);
}

const files = scanRoots.flatMap((root) =>
  listSourceFiles(join(repoRoot, root)).map((abs) => ({
    rel: relative(repoRoot, abs).replace(/\\/g, '/'),
    src: readFileSync(abs, 'utf8'),
  })),
);

const offenders = collectOffenders(files);
const legacyBranchServicePatientPublicOffenders = collectLegacyBranchServicePatientPublicOffenders();

if (hasAnyOffenders(offenders)) {
  printOffenders(
    'new imports from apps/integrator/src/integrations/rubitime outside the R0 baseline',
    offenders.integratorImports,
  );
  printOffenders(
    'new imports from @bersoncare/booking-rubitime-sync outside the R0 baseline',
    offenders.bookingSyncImports,
  );
  printOffenders(
    'new Rubitime read-source/bridge branch tokens outside the R0 baseline',
    offenders.readSourceBranches,
  );
  printOffenders(
    'new webapp Rubitime API route files outside the R0 baseline',
    offenders.webappRoutes,
  );
  printOffenders(
    'new integrator Rubitime route literals outside the R0 baseline',
    offenders.integratorRoutes,
  );
  process.exit(1);
}

if (legacyBranchServicePatientPublicOffenders.length > 0) {
  console.error('check-rubitime-retirement-r0-freeze: legacy branchServiceId remains in patient/public runtime');
  for (const rel of legacyBranchServicePatientPublicOffenders) console.error(`  - ${rel}`);
  process.exit(1);
}

console.log('check-rubitime-retirement-r0-freeze: OK');

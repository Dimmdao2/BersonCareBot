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

const allowedIntegratorRubitimeImportFiles = new Set([
  'apps/integrator/src/app/di.ts',
  'apps/integrator/src/app/operatorHealthProbeRunner.ts',
  'apps/integrator/src/app/routes.ts',
  'apps/integrator/src/infra/scripts/compare-rubitime-records.ts',
  'apps/integrator/src/infra/scripts/resync-rubitime-records.ts',
  'apps/integrator/src/integrations/registry.ts',
]);

const allowedBookingRubitimeSyncImportFiles = new Set([
  'apps/integrator/src/infra/db/writePort.ts',
  'apps/webapp/src/infra/repos/pgPatientBookings.ts',
  'apps/webapp/src/modules/booking-rubitime-bridge/legacyProjection.ts',
  'apps/webapp/src/modules/patient-booking/compatSyncQuality.ts',
]);

const allowedReadSourceBranchFiles = new Set([
  'apps/webapp/src/app-layer/di/buildAppDeps.ts',
  'apps/webapp/src/app/api/admin/booking-engine/bridge/route.ts',
  'apps/webapp/src/app/api/admin/booking-engine/overview/route.ts',
  'apps/webapp/src/app/api/admin/booking-engine/slots-probe/route.ts',
  'apps/webapp/src/app/api/admin/settings/route.ts',
  'apps/webapp/src/app/app/doctor/admin/booking/loadBookingAdminOverview.ts',
  'apps/webapp/src/app/app/settings/BookingEngineSection.tsx',
  'apps/webapp/src/app/app/settings/BookingScheduleSlotsProbeSection.tsx',
  'apps/webapp/src/app-layer/booking/staffRubitimeBridgePolicy.ts',
  'apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts',
  'apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts',
  'apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts',
  'apps/webapp/src/modules/booking-calendar/calendarLegacyFilters.ts',
  'apps/webapp/src/modules/booking-calendar/mapLegacyRecordToCalendarEvent.ts',
  'apps/webapp/src/modules/booking-calendar/types.ts',
  'apps/webapp/src/modules/patient-booking/canonicalCreate.ts',
  'apps/webapp/src/modules/patient-booking/service.ts',
  'apps/webapp/src/modules/patient-booking/slotsReadSource.ts',
  'apps/webapp/src/modules/system-settings/orgScopedKeys.ts',
  'apps/webapp/src/modules/system-settings/types.ts',
]);

const allowedWebappRubitimeRouteFiles = new Set([
  'apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/duplicates/route.ts',
  'apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/link/route.ts',
  'apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/booking-profiles/[id]/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/booking-profiles/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/branches/[id]/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/branches/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/cooperators/[id]/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/cooperators/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/services/[id]/route.ts',
  'apps/webapp/src/app/api/admin/rubitime/services/route.ts',
  'apps/webapp/src/app/api/doctor/appointments/rubitime/cancel/route.ts',
  'apps/webapp/src/app/api/doctor/appointments/rubitime/update/route.ts',
]);

const allowedIntegratorRubitimeRouteFiles = new Set([
  'apps/integrator/src/integrations/rubitime/adminM2mRoute.ts',
  'apps/integrator/src/integrations/rubitime/recordM2mRoute.ts',
  'apps/integrator/src/integrations/rubitime/webhook.ts',
]);

const readSourceBranchTokens = [
  'booking_doctor_appointments_read_source',
  'booking_slots_read_source',
  'booking_rubitime_bridge_enabled',
  'rubitime_legacy',
];

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

function isInsideIntegratorRubitime(rel) {
  return rel.startsWith('apps/integrator/src/integrations/rubitime/');
}

function hasIntegratorRubitimeImport(src) {
  return (
    /from\s+["'][^"']*integrations\/rubitime\//.test(src) ||
    /import\(\s*["'][^"']*integrations\/rubitime\//.test(src) ||
    /from\s+["']\.\/rubitime\//.test(src) ||
    /import\(\s*["']\.\/rubitime\//.test(src)
  );
}

function hasBookingRubitimeSyncImport(src) {
  return /from\s+["']@bersoncare\/booking-rubitime-sync["']/.test(src);
}

function hasReadSourceBranchToken(src) {
  return readSourceBranchTokens.some((token) => src.includes(token));
}

function hasRubitimeRouteLiteral(src) {
  return /\bapp\.(?:get|post|put|patch|delete)\(\s*["'][^"']*rubitime[^"']*["']/.test(src);
}

function collectOffenders(files) {
  const offenders = {
    integratorImports: [],
    bookingSyncImports: [],
    readSourceBranches: [],
    webappRoutes: [],
    integratorRoutes: [],
  };

  for (const file of files) {
    const rel = file.rel;
    const src = file.src;

    if (
      hasIntegratorRubitimeImport(src) &&
      !isInsideIntegratorRubitime(rel) &&
      !allowedIntegratorRubitimeImportFiles.has(rel)
    ) {
      offenders.integratorImports.push(rel);
    }

    if (hasBookingRubitimeSyncImport(src) && !allowedBookingRubitimeSyncImportFiles.has(rel)) {
      offenders.bookingSyncImports.push(rel);
    }

    if (hasReadSourceBranchToken(src) && !allowedReadSourceBranchFiles.has(rel)) {
      offenders.readSourceBranches.push(rel);
    }

    if (
      rel.startsWith('apps/webapp/src/app/api/') &&
      rel.endsWith('/route.ts') &&
      rel.includes('rubitime') &&
      !allowedWebappRubitimeRouteFiles.has(rel)
    ) {
      offenders.webappRoutes.push(rel);
    }

    if (hasRubitimeRouteLiteral(src) && !allowedIntegratorRubitimeRouteFiles.has(rel)) {
      offenders.integratorRoutes.push(rel);
    }
  }

  return offenders;
}

function printOffenders(label, offenders) {
  if (offenders.length === 0) return;
  console.error(`check-rubitime-retirement-r0-freeze: ${label}`);
  for (const rel of offenders) console.error(`  - ${rel}`);
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
      rel: 'apps/webapp/src/app/api/admin/new-rubitime/route.ts',
      src: 'export async function GET() {}',
    },
    {
      rel: 'apps/integrator/src/integrations/newProvider.ts',
      src: 'app.post("/api/bersoncare/rubitime/new-feature", async () => undefined);',
    },
  ]);

  const expected =
    offenders.integratorImports.length === 1 &&
    offenders.bookingSyncImports.length === 1 &&
    offenders.readSourceBranches.length === 1 &&
    offenders.webappRoutes.length === 1 &&
    offenders.integratorRoutes.length === 1;

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

console.log('check-rubitime-retirement-r0-freeze: OK');

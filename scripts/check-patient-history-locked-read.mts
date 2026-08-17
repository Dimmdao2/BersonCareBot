#!/usr/bin/env node

/**
 * Read-only locked-PostgreSQL regression for the patient history repository boundary.
 *
 * Usage:
 *   tsx --tsconfig apps/webapp/tsconfig.json scripts/check-patient-history-locked-read.mts \
 *     <org-a> <patient-a> <org-b> <patient-b>
 */

import { runWithDbPatientPrincipal } from '../packages/db-principal/dist/index.js';
import { getPool } from '../apps/webapp/src/infra/db/client';
import { createPgClientHistoryPort } from '../apps/webapp/src/infra/repos/pgClientHistory';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const [organizationA, patientA, organizationB, patientB] = process.argv.slice(2);

for (const value of [organizationA, patientA, organizationB, patientB]) {
  if (!value || !UUID.test(value)) throw new Error('four UUID arguments are required');
}

if (process.env.DB_PRINCIPAL_CONTEXT_MODE !== 'locked') {
  throw new Error('DB_PRINCIPAL_CONTEXT_MODE=locked is required');
}

const databaseUrl = process.env.DATABASE_URL_NONSTAFF ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_NONSTAFF or DATABASE_URL is required');
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (databaseName !== 'bersoncarebot_test') {
  throw new Error('refusing patient history locked read outside named TEST database');
}

const port = createPgClientHistoryPort();

async function readOwnAndAssertForeignHidden(
  organizationId: string,
  platformUserId: string,
  foreignOrganizationId: string,
  foreignPlatformUserId: string,
): Promise<void> {
  await runWithDbPatientPrincipal(
    {
      organizationId,
      platformUserId,
      source: 'check-patient-history-locked-read',
    },
    async () => {
      const [, , ownVisits] = await Promise.all([
        port.listPatientTimeline(organizationId, platformUserId, 50),
        port.listPatientPaymentHistory(organizationId, platformUserId, 50),
        port.listPatientVisitHistory(organizationId, platformUserId, 50),
      ]);
      if (ownVisits.length === 0) {
        throw new Error('fixture patient must have at least one appointment history row');
      }

      const [
        sameOrganizationForeignTimeline,
        sameOrganizationForeignPayments,
        sameOrganizationForeignVisits,
      ] = await Promise.all([
        port.listPatientTimeline(organizationId, foreignPlatformUserId, 50),
        port.listPatientPaymentHistory(organizationId, foreignPlatformUserId, 50),
        port.listPatientVisitHistory(organizationId, foreignPlatformUserId, 50),
      ]);
      const [foreignTimeline, foreignPayments, foreignVisits] = await Promise.all([
        port.listPatientTimeline(foreignOrganizationId, foreignPlatformUserId, 50),
        port.listPatientPaymentHistory(foreignOrganizationId, foreignPlatformUserId, 50),
        port.listPatientVisitHistory(foreignOrganizationId, foreignPlatformUserId, 50),
      ]);
      if (
        sameOrganizationForeignTimeline.length ||
        sameOrganizationForeignPayments.length ||
        sameOrganizationForeignVisits.length ||
        foreignTimeline.length ||
        foreignPayments.length ||
        foreignVisits.length
      ) {
        throw new Error('locked patient principal exposed foreign history rows');
      }
    },
  );
}

try {
  await readOwnAndAssertForeignHidden(organizationA, patientA, organizationB, patientB);
  await readOwnAndAssertForeignHidden(organizationB, patientB, organizationA, patientA);
  process.stdout.write('check-patient-history-locked-read: OK\n');
} finally {
  await getPool().end();
}

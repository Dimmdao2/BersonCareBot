import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from '../../infra/db/runIntegratorSql.js';
import {
  computePackageSessionIndex,
  formatPackageSessionDescriptionLine,
} from './packageSessionIndex.js';

export type PackageCalendarContext = {
  packageLinked: boolean;
  packageSessionLine: string | null;
};

export async function resolvePackageCalendarContext(
  db: DbPort,
  appointmentId: string,
): Promise<PackageCalendarContext> {
  const apptRes = await runIntegratorSql<{ package_usage_ref: string | null }>(
    db,
    sql`SELECT package_usage_ref::text
        FROM be_appointments
        WHERE id = ${appointmentId}::uuid
        LIMIT 1`,
  );
  const usageRefId = apptRes.rows[0]?.package_usage_ref ?? null;
  if (!usageRefId) return { packageLinked: false, packageSessionLine: null };

  const usageRes = await runIntegratorSql<{ patient_package_id: string }>(
    db,
    sql`SELECT patient_package_id::text
        FROM be_package_usages
        WHERE id = ${usageRefId}::uuid
        LIMIT 1`,
  );
  const patientPackageId = usageRes.rows[0]?.patient_package_id;
  if (!patientPackageId) {
    return { packageLinked: true, packageSessionLine: null };
  }

  const [pkgRes, itemsRes, usagesRes] = await Promise.all([
    runIntegratorSql<{ sold_at: string | null; created_at: string }>(
      db,
      sql`SELECT sold_at, created_at
          FROM be_patient_packages
          WHERE id = ${patientPackageId}::uuid
          LIMIT 1`,
    ),
    runIntegratorSql<{ quantity_initial: number }>(
      db,
      sql`SELECT quantity_initial
          FROM be_patient_package_items
          WHERE patient_package_id = ${patientPackageId}::uuid
          ORDER BY sort_order ASC`,
    ),
    runIntegratorSql<{ id: string; usage_kind: string; occurred_at: string }>(
      db,
      sql`SELECT id::text, usage_kind, occurred_at
          FROM be_package_usages
          WHERE patient_package_id = ${patientPackageId}::uuid
          ORDER BY occurred_at ASC, id ASC`,
    ),
  ]);

  const pkg = pkgRes.rows[0];
  const index = computePackageSessionIndex({
    items: itemsRes.rows,
    usages: usagesRes.rows,
    usageRefId,
    soldAt: pkg?.sold_at ?? null,
    createdAt: pkg?.created_at ?? new Date().toISOString(),
  });

  return {
    packageLinked: true,
    packageSessionLine: index ? formatPackageSessionDescriptionLine(index) : null,
  };
}

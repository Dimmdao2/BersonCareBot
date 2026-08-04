#!/usr/bin/env tsx
/**
 * Stage D backfill (VISIBILITY_MODEL_DESIGN_2026-08-04.md §6, VISIBILITY_CD_BRIEF_2026-08-04.md
 * stage D, #987): for every (organization, patient, specialist) triple that has at least one
 * appointment record in `be_appointments`, create an `active` `patient_specialist_links` row with
 * `created_via='first_appointment'` if one does not already exist (any status — an `ended` link is
 * a deliberate prior removal and is never resurrected here).
 *
 * "At least one appointment record" is read literally — cancelled/no-show appointments still
 * count, because the link means "this specialist was booked against this patient," not "the visit
 * happened." This backfill only ever adds links; it is deliberately inclusive rather than risk
 * under-covering ahead of Stage E (predicate not wired to any route yet, so a wider link set here
 * carries no visibility risk today).
 *
 * Usage (from apps/webapp, DATABASE_URL must point at the DEV database — do NOT run against
 * TEST or PROD; see brief §D.7, decision belongs to the lead separately for TEST):
 *   pnpm tsx scripts/backfill-patient-specialist-links.ts                     # dry-run, all orgs
 *   pnpm tsx scripts/backfill-patient-specialist-links.ts -- --organization-id=UUID
 *   pnpm tsx scripts/backfill-patient-specialist-links.ts -- --commit
 *
 * Default: dry-run (per-organization report only, no INSERT).
 */
import 'dotenv/config';
import pg from 'pg';

// Deliberately not routed through createPgPatientVisibilityLinkPort()/getDrizzle(): the webapp
// pool provider asserts a request-scoped DB principal before any write in locked mode
// (`assertRoutedWebappPoolCheckoutAllowed`), which a one-off maintenance script has no such thing
// to provide. Same reason `backfill-treatment-program-editor-draft-snapshots.ts` writes via a raw
// `pg.Pool` instead of its port for the actual UPDATE — house precedent for this script class.

type CandidateRow = {
  organization_id: string;
  patient_user_id: string;
  specialist_id: string;
  first_appointment_at: string;
  link_exists: boolean;
};

type TotalPatientsRow = {
  organization_id: string;
  patients_with_appointments: number;
};

type OrgReport = {
  organizationId: string;
  patientsWithAppointments: number;
  patientsCovered: number;
  patientsWithoutSpecialistOnAnyAppointment: number;
  specialistsAffected: number;
  pairsTotal: number;
  pairsAlreadyLinked: number;
  pairsWouldCreate: number;
  pairsCreated?: number;
};

const argv = process.argv.slice(2);

function has(flag: string): boolean {
  return argv.includes(flag);
}

function strArg(prefix: string): string | null {
  const raw = argv.find((a) => a.startsWith(`${prefix}=`));
  if (!raw) return null;
  const v = raw.slice(prefix.length + 1).trim();
  return v || null;
}

function printHelp(): void {
  console.log(`backfill-patient-specialist-links

  --commit                  Apply INSERTs. Default is dry-run (report only).
  --organization-id=UUID    Limit to one organization.
  -h, --help                This help.
`);
}

async function fetchCandidatePairs(
  pool: pg.Pool,
  organizationId: string | null,
): Promise<CandidateRow[]> {
  const values: unknown[] = [];
  let orgFilter = '';
  if (organizationId) {
    values.push(organizationId);
    orgFilter = `AND a.organization_id = $${values.length}::uuid`;
  }
  const sql = `
    SELECT
      a.organization_id,
      a.platform_user_id AS patient_user_id,
      a.specialist_id,
      MIN(a.created_at)::text AS first_appointment_at,
      EXISTS (
        SELECT 1 FROM patient_specialist_links l
        WHERE l.patient_user_id = a.platform_user_id
          AND l.specialist_id = a.specialist_id
      ) AS link_exists
    FROM be_appointments a
    WHERE a.platform_user_id IS NOT NULL
      AND a.specialist_id IS NOT NULL
      AND a.deleted_at IS NULL
      ${orgFilter}
    GROUP BY a.organization_id, a.platform_user_id, a.specialist_id
  `;
  const { rows } = await pool.query<CandidateRow>(sql, values);
  return rows;
}

async function fetchTotalPatientsPerOrg(
  pool: pg.Pool,
  organizationId: string | null,
): Promise<Map<string, number>> {
  const values: unknown[] = [];
  let orgFilter = '';
  if (organizationId) {
    values.push(organizationId);
    orgFilter = `AND a.organization_id = $${values.length}::uuid`;
  }
  const sql = `
    SELECT
      a.organization_id,
      COUNT(DISTINCT a.platform_user_id)::int AS patients_with_appointments
    FROM be_appointments a
    WHERE a.platform_user_id IS NOT NULL
      AND a.deleted_at IS NULL
      ${orgFilter}
    GROUP BY a.organization_id
  `;
  const { rows } = await pool.query<TotalPatientsRow>(sql, values);
  return new Map(rows.map((r) => [r.organization_id, r.patients_with_appointments]));
}

function buildReports(
  candidates: CandidateRow[],
  totalPatientsByOrg: Map<string, number>,
): Map<string, OrgReport> {
  const byOrg = new Map<string, CandidateRow[]>();
  for (const row of candidates) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  const reports = new Map<string, OrgReport>();
  for (const [organizationId, rows] of byOrg) {
    const patientsCovered = new Set(rows.map((r) => r.patient_user_id)).size;
    const specialistsAffected = new Set(rows.map((r) => r.specialist_id)).size;
    const pairsAlreadyLinked = rows.filter((r) => r.link_exists).length;
    const patientsWithAppointments = totalPatientsByOrg.get(organizationId) ?? patientsCovered;
    reports.set(organizationId, {
      organizationId,
      patientsWithAppointments,
      patientsCovered,
      patientsWithoutSpecialistOnAnyAppointment: patientsWithAppointments - patientsCovered,
      specialistsAffected,
      pairsTotal: rows.length,
      pairsAlreadyLinked,
      pairsWouldCreate: rows.length - pairsAlreadyLinked,
    });
  }
  return reports;
}

async function main(): Promise<void> {
  if (has('-h') || has('--help')) {
    printHelp();
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set');
    process.exitCode = 1;
    return;
  }

  const commit = has('--commit');
  const organizationId = strArg('--organization-id');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const [candidates, totalPatientsByOrg] = await Promise.all([
      fetchCandidatePairs(pool, organizationId),
      fetchTotalPatientsPerOrg(pool, organizationId),
    ]);
    const reports = buildReports(candidates, totalPatientsByOrg);

    if (commit) {
      for (const row of candidates) {
        if (row.link_exists) continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO patient_specialist_links
             (organization_id, patient_user_id, specialist_id, status, created_via)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', 'first_appointment')
           ON CONFLICT (patient_user_id, specialist_id) WHERE status = 'active' DO NOTHING
           RETURNING id`,
          [row.organization_id, row.patient_user_id, row.specialist_id],
        );
        if ((result.rowCount ?? 0) > 0) {
          const report = reports.get(row.organization_id);
          if (report) {
            report.pairsCreated = (report.pairsCreated ?? 0) + 1;
          }
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun: !commit,
          organizationId,
          organizations: [...reports.values()].sort((a, b) =>
            a.organizationId.localeCompare(b.organizationId),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void main();

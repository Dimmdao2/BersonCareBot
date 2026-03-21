#!/usr/bin/env node
/**
 * Reconciliation for appointments domain: compare integrator rubitime_records
 * with webapp appointment_records. Exit 0 when within threshold.
 *
 * Usage: node scripts/reconcile-appointments-domain.mjs [--max-mismatch-percent=N] [--sample-size=N]
 * Requires: DATABASE_URL (webapp), INTEGRATOR_DATABASE_URL (integrator).
 */
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const { Client } = pg;

loadCutoverEnv();

function parseArgs(argv) {
  let maxMismatchPercent = 0;
  let sampleSize = 10;
  for (const arg of argv) {
    if (arg.startsWith("--max-mismatch-percent="))
      maxMismatchPercent = Math.max(0, parseInt(arg.slice("--max-mismatch-percent=".length), 10) || 0);
    if (arg.startsWith("--sample-size="))
      sampleSize = Math.max(1, Math.min(500, parseInt(arg.slice("--sample-size=".length), 10) || 10));
  }
  return { maxMismatchPercent, sampleSize };
}

async function main() {
  const { maxMismatchPercent, sampleSize } = parseArgs(process.argv.slice(2));
  const webappUrl = process.env.DATABASE_URL;
  const integratorUrl = process.env.INTEGRATOR_DATABASE_URL;
  if (!webappUrl?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (!integratorUrl?.trim()) {
    console.error("INTEGRATOR_DATABASE_URL is not set");
    process.exit(1);
  }

  const webappClient = new Client({ connectionString: webappUrl });
  const integratorClient = new Client({ connectionString: integratorUrl });
  try {
    await webappClient.connect();
    await integratorClient.connect();
  } catch (err) {
    console.error("DB connect error:", err.message);
    process.exit(1);
  }

  let report = null;
  try {
    const srcRows = await integratorClient.query(
      "SELECT rubitime_record_id AS id, payload_json FROM rubitime_records"
    );
    const tgtRows = await webappClient.query(
      `SELECT ar.integrator_record_id, b.integrator_branch_id
       FROM appointment_records ar
       LEFT JOIN branches b ON ar.branch_id = b.id`
    );
    const srcIds = new Set(srcRows.rows.map((r) => r.id));
    const tgtIds = new Set(tgtRows.rows.map((r) => r.integrator_record_id));
    const tgtByRecordId = new Map(tgtRows.rows.map((r) => [r.integrator_record_id, r]));
    const missing = [...srcIds].filter((id) => !tgtIds.has(id));

    let branchMatch = 0;
    let branchMismatch = 0;
    let branchSourceOnly = 0;
    let branchTargetOnly = 0;
    for (const src of srcRows.rows) {
      const id = src.id;
      const tgt = tgtByRecordId.get(id);
      if (!tgt) continue;
      const payload = src.payload_json ?? {};
      const srcBranchId =
        payload.branch_id != null
          ? (typeof payload.branch_id === "number"
              ? payload.branch_id
              : parseInt(String(payload.branch_id), 10))
          : null;
      const srcBranch = Number.isFinite(srcBranchId) ? srcBranchId : null;
      const tgtBranch = tgt.integrator_branch_id != null ? Number(tgt.integrator_branch_id) : null;
      if (srcBranch != null && tgtBranch != null) {
        if (srcBranch === tgtBranch) branchMatch += 1;
        else branchMismatch += 1;
      } else if (srcBranch != null) branchSourceOnly += 1;
      else if (tgtBranch != null) branchTargetOnly += 1;
    }

    report = {
      sourceCount: srcRows.rowCount ?? 0,
      targetCount: tgtRows.rowCount ?? 0,
      missingInWebappCount: missing.length,
      missingInWebappSample: missing.slice(0, sampleSize),
      branchConsistency: {
        branchMatch,
        branchMismatch,
        branchSourceOnly,
        branchTargetOnly,
      },
    };
  } finally {
    await webappClient.end();
    await integratorClient.end();
  }

  console.log(JSON.stringify({ appointment_records: report }, null, 2));

  const sourceCount = report.sourceCount ?? 0;
  const missing = report.missingInWebappCount ?? 0;
  const pct = sourceCount > 0 ? (100 * missing) / sourceCount : 0;
  if (pct > maxMismatchPercent) {
    console.error(
      `[reconcile-appointments-domain] appointment_records: mismatch ${pct.toFixed(2)}% > ${maxMismatchPercent}%`
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

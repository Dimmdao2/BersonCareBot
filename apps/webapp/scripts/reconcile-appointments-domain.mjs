#!/usr/bin/env node
/**
 * Reconciliation for appointments domain: compare integrator rubitime_records
 * with webapp appointment_records. Exit 0 when within threshold.
 *
 * Usage: node scripts/reconcile-appointments-domain.mjs [--max-mismatch-percent=N] [--sample-size=N]
 * Requires: DATABASE_URL (webapp), INTEGRATOR_DATABASE_URL (integrator).
 */
import pg from "pg";

const { Client } = pg;

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
    const srcRows = await integratorClient.query("SELECT rubitime_record_id AS id FROM rubitime_records");
    const tgtRows = await webappClient.query("SELECT integrator_record_id FROM appointment_records");
    const srcIds = new Set(srcRows.rows.map((r) => r.id));
    const tgtIds = new Set(tgtRows.rows.map((r) => r.integrator_record_id));
    const missing = [...srcIds].filter((id) => !tgtIds.has(id));
    report = {
      sourceCount: srcRows.rowCount ?? 0,
      targetCount: tgtRows.rowCount ?? 0,
      missingInWebappCount: missing.length,
      missingInWebappSample: missing.slice(0, sampleSize),
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

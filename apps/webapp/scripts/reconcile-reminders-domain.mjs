#!/usr/bin/env node
/**
 * Reconciliation for reminders domain: compare integrator user_reminder_rules,
 * user_reminder_occurrences (sent/failed), user_reminder_delivery_logs, content_access_grants
 * with webapp reminder_rules, reminder_occurrence_history, reminder_delivery_events,
 * content_access_grants_webapp. Exit 0 when within threshold for each table-pair.
 *
 * Usage: node scripts/reconcile-reminders-domain.mjs [--max-mismatch-percent=N] [--sample-size=N]
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

  const report = {
    reminder_rules: null,
    reminder_occurrence_history: null,
    reminder_delivery_events: null,
    content_access_grants: null,
  };

  try {
    const srcRules = await integratorClient.query("SELECT id FROM user_reminder_rules");
    const tgtRules = await webappClient.query("SELECT integrator_rule_id FROM reminder_rules");
    const srcRuleIds = new Set(srcRules.rows.map((r) => r.id));
    const tgtRuleIds = new Set(tgtRules.rows.map((r) => r.integrator_rule_id));
    const missingRules = [...srcRuleIds].filter((id) => !tgtRuleIds.has(id));
    report.reminder_rules = {
      sourceCount: srcRules.rowCount ?? 0,
      targetCount: tgtRules.rowCount ?? 0,
      missingInWebappCount: missingRules.length,
      missingInWebappSample: missingRules.slice(0, sampleSize),
    };

    const srcOcc = await integratorClient.query(
      "SELECT id FROM user_reminder_occurrences WHERE status IN ('sent', 'failed')"
    );
    const tgtOcc = await webappClient.query("SELECT integrator_occurrence_id FROM reminder_occurrence_history");
    const srcOccIds = new Set(srcOcc.rows.map((r) => r.id));
    const tgtOccIds = new Set(tgtOcc.rows.map((r) => r.integrator_occurrence_id));
    const missingOcc = [...srcOccIds].filter((id) => !tgtOccIds.has(id));
    report.reminder_occurrence_history = {
      sourceCount: srcOcc.rowCount ?? 0,
      targetCount: tgtOcc.rowCount ?? 0,
      missingInWebappCount: missingOcc.length,
      missingInWebappSample: missingOcc.slice(0, sampleSize),
    };

    const srcLogs = await integratorClient.query("SELECT id FROM user_reminder_delivery_logs");
    const tgtLogs = await webappClient.query("SELECT integrator_delivery_log_id FROM reminder_delivery_events");
    const srcLogIds = new Set(srcLogs.rows.map((r) => r.id));
    const tgtLogIds = new Set(tgtLogs.rows.map((r) => r.integrator_delivery_log_id));
    const missingLogs = [...srcLogIds].filter((id) => !tgtLogIds.has(id));
    report.reminder_delivery_events = {
      sourceCount: srcLogs.rowCount ?? 0,
      targetCount: tgtLogs.rowCount ?? 0,
      missingInWebappCount: missingLogs.length,
      missingInWebappSample: missingLogs.slice(0, sampleSize),
    };

    const srcGrants = await integratorClient.query("SELECT id FROM content_access_grants");
    const tgtGrants = await webappClient.query("SELECT integrator_grant_id FROM content_access_grants_webapp");
    const srcGrantIds = new Set(srcGrants.rows.map((r) => r.id));
    const tgtGrantIds = new Set(tgtGrants.rows.map((r) => r.integrator_grant_id));
    const missingGrants = [...srcGrantIds].filter((id) => !tgtGrantIds.has(id));
    report.content_access_grants = {
      sourceCount: srcGrants.rowCount ?? 0,
      targetCount: tgtGrants.rowCount ?? 0,
      missingInWebappCount: missingGrants.length,
      missingInWebappSample: missingGrants.slice(0, sampleSize),
    };
  } finally {
    await webappClient.end();
    await integratorClient.end();
  }

  console.log(JSON.stringify(report, null, 2));

  const tables = [
    { name: "reminder_rules", ...report.reminder_rules },
    { name: "reminder_occurrence_history", ...report.reminder_occurrence_history },
    { name: "reminder_delivery_events", ...report.reminder_delivery_events },
    { name: "content_access_grants", ...report.content_access_grants },
  ];
  for (const t of tables) {
    const sourceCount = t.sourceCount ?? 0;
    const missing = t.missingInWebappCount ?? 0;
    const pct = sourceCount > 0 ? (100 * missing) / sourceCount : 0;
    if (pct > maxMismatchPercent) {
      console.error(
        `[reconcile-reminders-domain] ${t.name}: mismatch ${pct.toFixed(2)}% > ${maxMismatchPercent}%`
      );
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

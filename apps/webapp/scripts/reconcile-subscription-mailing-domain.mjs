#!/usr/bin/env node
/**
 * Reconciles subscription/mailing domain: compare counts between integrator
 * and webapp for mailing_topics, user_subscriptions, mailing_logs.
 *
 * Usage: node scripts/reconcile-subscription-mailing-domain.mjs [--max-mismatch-percent=N]
 * Requires: DATABASE_URL (webapp), INTEGRATOR_DATABASE_URL (integrator).
 * Exit: 0 when within threshold; 1 when violated or DB error.
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

function parseArgs(argv) {
  let maxMismatchPercent = 0;
  for (const arg of argv) {
    if (arg.startsWith("--max-mismatch-percent="))
      maxMismatchPercent = Math.max(0, parseInt(arg.slice("--max-mismatch-percent=".length), 10) || 0);
  }
  return { maxMismatchPercent };
}

async function main() {
  const { maxMismatchPercent } = parseArgs(process.argv.slice(2));
  const webappUrl = process.env.DATABASE_URL;
  const integratorUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
  if (!webappUrl?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (!integratorUrl?.trim()) {
    console.error("INTEGRATOR_DATABASE_URL is not set");
    process.exit(1);
  }

  const webapp = new Client({ connectionString: webappUrl });
  const integrator = new Client({ connectionString: integratorUrl });
  try {
    await webapp.connect();
    await integrator.connect();
  } catch (err) {
    console.error("DB connect error:", err.message);
    process.exit(1);
  }

  let exitCode = 0;
  try {
    const pairs = [
      { name: "mailing_topics", srcTable: "mailing_topics", srcCol: "id", tgtTable: "mailing_topics_webapp", tgtCol: "integrator_topic_id" },
      { name: "user_subscriptions", srcTable: "user_subscriptions", srcCol: "user_id", tgtTable: "user_subscriptions_webapp", tgtCol: "integrator_user_id" },
      { name: "mailing_logs", srcTable: "mailing_logs", srcCol: "user_id", tgtTable: "mailing_logs_webapp", tgtCol: "integrator_user_id" },
    ];

    for (const { name, srcTable, tgtTable } of pairs) {
      const srcRes = await integrator.query(`SELECT COUNT(*) AS c FROM ${srcTable}`);
      const tgtRes = await webapp.query(`SELECT COUNT(*) AS c FROM ${tgtTable}`);
      const srcCount = parseInt(srcRes.rows[0]?.c ?? "0", 10);
      const tgtCount = parseInt(tgtRes.rows[0]?.c ?? "0", 10);
      const diff = Math.abs(srcCount - tgtCount);
      const pct = srcCount > 0 ? (diff / srcCount) * 100 : 0;
      const ok = pct <= maxMismatchPercent;
      console.log(`${name}: source=${srcCount} target=${tgtCount} diff=${diff} ${pct.toFixed(1)}% ${ok ? "ok" : "MISMATCH"}`);
      if (!ok) exitCode = 1;
    }

    if (exitCode === 0) console.log("Reconcile subscription/mailing domain: within threshold.");
  } finally {
    await webapp.end();
    await integrator.end();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

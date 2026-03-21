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
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const { Client } = pg;

loadCutoverEnv();

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
      {
        name: "mailing_topics",
        srcQuery: "SELECT id FROM mailing_topics",
        srcKey: "id",
        tgtQuery: "SELECT integrator_topic_id FROM mailing_topics_webapp",
        tgtKey: "integrator_topic_id",
      },
      {
        name: "user_subscriptions",
        srcQuery: "SELECT user_id, topic_id FROM user_subscriptions",
        srcKeyFn: (r) => `${r.user_id}:${r.topic_id}`,
        tgtQuery: "SELECT integrator_user_id, integrator_topic_id FROM user_subscriptions_webapp",
        tgtKeyFn: (r) => `${r.integrator_user_id}:${r.integrator_topic_id}`,
      },
      {
        name: "mailing_logs",
        srcQuery: "SELECT user_id, mailing_id FROM mailing_logs",
        srcKeyFn: (r) => `${r.user_id}:${r.mailing_id}`,
        tgtQuery: "SELECT integrator_user_id, integrator_mailing_id FROM mailing_logs_webapp",
        tgtKeyFn: (r) => `${r.integrator_user_id}:${r.integrator_mailing_id}`,
      },
    ];

    function toKey(rows, keyFn, keyCol) {
      return new Set(rows.map(keyFn ?? ((r) => String(r[keyCol]))));
    }

    for (const p of pairs) {
      const srcRes = await integrator.query(p.srcQuery);
      const tgtRes = await webapp.query(p.tgtQuery);
      const srcSet = toKey(srcRes.rows, p.srcKeyFn, p.srcKey);
      const tgtSet = toKey(tgtRes.rows, p.tgtKeyFn, p.tgtKey);
      const missing = [...srcSet].filter((k) => !tgtSet.has(k));
      const diff = missing.length;
      const pct = srcSet.size > 0 ? (diff / srcSet.size) * 100 : 0;
      const ok = pct <= maxMismatchPercent;
      console.log(`${p.name}: source=${srcSet.size} target=${tgtSet.size} missing=${diff} ${pct.toFixed(1)}% ${ok ? "ok" : "MISMATCH"}`);
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

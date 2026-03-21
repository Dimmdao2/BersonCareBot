#!/usr/bin/env node
/**
 * Backfills subscription/mailing domain from integrator DB to webapp.
 * Reads mailing_topics, user_subscriptions, mailing_logs from integrator;
 * upserts into mailing_topics_webapp, user_subscriptions_webapp, mailing_logs_webapp.
 *
 * Idempotent by integrator ids. Safe to re-run.
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-subscription-mailing-domain.mjs [--dry-run] [--limit=N]
 *
 * Defaults to --dry-run. Use --commit to write.
 */
import "dotenv/config";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const args = process.argv.slice(2);
loadCutoverEnv();
const dryRun = args.includes("--dry-run") || !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
/** Safe row cap for backfill (avoids accidental huge LIMIT / NaN in SQL). */
const MAX_BACKFILL_LIMIT = 500_000;
function parseBackfillLimit(arg) {
  if (!arg || !arg.includes("=")) return 0;
  const raw = arg.slice(arg.indexOf("=") + 1);
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_BACKFILL_LIMIT);
}
const limit = limitArg ? parseBackfillLimit(limitArg) : 0;

const sourceUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl?.trim()) {
  console.error("INTEGRATOR_DATABASE_URL or SOURCE_DATABASE_URL is not set");
  process.exit(1);
}
if (!targetUrl?.trim()) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (dryRun) {
  console.log("[DRY-RUN] No writes. Pass --commit to write.");
}

const BACKFILL_WRITE_BATCH = 1000;

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });

async function main() {
  await src.connect();
  await dst.connect();

  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";

  try {
    // mailing_topics
    const { rows: topics } = await src.query(
      `SELECT id, code, title, key, is_active FROM mailing_topics ORDER BY id${limitClause}`
    );
    console.log(`mailing_topics to backfill: ${topics.length}`);
    if (!dryRun && topics.length > 0) {
      for (let i = 0; i < topics.length; i += BACKFILL_WRITE_BATCH) {
        const chunk = topics.slice(i, i + BACKFILL_WRITE_BATCH);
        await dst.query("BEGIN");
        try {
          for (const row of chunk) {
            await dst.query(
              `INSERT INTO mailing_topics_webapp (integrator_topic_id, code, title, key, is_active, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (integrator_topic_id) DO UPDATE SET
             code = EXCLUDED.code, title = EXCLUDED.title, key = EXCLUDED.key,
             is_active = EXCLUDED.is_active, updated_at = now()`,
              [String(row.id), row.code, row.title, row.key, row.is_active ?? true]
            );
          }
          await dst.query("COMMIT");
        } catch (err) {
          try {
            await dst.query("ROLLBACK");
          } catch {
            // Best effort rollback; preserve original batch error.
          }
          throw err;
        }
      }
    }

    // user_subscriptions
    const { rows: subs } = await src.query(
      `SELECT user_id, topic_id, is_active, updated_at FROM user_subscriptions ORDER BY user_id, topic_id${limitClause}`
    );
    console.log(`user_subscriptions to backfill: ${subs.length}`);
    if (!dryRun && subs.length > 0) {
      for (let i = 0; i < subs.length; i += BACKFILL_WRITE_BATCH) {
        const chunk = subs.slice(i, i + BACKFILL_WRITE_BATCH);
        await dst.query("BEGIN");
        try {
          for (const row of chunk) {
            await dst.query(
              `INSERT INTO user_subscriptions_webapp (integrator_user_id, integrator_topic_id, is_active, updated_at)
           VALUES ($1, $2, $3, $4::timestamptz)
           ON CONFLICT (integrator_user_id, integrator_topic_id) DO UPDATE SET
             is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at`,
              [String(row.user_id), String(row.topic_id), row.is_active ?? true, row.updated_at ?? new Date().toISOString()]
            );
          }
          await dst.query("COMMIT");
        } catch (err) {
          try {
            await dst.query("ROLLBACK");
          } catch {
            // Best effort rollback; preserve original batch error.
          }
          throw err;
        }
      }
    }

    // mailing_logs (integrator column is "error", webapp is "error_text")
    const { rows: logs } = await src.query(
      `SELECT user_id, mailing_id, status, sent_at, error FROM mailing_logs ORDER BY user_id, mailing_id${limitClause}`
    );
    console.log(`mailing_logs to backfill: ${logs.length}`);
    if (!dryRun && logs.length > 0) {
      for (let i = 0; i < logs.length; i += BACKFILL_WRITE_BATCH) {
        const chunk = logs.slice(i, i + BACKFILL_WRITE_BATCH);
        await dst.query("BEGIN");
        try {
          for (const row of chunk) {
            await dst.query(
              `INSERT INTO mailing_logs_webapp (integrator_user_id, integrator_mailing_id, status, sent_at, error_text)
           VALUES ($1, $2, $3, $4::timestamptz, $5)
           ON CONFLICT (integrator_user_id, integrator_mailing_id) DO NOTHING`,
              [String(row.user_id), String(row.mailing_id), row.status, row.sent_at ?? new Date().toISOString(), row.error ?? null]
            );
          }
          await dst.query("COMMIT");
        } catch (err) {
          try {
            await dst.query("ROLLBACK");
          } catch {
            // Best effort rollback; preserve original batch error.
          }
          throw err;
        }
      }
    }

    console.log("Backfill subscription/mailing domain done.");
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

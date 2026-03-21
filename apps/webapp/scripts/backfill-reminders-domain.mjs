#!/usr/bin/env node
/**
 * Backfills reminders + content access from integrator DB to webapp projection tables.
 *
 * Reads user_reminder_rules, user_reminder_occurrences (sent/failed only),
 * user_reminder_delivery_logs, content_access_grants from integrator and upserts
 * into reminder_rules, reminder_occurrence_history, reminder_delivery_events,
 * content_access_grants_webapp. Idempotent by integrator_*_id. platform_user_id
 * resolved from platform_users.integrator_user_id when present.
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-reminders-domain.mjs [--dry-run | --commit] [--limit=N]
 * Defaults to --dry-run.
 */
import "dotenv/config";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const args = process.argv.slice(2);
loadCutoverEnv();
const dryRun = !args.includes("--commit");
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

if (!sourceUrl) {
  console.error("INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set");
  process.exit(1);
}
if (!targetUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (dryRun) {
  console.log("[DRY-RUN] No writes will be performed. Pass --commit to write.");
}

const BACKFILL_WRITE_BATCH = 1000;

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });

async function resolvePlatformUserId(integratorUserId) {
  if (integratorUserId == null) return null;
  const r = await dst.query(
    "SELECT id FROM platform_users WHERE integrator_user_id = $1",
    [String(integratorUserId)]
  );
  return r.rows[0]?.id ?? null;
}

async function backfillReminderRules() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT id, user_id, category, is_enabled, schedule_type, timezone,
            interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode, updated_at
     FROM user_reminder_rules ORDER BY updated_at ASC${limitClause}`
  );
  console.log(`Reminder rules to backfill: ${rows.length}`);
  let n = 0;
  for (let i = 0; i < rows.length; i += BACKFILL_WRITE_BATCH) {
    const chunk = rows.slice(i, i + BACKFILL_WRITE_BATCH);
    if (!dryRun) await dst.query("BEGIN");
    try {
      for (const row of chunk) {
        const platformUserId = await resolvePlatformUserId(row.user_id);
        if (!dryRun) {
          await dst.query(
            `INSERT INTO reminder_rules (
          integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled,
          schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
          days_mask, content_mode, updated_at
        ) VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz)
        ON CONFLICT (integrator_rule_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, reminder_rules.platform_user_id),
          integrator_user_id = EXCLUDED.integrator_user_id,
          category = EXCLUDED.category,
          is_enabled = EXCLUDED.is_enabled,
          schedule_type = EXCLUDED.schedule_type,
          timezone = EXCLUDED.timezone,
          interval_minutes = EXCLUDED.interval_minutes,
          window_start_minute = EXCLUDED.window_start_minute,
          window_end_minute = EXCLUDED.window_end_minute,
          days_mask = EXCLUDED.days_mask,
          content_mode = EXCLUDED.content_mode,
          updated_at = EXCLUDED.updated_at`,
            [
              row.id,
              platformUserId,
              String(row.user_id),
              row.category,
              row.is_enabled,
              row.schedule_type,
              row.timezone,
              row.interval_minutes,
              row.window_start_minute,
              row.window_end_minute,
              row.days_mask,
              row.content_mode,
              row.updated_at,
            ]
          );
        }
        n++;
      }
      if (!dryRun) await dst.query("COMMIT");
    } catch (err) {
      if (!dryRun) {
        try {
          await dst.query("ROLLBACK");
        } catch {
          // Best effort rollback; preserve original batch error.
        }
      }
      throw err;
    }
  }
  console.log(`  Rules ${dryRun ? "would upsert" : "upserted"}: ${n}`);
}

async function backfillReminderOccurrenceHistory() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT o.id, o.rule_id, r.user_id, r.category, o.status, o.delivery_channel, o.error_code,
            COALESCE(o.sent_at, o.failed_at) AS occurred_at
     FROM user_reminder_occurrences o
     JOIN user_reminder_rules r ON r.id = o.rule_id
     WHERE o.status IN ('sent', 'failed')
     ORDER BY occurred_at ASC${limitClause}`
  );
  console.log(`Reminder occurrence history (sent/failed) to backfill: ${rows.length}`);
  let n = 0;
  for (let i = 0; i < rows.length; i += BACKFILL_WRITE_BATCH) {
    const chunk = rows.slice(i, i + BACKFILL_WRITE_BATCH);
    if (!dryRun) await dst.query("BEGIN");
    try {
      for (const row of chunk) {
        if (!dryRun) {
          await dst.query(
            `INSERT INTO reminder_occurrence_history (
          integrator_occurrence_id, integrator_rule_id, integrator_user_id, category,
          status, delivery_channel, error_code, occurred_at
        ) VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8::timestamptz)
        ON CONFLICT (integrator_occurrence_id) DO NOTHING`,
            [
              row.id,
              row.rule_id,
              String(row.user_id),
              row.category,
              row.status,
              row.delivery_channel ?? null,
              row.error_code ?? null,
              row.occurred_at,
            ]
          );
        }
        n++;
      }
      if (!dryRun) await dst.query("COMMIT");
    } catch (err) {
      if (!dryRun) {
        try {
          await dst.query("ROLLBACK");
        } catch {
          // Best effort rollback; preserve original batch error.
        }
      }
      throw err;
    }
  }
  console.log(`  Occurrence history ${dryRun ? "would insert" : "inserted"}: ${n}`);
}

async function backfillReminderDeliveryEvents() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT l.id, l.occurrence_id, o.rule_id, r.user_id, l.channel, l.status, l.error_code, l.payload_json, l.created_at
     FROM user_reminder_delivery_logs l
     JOIN user_reminder_occurrences o ON o.id = l.occurrence_id
     JOIN user_reminder_rules r ON r.id = o.rule_id
     ORDER BY l.created_at ASC${limitClause}`
  );
  console.log(`Reminder delivery events to backfill: ${rows.length}`);
  let n = 0;
  for (let i = 0; i < rows.length; i += BACKFILL_WRITE_BATCH) {
    const chunk = rows.slice(i, i + BACKFILL_WRITE_BATCH);
    if (!dryRun) await dst.query("BEGIN");
    try {
      for (const row of chunk) {
        if (!dryRun) {
          await dst.query(
            `INSERT INTO reminder_delivery_events (
          integrator_delivery_log_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
          channel, status, error_code, payload_json, created_at
        ) VALUES ($1, $2, $3, $4::bigint, $5, $6, $7, $8::jsonb, $9::timestamptz)
        ON CONFLICT (integrator_delivery_log_id) DO NOTHING`,
            [
              row.id,
              row.occurrence_id,
              row.rule_id,
              String(row.user_id),
              row.channel,
              row.status,
              row.error_code ?? null,
              JSON.stringify(row.payload_json ?? {}),
              row.created_at,
            ]
          );
        }
        n++;
      }
      if (!dryRun) await dst.query("COMMIT");
    } catch (err) {
      if (!dryRun) {
        try {
          await dst.query("ROLLBACK");
        } catch {
          // Best effort rollback; preserve original batch error.
        }
      }
      throw err;
    }
  }
  console.log(`  Delivery events ${dryRun ? "would insert" : "inserted"}: ${n}`);
}

async function backfillContentAccessGrants() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT id, user_id, content_id, purpose, token_hash, expires_at, revoked_at, meta_json, created_at
     FROM content_access_grants ORDER BY created_at ASC${limitClause}`
  );
  console.log(`Content access grants to backfill: ${rows.length}`);
  let n = 0;
  for (let i = 0; i < rows.length; i += BACKFILL_WRITE_BATCH) {
    const chunk = rows.slice(i, i + BACKFILL_WRITE_BATCH);
    if (!dryRun) await dst.query("BEGIN");
    try {
      for (const row of chunk) {
        const platformUserId = await resolvePlatformUserId(row.user_id);
        if (!dryRun) {
          await dst.query(
            `INSERT INTO content_access_grants_webapp (
          integrator_grant_id, platform_user_id, integrator_user_id, content_id, purpose,
          token_hash, expires_at, revoked_at, meta_json, created_at
        ) VALUES ($1, $2, $3::bigint, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb, $10::timestamptz)
        ON CONFLICT (integrator_grant_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, content_access_grants_webapp.platform_user_id),
          integrator_user_id = EXCLUDED.integrator_user_id,
          content_id = EXCLUDED.content_id,
          purpose = EXCLUDED.purpose,
          token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          revoked_at = EXCLUDED.revoked_at,
          meta_json = EXCLUDED.meta_json`,
            [
              row.id,
              platformUserId,
              String(row.user_id),
              row.content_id,
              row.purpose,
              row.token_hash ?? null,
              row.expires_at,
              row.revoked_at ?? null,
              JSON.stringify(row.meta_json ?? {}),
              row.created_at,
            ]
          );
        }
        n++;
      }
      if (!dryRun) await dst.query("COMMIT");
    } catch (err) {
      if (!dryRun) {
        try {
          await dst.query("ROLLBACK");
        } catch {
          // Best effort rollback; preserve original batch error.
        }
      }
      throw err;
    }
  }
  console.log(`  Content grants ${dryRun ? "would upsert" : "upserted"}: ${n}`);
}

async function main() {
  await src.connect();
  await dst.connect();
  console.log("Connected to source (integrator) and target (webapp) databases.\n");

  try {
    await backfillReminderRules();
    await backfillReminderOccurrenceHistory();
    await backfillReminderDeliveryEvents();
    await backfillContentAccessGrants();
  } finally {
    await src.end();
    await dst.end();
  }

  console.log("\nBackfill complete.");
  if (dryRun) {
    console.log("This was a DRY-RUN. Pass --commit to actually write data.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

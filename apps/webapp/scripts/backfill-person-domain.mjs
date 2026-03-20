#!/usr/bin/env node
/**
 * Backfills person/contact/preferences from integrator to webapp.
 * Source: integrator.users, contacts, identities, telegram_state.
 * Target: webapp.platform_users, user_channel_bindings, user_notification_topics.
 * Idempotent by integrator_user_id. Bridge by phone_normalized when user exists.
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-person-domain.mjs [--dry-run | --commit] [--limit=N] [--user-id=ID]
 * Defaults to --dry-run.
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const argv = process.argv.slice(2);
const dryRun = !argv.includes("--commit");
const limitArg = argv.find((a) => a.startsWith("--limit="));
const userIdArg = argv.find((a) => a.startsWith("--user-id="));
const MAX_LIMIT = 500_000;

function parseLimit(arg) {
  if (!arg || !arg.includes("=")) return 0;
  const raw = arg.slice(arg.indexOf("=") + 1);
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_LIMIT);
}

function parseUserId(arg) {
  if (!arg || !arg.includes("=")) return null;
  const raw = arg.slice(arg.indexOf("=") + 1).trim();
  return raw || null;
}

const limit = limitArg ? parseLimit(limitArg) : 0;
const filterUserId = userIdArg ? parseUserId(userIdArg) : null;

const integratorUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
const webappUrl = process.env.DATABASE_URL;

if (!integratorUrl?.trim()) {
  console.error("INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set");
  process.exit(1);
}
if (!webappUrl?.trim()) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (dryRun) {
  console.log("[DRY-RUN] No writes will be performed. Pass --commit to write.");
}

const NOTIFY_TOPIC_MAP = [
  { legacy: "notify_spb", topicCode: "booking_spb" },
  { legacy: "notify_msk", topicCode: "booking_msk" },
  { legacy: "notify_online", topicCode: "booking_online" },
  { legacy: "notify_bookings", topicCode: "bookings" },
];

function displayNameFromLegacy(firstName, lastName) {
  const parts = [firstName, lastName].filter((s) => s != null && String(s).trim() !== "").map((s) => String(s).trim());
  return parts.join(" ").trim() || "";
}

async function main() {
  const integrator = new Client({ connectionString: integratorUrl });
  const webapp = new Client({ connectionString: webappUrl });

  try {
    await integrator.connect();
    await webapp.connect();
  } catch (err) {
    console.error("DB connect error:", err.message);
    process.exit(1);
  }

  const stats = {
    usersScanned: 0,
    usersInserted: 0,
    usersUpdated: 0,
    bindingsUpserted: 0,
    topicsUpserted: 0,
    skipped: 0,
  };

  try {
    const userFilter = filterUserId ? "AND u.id = $1" : "";
    const userParams = filterUserId ? [filterUserId] : [];
    const limitClause = limit > 0 ? `LIMIT ${limit}` : "";
    const usersRes = await integrator.query(
      `SELECT u.id AS user_id
       FROM users u
       ${userFilter}
       ORDER BY u.id ASC
       ${limitClause}`,
      userParams
    );

    const userIds = usersRes.rows.map((r) => String(r.user_id));
    if (userIds.length === 0) {
      console.log(JSON.stringify({ ...stats, message: "No users to backfill" }, null, 2));
      return;
    }

    const contactsRes = await integrator.query(
      `SELECT user_id, value_normalized AS phone
       FROM contacts
       WHERE user_id = ANY(SELECT unnest($1::text[])::bigint) AND type = 'phone' AND trim(value_normalized) != ''`,
      [userIds]
    );
    const phoneByUser = new Map();
    for (const row of contactsRes.rows) {
      phoneByUser.set(String(row.user_id), String(row.phone).trim());
    }

    const identityRes = await integrator.query(
      `SELECT i.user_id, i.resource, i.external_id,
              ts.first_name, ts.last_name, ts.notify_spb, ts.notify_msk, ts.notify_online, ts.notify_bookings
       FROM identities i
       LEFT JOIN telegram_state ts ON ts.identity_id = i.id
       WHERE i.user_id = ANY(SELECT unnest($1::text[])::bigint)`,
      [userIds]
    );

    const byUser = new Map();
    for (const id of userIds) {
      byUser.set(id, {
        integratorUserId: id,
        phone: phoneByUser.get(id) ?? null,
        displayName: "",
        bindings: [],
        topics: {},
      });
    }
    for (const row of identityRes.rows) {
      const id = String(row.user_id);
      const u = byUser.get(id);
      if (!u) continue;
      if (row.resource && row.external_id) {
        u.bindings.push({ channelCode: row.resource, externalId: String(row.external_id) });
      }
      const dn = displayNameFromLegacy(row.first_name, row.last_name);
      if (dn && !u.displayName) u.displayName = dn;
      if (row.notify_spb != null) u.topics.booking_spb = !!row.notify_spb;
      if (row.notify_msk != null) u.topics.booking_msk = !!row.notify_msk;
      if (row.notify_online != null) u.topics.booking_online = !!row.notify_online;
      if (row.notify_bookings != null) u.topics.bookings = !!row.notify_bookings;
    }

    stats.usersScanned = byUser.size;

    for (const [integratorUserId, u] of byUser) {
      let platformUserId = null;
      const existingByIntegrator = await webapp.query(
        "SELECT id FROM platform_users WHERE integrator_user_id = $1",
        [integratorUserId]
      );
      if (existingByIntegrator.rows.length > 0) {
        platformUserId = existingByIntegrator.rows[0].id;
        if (!dryRun) {
          const updates = [];
          const vals = [platformUserId];
          let idx = 1;
          if (u.displayName != null) {
            updates.push(`display_name = $${++idx}`);
            vals.push(u.displayName);
          }
          if (u.phone != null) {
            updates.push(`phone_normalized = $${++idx}`);
            vals.push(u.phone);
          }
          if (updates.length > 0) {
            updates.push("updated_at = now()");
            await webapp.query(
              `UPDATE platform_users SET ${updates.join(", ")} WHERE id = $1`,
              vals
            );
            stats.usersUpdated += 1;
          }
        }
      } else if (u.phone) {
        const existingByPhone = await webapp.query(
          "SELECT id FROM platform_users WHERE phone_normalized = $1",
          [u.phone]
        );
        if (existingByPhone.rows.length > 0) {
          platformUserId = existingByPhone.rows[0].id;
          if (!dryRun) {
            await webapp.query(
              `UPDATE platform_users SET integrator_user_id = $1, updated_at = now() WHERE id = $2`,
              [integratorUserId, platformUserId]
            );
            stats.usersUpdated += 1;
          }
        }
      }

      if (!platformUserId && !dryRun) {
        const ins = await webapp.query(
          `INSERT INTO platform_users (integrator_user_id, phone_normalized, display_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (integrator_user_id) DO UPDATE SET
             phone_normalized = COALESCE(EXCLUDED.phone_normalized, platform_users.phone_normalized),
             display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), platform_users.display_name),
             updated_at = now()
           RETURNING id`,
          [integratorUserId, u.phone ?? null, u.displayName ?? ""]
        );
        platformUserId = ins.rows[0].id;
        stats.usersInserted += 1;
      } else if (!platformUserId && dryRun) {
        stats.usersInserted += 1;
      }

      if (platformUserId && u.bindings.length > 0 && !dryRun) {
        for (const b of u.bindings) {
          await webapp.query(
            `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
            [platformUserId, b.channelCode, b.externalId]
          );
          stats.bindingsUpserted += 1;
        }
      } else if (u.bindings.length > 0 && dryRun) {
        stats.bindingsUpserted += u.bindings.length;
      }

      const topicCodes = NOTIFY_TOPIC_MAP.map((m) => m.topicCode);
      const topicsToUpsert = topicCodes.filter((code) => u.topics[code] !== undefined);
      if (platformUserId && topicsToUpsert.length > 0 && !dryRun) {
        for (const code of topicsToUpsert) {
          const isEnabled = !!u.topics[code];
          await webapp.query(
            `INSERT INTO user_notification_topics (user_id, topic_code, is_enabled)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, topic_code) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
            [platformUserId, code, isEnabled]
          );
          stats.topicsUpserted += 1;
        }
      } else if (topicsToUpsert.length > 0 && dryRun) {
        stats.topicsUpserted += topicsToUpsert.length;
      }
    }

    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await integrator.end();
    await webapp.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

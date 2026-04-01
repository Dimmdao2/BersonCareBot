#!/usr/bin/env node
/**
 * Seeds admin-scope integration settings into webapp.system_settings from env files.
 *
 * Goal: first deploy without manual copy of integration keys/URIs.
 * Behavior: fill-empty-only (does not override non-empty DB values).
 *
 * Usage:
 *   node scripts/seed-system-settings-from-env.mjs --webapp-env /opt/env/bersoncarebot/webapp.prod --api-env /opt/env/bersoncarebot/api.prod
 */
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

function parseArgs(argv) {
  const out = {
    webappEnv: "",
    apiEnv: "",
    force: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--webapp-env") out.webappEnv = argv[i + 1] ?? "";
    if (token === "--api-env") out.apiEnv = argv[i + 1] ?? "";
    if (token === "--force") out.force = true;
  }
  return out;
}

function parseEnvFile(path) {
  if (!path || !existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function nonEmpty(x) {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : "";
}

function pickFirst(...values) {
  for (const v of values) {
    const n = nonEmpty(v);
    if (n) return n;
  }
  return "";
}

function buildSeedMap(webappEnv, apiEnv) {
  return {
    integrator_api_url: pickFirst(webappEnv.INTEGRATOR_API_URL),
    integrator_webhook_secret: pickFirst(
      webappEnv.INTEGRATOR_WEBHOOK_SECRET,
      webappEnv.INTEGRATOR_SHARED_SECRET,
      apiEnv.INTEGRATOR_WEBHOOK_SECRET,
      apiEnv.INTEGRATOR_SHARED_SECRET,
    ),
    integrator_webapp_entry_secret: pickFirst(
      webappEnv.INTEGRATOR_WEBAPP_ENTRY_SECRET,
      webappEnv.INTEGRATOR_SHARED_SECRET,
      apiEnv.INTEGRATOR_WEBAPP_ENTRY_SECRET,
      apiEnv.INTEGRATOR_SHARED_SECRET,
    ),
    booking_url: pickFirst(apiEnv.BOOKING_URL, webappEnv.BOOKING_URL),
    telegram_bot_token: pickFirst(webappEnv.TELEGRAM_BOT_TOKEN, apiEnv.TELEGRAM_BOT_TOKEN),
    google_calendar_enabled: pickFirst(apiEnv.GOOGLE_CALENDAR_ENABLED, webappEnv.GOOGLE_CALENDAR_ENABLED),
    google_calendar_id: pickFirst(apiEnv.GOOGLE_CALENDAR_ID, webappEnv.GOOGLE_CALENDAR_ID),
    google_client_id: pickFirst(apiEnv.GOOGLE_CLIENT_ID, webappEnv.GOOGLE_CLIENT_ID),
    google_client_secret: pickFirst(apiEnv.GOOGLE_CLIENT_SECRET, webappEnv.GOOGLE_CLIENT_SECRET),
    google_redirect_uri: pickFirst(apiEnv.GOOGLE_REDIRECT_URI, webappEnv.GOOGLE_REDIRECT_URI),
    google_refresh_token: pickFirst(apiEnv.GOOGLE_REFRESH_TOKEN, webappEnv.GOOGLE_REFRESH_TOKEN),
    yandex_oauth_client_id: pickFirst(webappEnv.YANDEX_OAUTH_CLIENT_ID),
    yandex_oauth_client_secret: pickFirst(webappEnv.YANDEX_OAUTH_CLIENT_SECRET),
    yandex_oauth_redirect_uri: pickFirst(webappEnv.YANDEX_OAUTH_REDIRECT_URI),
    rubitime_api_key: pickFirst(apiEnv.RUBITIME_API_KEY),
    rubitime_webhook_token: pickFirst(apiEnv.RUBITIME_WEBHOOK_TOKEN),
    rubitime_schedule_mapping: pickFirst(apiEnv.RUBITIME_SCHEDULE_MAPPING),
    rubitime_webhook_uri: pickFirst(apiEnv.RUBITIME_WEBHOOK_URI),
    max_api_key: pickFirst(apiEnv.MAX_API_KEY),
    max_webhook_secret: pickFirst(apiEnv.MAX_WEBHOOK_SECRET),
    max_webhook_uri: pickFirst(apiEnv.MAX_WEBHOOK_URI),
    smsc_api_key: pickFirst(apiEnv.SMSC_API_KEY),
    smsc_webhook_uri: pickFirst(apiEnv.SMSC_WEBHOOK_URI),
  };
}

async function upsertSetting(client, key, value, force) {
  if (!value) return { changed: false, reason: "empty_input" };
  if (force) {
    await client.query(
      `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
       VALUES ($1, 'admin', jsonb_build_object('value', $2::text), now(), NULL)
       ON CONFLICT (key, scope) DO UPDATE
         SET value_json = EXCLUDED.value_json,
             updated_at = now(),
             updated_by = NULL`,
      [key, value],
    );
    return { changed: true, reason: "force" };
  }

  const current = await client.query(
    `SELECT value_json
     FROM system_settings
     WHERE key = $1 AND scope = 'admin'
     LIMIT 1`,
    [key],
  );
  const existing = current.rows[0]?.value_json;
  const existingValue =
    existing && typeof existing === "object" && "value" in existing && typeof existing.value === "string"
      ? existing.value.trim()
      : "";

  if (existingValue.length > 0) {
    return { changed: false, reason: "already_filled" };
  }

  await client.query(
    `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
     VALUES ($1, 'admin', jsonb_build_object('value', $2::text), now(), NULL)
     ON CONFLICT (key, scope) DO UPDATE
       SET value_json = EXCLUDED.value_json,
           updated_at = now(),
           updated_by = NULL`,
    [key, value],
  );
  return { changed: true, reason: "filled_empty" };
}

async function main() {
  const args = parseArgs(process.argv);
  const webappEnv = parseEnvFile(args.webappEnv);
  const apiEnv = parseEnvFile(args.apiEnv);

  const databaseUrl = process.env.DATABASE_URL || webappEnv.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[seed-system-settings] DATABASE_URL not found in process env or webapp env file");
    process.exit(1);
  }

  const map = buildSeedMap(webappEnv, apiEnv);
  const keys = Object.keys(map).sort();

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let changedCount = 0;
    let skippedCount = 0;

    for (const key of keys) {
      const value = map[key];
      const result = await upsertSetting(client, key, value, args.force);
      if (result.changed) changedCount += 1;
      else skippedCount += 1;
    }

    console.log(
      `[seed-system-settings] done: changed=${changedCount}, skipped=${skippedCount}, mode=${args.force ? "force" : "fill-empty-only"}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed-system-settings] failed:", err?.message || err);
  process.exit(1);
});

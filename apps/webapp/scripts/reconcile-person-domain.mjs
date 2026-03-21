#!/usr/bin/env node
/**
 * Post-cutover reconciliation for person-domain: compare legacy integrator
 * users/identities/contacts/telegram_state with webapp platform_users,
 * user_channel_bindings, user_notification_topics.
 *
 * Usage: node scripts/reconcile-person-domain.mjs [--max-mismatch-percent=N] [--sample-size=N]
 * Requires: DATABASE_URL (webapp), INTEGRATOR_DATABASE_URL (integrator).
 * Exit: 0 when within threshold; 1 when thresholds violated or DB error.
 */
import "dotenv/config";
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

function normalize(str) {
  if (str == null || typeof str !== "string") return "";
  return str.trim();
}

function displayNameFromLegacy(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).map((s) => normalize(s)).join(" ").trim() || "";
}

/** Same mapping as backfill-person-domain: legacy telegram_state column -> webapp topic_code */
const NOTIFY_TOPIC_MAP = [
  { legacy: "notify_spb", topicCode: "booking_spb" },
  { legacy: "notify_msk", topicCode: "booking_msk" },
  { legacy: "notify_online", topicCode: "booking_online" },
  { legacy: "notify_bookings", topicCode: "bookings" },
];

async function fetchLegacy(client) {
  const usersRes = await client.query(`
    SELECT u.id AS user_id, c.value_normalized AS phone
    FROM users u
    LEFT JOIN contacts c ON c.user_id = u.id AND c.type = 'phone' AND c.value_normalized IS NOT NULL AND trim(c.value_normalized) != ''
  `);
  const identityRes = await client.query(`
    SELECT i.user_id, i.resource, i.external_id, ts.first_name, ts.last_name,
           ts.notify_spb, ts.notify_msk, ts.notify_online, ts.notify_bookings
    FROM identities i
    LEFT JOIN telegram_state ts ON ts.identity_id = i.id
  `);
  const byUser = new Map();
  for (const row of usersRes.rows) {
    const id = String(row.user_id);
    if (!byUser.has(id)) byUser.set(id, { integratorUserId: id, phone: normalize(row.phone) ?? null, displayName: "", bindings: [], topics: {} });
    const u = byUser.get(id);
    if (row.phone) u.phone = normalize(row.phone);
  }
  for (const row of identityRes.rows) {
    const id = String(row.user_id);
    if (!byUser.has(id)) byUser.set(id, { integratorUserId: id, phone: null, displayName: "", bindings: [], topics: {} });
    const u = byUser.get(id);
    if (row.resource && row.external_id) u.bindings.push({ channelCode: row.resource, externalId: row.external_id });
    if (row.first_name != null || row.last_name != null) {
      const dn = displayNameFromLegacy(row.first_name, row.last_name);
      if (dn && !u.displayName) u.displayName = dn;
    }
    for (const { legacy, topicCode } of NOTIFY_TOPIC_MAP) {
      if (row[legacy] != null) u.topics[topicCode] = !!row[legacy];
    }
  }
  return byUser;
}

async function fetchTarget(client) {
  const usersRes = await client.query(`
    SELECT id, integrator_user_id, phone_normalized, display_name
    FROM platform_users
    WHERE integrator_user_id IS NOT NULL
  `);
  const bindingsRes = await client.query(`
    SELECT ucb.user_id, ucb.channel_code, ucb.external_id
    FROM user_channel_bindings ucb
    JOIN platform_users pu ON pu.id = ucb.user_id
    WHERE pu.integrator_user_id IS NOT NULL
  `);
  const topicsRes = await client.query(`
    SELECT unt.user_id, unt.topic_code, unt.is_enabled
    FROM user_notification_topics unt
    JOIN platform_users pu ON pu.id = unt.user_id
    WHERE pu.integrator_user_id IS NOT NULL
  `);
  const byIntegratorId = new Map();
  /** @type {Map<string, string>} platform_users.id (uuid string) -> integrator_user_id */
  const integratorIdByPlatformUserId = new Map();
  for (const row of usersRes.rows) {
    const id = String(row.integrator_user_id);
    integratorIdByPlatformUserId.set(String(row.id), id);
    byIntegratorId.set(id, {
      platformUserId: row.id,
      integratorUserId: id,
      phone: normalize(row.phone_normalized) ?? null,
      displayName: normalize(row.display_name) ?? "",
      bindings: [],
      topics: {},
    });
  }
  for (const row of bindingsRes.rows) {
    const integratorKey = integratorIdByPlatformUserId.get(String(row.user_id));
    if (integratorKey) {
      const u = byIntegratorId.get(integratorKey);
      if (u) u.bindings.push({ channelCode: row.channel_code, externalId: row.external_id });
    }
  }
  for (const row of topicsRes.rows) {
    const integratorKey = integratorIdByPlatformUserId.get(String(row.user_id));
    if (integratorKey) {
      const u = byIntegratorId.get(integratorKey);
      if (u) u.topics[row.topic_code] = !!row.is_enabled;
    }
  }
  return byIntegratorId;
}

function compareBindings(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((x) => `${x.channelCode}:${x.externalId}`).sort());
  const sb = new Set(b.map((x) => `${x.channelCode}:${x.externalId}`).sort());
  if (sa.size !== sb.size) return false;
  for (const k of sa) if (!sb.has(k)) return false;
  return true;
}

function compareTopics(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (!!(a || {})[k] !== !!(b || {})[k]) return false;
  }
  return true;
}

function buildReport(legacyMap, targetMap, sampleSize) {
  const legacyIds = new Set(legacyMap.keys());
  const targetIds = new Set(targetMap.keys());
  const missingInWebapp = [...legacyIds].filter((id) => !targetIds.has(id));
  const extraInWebapp = [...targetIds].filter((id) => !legacyIds.has(id));
  const commonIds = [...legacyIds].filter((id) => targetIds.has(id));
  const fieldDrift = [];
  for (const id of commonIds) {
    const L = legacyMap.get(id);
    const T = targetMap.get(id);
    const phoneOk = (L.phone || "") === (T.phone || "");
    const displayOk = (L.displayName || "") === (T.displayName || "");
    const bindingsOk = compareBindings(L.bindings || [], T.bindings || []);
    const topicsOk = compareTopics(L.topics, T.topics);
    if (!phoneOk || !displayOk || !bindingsOk || !topicsOk) {
      fieldDrift.push({
        integratorUserId: id,
        phoneMatch: phoneOk,
        displayNameMatch: displayOk,
        bindingsMatch: bindingsOk,
        topicsMatch: topicsOk,
      });
    }
  }
  const sample = commonIds.slice(0, sampleSize).map((id) => {
    const L = legacyMap.get(id);
    const T = targetMap.get(id);
    return {
      integratorUserId: id,
      legacy: { phone: L.phone, displayName: L.displayName, bindingsCount: (L.bindings || []).length, topics: L.topics },
      webapp: { phone: T.phone, displayName: T.displayName, bindingsCount: (T.bindings || []).length, topics: T.topics },
    };
  });
  return {
    totalLegacyUsers: legacyMap.size,
    totalProjectedWithIntegratorId: targetMap.size,
    missingInWebappCount: missingInWebapp.length,
    missingInWebappIds: missingInWebapp.slice(0, 100),
    extraInWebappCount: extraInWebapp.length,
    extraInWebappIds: extraInWebapp.slice(0, 100),
    fieldDriftCount: fieldDrift.length,
    fieldDriftSample: fieldDrift.slice(0, 20),
    sampledComparison: sample,
  };
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

  try {
    const [legacyMap, targetMap] = await Promise.all([fetchLegacy(integratorClient), fetchTarget(webappClient)]);
    const report = buildReport(legacyMap, targetMap, sampleSize);
    console.log(JSON.stringify(report, null, 2));

    const totalLegacy = report.totalLegacyUsers || 0;
    const missing = report.missingInWebappCount || 0;
    const drift = report.fieldDriftCount || 0;
    const extra = report.extraInWebappCount || 0;
    const mismatchPercent = totalLegacy > 0 ? (100 * missing) / totalLegacy : 0;
    const overThreshold = maxMismatchPercent > 0 && mismatchPercent > maxMismatchPercent;
    const hasMissing = missing > 0;
    const hasDrift = drift > 0;
    const exitCode = overThreshold || hasMissing || hasDrift ? 1 : 0;
    if (hasDrift) console.error(`[reconcile-person-domain] fieldDrift: ${drift} records with mismatched fields`);
    if (extra > 0) console.warn(`[reconcile-person-domain] warning: ${extra} extra records in webapp not in integrator`);
    process.exit(exitCode);
  } finally {
    await webappClient.end();
    await integratorClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

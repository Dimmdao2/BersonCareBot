#!/usr/bin/env tsx
// HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
// Kept for reproducible integrator-schema migration audits; it is not a live runtime workflow.
import "dotenv/config";
import pg from "pg";

const HELP = `Usage:
  DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/02_backfill.ts
  DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/02_backfill.ts --commit --target=system-settings-mirror

Targets:
  system-settings-mirror   Copy public.system_settings rows into integrator.system_settings without printing values.

Default mode is dry-run.`;

type CountRow = { count: string };
type CopyResult = { inserted: string; updated: string };

function toNumber(value: string | undefined): number {
  const n = Number(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function dryRunSystemSettingsMirror(client: pg.Client): Promise<Record<string, number>> {
  const missing = await client.query<CountRow>(
    `SELECT count(*)::text AS count
     FROM public.system_settings p
     LEFT JOIN integrator.system_settings i
       ON i.key = p.key
      AND i.scope = p.scope
      AND i.organization_id IS NOT DISTINCT FROM p.organization_id
     WHERE i.key IS NULL`,
  );
  const valueDrift = await client.query<CountRow>(
    `SELECT count(*)::text AS count
     FROM public.system_settings p
     JOIN integrator.system_settings i
       ON i.key = p.key
      AND i.scope = p.scope
      AND i.organization_id IS NOT DISTINCT FROM p.organization_id
     WHERE i.value_json IS DISTINCT FROM p.value_json`,
  );
  const extra = await client.query<CountRow>(
    `SELECT count(*)::text AS count
     FROM integrator.system_settings i
     LEFT JOIN public.system_settings p
       ON p.key = i.key
      AND p.scope = i.scope
      AND p.organization_id IS NOT DISTINCT FROM i.organization_id
     WHERE p.key IS NULL`,
  );
  return {
    missingInIntegrator: toNumber(missing.rows[0]?.count),
    valueDrift: toNumber(valueDrift.rows[0]?.count),
    extraInIntegrator: toNumber(extra.rows[0]?.count),
  };
}

async function commitSystemSettingsMirror(client: pg.Client): Promise<CopyResult> {
  await client.query("BEGIN");
  try {
    const inserted = await client.query<CountRow>(
      `WITH inserted AS (
         INSERT INTO integrator.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
         SELECT p.key, p.scope, p.organization_id, p.value_json, p.updated_at, p.updated_by
         FROM public.system_settings p
         LEFT JOIN integrator.system_settings i
           ON i.key = p.key
          AND i.scope = p.scope
          AND i.organization_id IS NOT DISTINCT FROM p.organization_id
         WHERE i.key IS NULL
         RETURNING 1
       )
       SELECT count(*)::text AS count FROM inserted`,
    );
    const updated = await client.query<CountRow>(
      `WITH updated AS (
         UPDATE integrator.system_settings i
         SET value_json = p.value_json,
             updated_at = p.updated_at,
             updated_by = p.updated_by
         FROM public.system_settings p
         WHERE i.key = p.key
           AND i.scope = p.scope
           AND i.organization_id IS NOT DISTINCT FROM p.organization_id
           AND i.value_json IS DISTINCT FROM p.value_json
         RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`,
    );
    await client.query("COMMIT");
    return {
      inserted: inserted.rows[0]?.count ?? "0",
      updated: updated.rows[0]?.count ?? "0",
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const target = argValue("target") ?? "system-settings-mirror";
  if (target !== "system-settings-mirror") {
    console.error(`Unknown target: ${target}`);
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const commit = process.argv.includes("--commit");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const before = await dryRunSystemSettingsMirror(client);
    if (!commit) {
      console.log(JSON.stringify({ mode: "dry-run", target, before }, null, 2));
      return;
    }
    const applied = await commitSystemSettingsMirror(client);
    const after = await dryRunSystemSettingsMirror(client);
    console.log(JSON.stringify({ mode: "commit", target, before, applied, after }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

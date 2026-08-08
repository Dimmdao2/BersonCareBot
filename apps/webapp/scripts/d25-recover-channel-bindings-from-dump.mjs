#!/usr/bin/env node
/**
 * D25 — recover messenger links from the 08.08.2026 `integrator` pre-drop dumps into
 * `public.user_channel_bindings`, for environments where `integrator.identities` is already gone
 * (dev and TEST were cut on 08.08; production was not touched and is served by migration 0383
 * instead, which reads the live table).
 *
 * Owner constraint this obeys: the dropped integrator tables are NOT restored into dev or test.
 * Nothing is written to `integrator`; the dump is parsed as a file and only
 * `public.user_channel_bindings` is inserted into.
 *
 * Dumps: /home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/
 *   <db>.integrator.identities.sql   (id, user_id, resource, external_id, created_at, updated_at)
 *   <db>.integrator.users.sql        (id, created_at, updated_at, merged_into_user_id)
 * Checksums: SHA256SUMS in the same directory (`sha256sum -c SHA256SUMS`).
 *
 * Every identity ends up in exactly one class and the class is printed per row:
 *   present      — a binding for (channel, external_id) already exists; nothing to do
 *   recoverable  — no binding, but the anchor resolves to a platform_users row → INSERT
 *   no-account   — no binding and no platform_users row names this anchor; the chat never became
 *                  a webapp account, so there is nothing to reconcile it into
 *
 * Dry run by default. Pass --apply to write. Pass --database-url=… or set DATABASE_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const DEFAULT_DUMP_DIR = '/home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const apply = process.argv.includes('--apply');
const dumpDir = arg('dump-dir', DEFAULT_DUMP_DIR);
const dumpPrefix = arg('dump-prefix', null);
const databaseUrl = arg('database-url', process.env.DATABASE_URL);

if (!databaseUrl) {
  console.error('DATABASE_URL is required (env or --database-url=…)');
  process.exit(2);
}
if (!dumpPrefix) {
  console.error('--dump-prefix=<db name used in the dump file names> is required, e.g. bersoncarebot_test');
  process.exit(2);
}

/** Parse the single COPY block of a one-table pg_dump into an array of column-keyed rows. */
function parseCopyBlock(file, table) {
  const text = fs.readFileSync(file, 'utf8');
  const header = new RegExp(`^COPY ${table.replace('.', '\\.')} \\(([^)]*)\\) FROM stdin;$`, 'm');
  const match = header.exec(text);
  if (!match) throw new Error(`no COPY block for ${table} in ${file}`);
  const columns = match[1].split(',').map((c) => c.trim());
  const body = text.slice(match.index + match[0].length + 1);
  const end = body.indexOf('\n\\.\n');
  if (end < 0) throw new Error(`unterminated COPY block for ${table} in ${file}`);
  return body
    .slice(0, end)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells = line.split('\t').map((c) => (c === '\\N' ? null : c));
      return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? null]));
    });
}

async function main() {
  const identitiesFile = path.join(dumpDir, `${dumpPrefix}.integrator.identities.sql`);
  const identities = parseCopyBlock(identitiesFile, 'integrator.identities');
  console.log(`parsed ${identities.length} identities from ${identitiesFile}`);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const classes = { present: [], recoverable: [], 'no-account': [] };

    for (const row of identities) {
      const { rows: bound } = await client.query(
        'SELECT 1 FROM public.user_channel_bindings WHERE channel_code = $1 AND external_id = $2 LIMIT 1',
        [row.resource, row.external_id],
      );
      if (bound.length > 0) {
        classes.present.push(row);
        continue;
      }
      const { rows: owner } = await client.query(
        'SELECT id FROM public.platform_users WHERE integrator_user_id = $1::bigint LIMIT 1',
        [row.user_id],
      );
      if (owner.length === 0) {
        classes['no-account'].push(row);
        continue;
      }
      classes.recoverable.push({ ...row, platform_user_id: owner[0].id });
    }

    for (const [name, rows] of Object.entries(classes)) {
      console.log(`\n${name}: ${rows.length}`);
      if (name === 'present') continue;
      for (const r of rows) {
        console.log(
          `  identity=${r.id} anchor=${r.user_id} ${r.resource}:${r.external_id}` +
            (r.platform_user_id ? ` → platform_user=${r.platform_user_id}` : ''),
        );
      }
    }

    if (!apply) {
      console.log('\ndry run — pass --apply to insert the recoverable rows');
      return;
    }

    await client.query('BEGIN');
    let inserted = 0;
    for (const r of classes.recoverable) {
      const res = await client.query(
        `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, created_at)
         VALUES ($1::uuid, $2, $3, $4::timestamptz)
         ON CONFLICT (channel_code, external_id) DO NOTHING`,
        [r.platform_user_id, r.resource, r.external_id, r.created_at],
      );
      inserted += res.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`\ninserted ${inserted} binding(s)`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

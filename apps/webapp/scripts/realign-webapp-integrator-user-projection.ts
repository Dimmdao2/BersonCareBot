#!/usr/bin/env tsx
/**
 * Rekeys webapp projection rows: integrator_user_id loser → winner (Stage 4).
 *
 * Updates the remaining projection targets in one transaction.
 *
 * Usage (webapp DATABASE_URL):
 *   pnpm realign-webapp-integrator-user -- --winner=99 --loser=10
 *   pnpm realign-webapp-integrator-user -- --winner=99 --loser=10 --commit
 *
 * Default: dry-run — только SELECT счётчики (коллизии + строки с loser id по таблицам).
 */
import 'dotenv/config';
import pg from 'pg';
import {
  buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg,
  parseMergePair,
  WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES,
} from '@/infra/ops/webappIntegratorUserProjectionRealignment';

function parseCli(): { winner: string; loser: string; commit: boolean } {
  const argv = process.argv.slice(2);
  let winner: string | undefined;
  let loser: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--winner=')) winner = a.slice('--winner='.length);
    else if (a === '--winner' && argv[i + 1]) winner = argv[++i];
    else if (a.startsWith('--loser=')) loser = a.slice('--loser='.length);
    else if (a === '--loser' && argv[i + 1]) loser = argv[++i];
  }
  if (!winner || !loser) {
    console.error('Required: --winner=<id> --loser=<id> (decimal integrator users.id)');
    process.exit(1);
  }
  const pair = parseMergePair(winner, loser);
  return { ...pair, commit: argv.includes('--commit') };
}

const loserCountSql = buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg();

async function main() {
  const { winner, loser, commit } = parseCli();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const counts = await client.query(loserCountSql, [loser]);
    console.log('[preview] rows still keyed by loser integrator_user_id:');
    for (const row of counts.rows) {
      console.log(`  ${row.tbl}: ${row.cnt}`);
    }

    if (!commit) {
      console.log('\n[DRY-RUN] No writes. Pass --commit to run realignment in one transaction.');
      return;
    }

    await client.query('BEGIN');
    try {
      const updates: { label: string; sql: string }[] = [
        {
          label: 'reminder_rules',
          sql: `UPDATE reminder_rules SET integrator_user_id = $1::bigint, updated_at = now()
                WHERE integrator_user_id::text = $2`,
        },
        {
          label: 'reminder_occurrence_history',
          sql: `UPDATE reminder_occurrence_history SET integrator_user_id = $1::bigint WHERE integrator_user_id::text = $2`,
        },
        {
          label: 'reminder_delivery_events',
          sql: `UPDATE reminder_delivery_events SET integrator_user_id = $1::bigint WHERE integrator_user_id::text = $2`,
        },
        {
          label: 'content_access_grants_webapp',
          sql: `UPDATE content_access_grants_webapp SET integrator_user_id = $1::bigint WHERE integrator_user_id::text = $2`,
        },
        {
          label: 'support_conversations',
          sql: `UPDATE support_conversations SET integrator_user_id = $1::bigint, updated_at = now()
                WHERE integrator_user_id IS NOT NULL AND integrator_user_id::text = $2`,
        },
      ];

      if (updates.length !== WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES.length) {
        throw new Error(
          'internal: update steps out of sync with WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES',
        );
      }

      for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        if (WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES[i] !== u.label) {
          throw new Error(`internal: label mismatch at ${i}`);
        }
        const r = await client.query(u.sql, [winner, loser]);
        console.log(`[commit] updated ${u.label}: ${r.rowCount ?? 0} rows`);
      }

      await client.query('COMMIT');
      console.log('\n[commit] COMMIT ok. Re-run without --commit to verify loser counts are 0.');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

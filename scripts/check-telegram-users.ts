/**
 * One-off: print counts for telegram_users vs identities (telegram) to debug backfill.
 * Run: npx tsx scripts/check-telegram-users.ts
 * Requires: .env with DATABASE_URL
 */
import '../src/config/loadEnv.js';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set. Create .env with DATABASE_URL.');
  process.exit(1);
}

const db = new Pool({ connectionString });

async function main() {
  try {
    const [tg, ident, withPhone, applied] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM telegram_users'),
      db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM identities WHERE resource = 'telegram'"),
      db.query<{ count: string }>(`
        SELECT COUNT(DISTINCT i.user_id)::text AS count
        FROM identities i
        WHERE i.resource = 'telegram'
          AND EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.user_id = i.user_id AND c.type = 'phone'
              AND c.value_normalized IS NOT NULL AND TRIM(c.value_normalized) != ''
          )
      `),
      db.query<{ version: string }>(
        "SELECT version FROM integrator.schema_migrations WHERE version LIKE 'telegram:%' ORDER BY version",
      ),
    ]);

    console.log('telegram_users rows:        ', tg.rows[0]?.count ?? '?');
    console.log('identities (resource=telegram):', ident.rows[0]?.count ?? '?');
    console.log('identities telegram with phone:', withPhone.rows[0]?.count ?? '?');
    console.log('Applied backfill migrations:', applied.rows.map((r) => r.version).join(', ') || 'none');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

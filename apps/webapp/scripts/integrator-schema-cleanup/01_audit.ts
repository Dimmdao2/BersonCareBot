#!/usr/bin/env tsx
// HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
// Kept for reproducible integrator-schema migration audits; it is not a live runtime workflow.
import 'dotenv/config';
import pg from 'pg';

type CountRow = { count: string };
type TableStatus = {
  schema: string;
  table: string;
  exists: boolean;
  count: number | null;
  error?: string;
};
type QueryResult<T> = { rows: T[] };

const TABLES: Array<{ schema: string; table: string }> = [
  { schema: 'public', table: 'system_settings' },
  { schema: 'public', table: 'integrator_push_outbox' },
  { schema: 'public', table: 'reminder_rules' },
  { schema: 'public', table: 'reminder_occurrence_history' },
  { schema: 'public', table: 'reminder_delivery_events' },
  { schema: 'integrator', table: 'user_reminder_rules' },
  { schema: 'integrator', table: 'user_reminder_occurrences' },
  { schema: 'integrator', table: 'user_reminder_delivery_logs' },
  { schema: 'public', table: 'patient_bookings' },
  { schema: 'public', table: 'be_appointments' },
  { schema: 'integrator', table: 'rubitime_events' },
  { schema: 'integrator', table: 'rubitime_records' },
  { schema: 'integrator', table: 'rubitime_booking_profiles' },
  { schema: 'integrator', table: 'message_retry_jobs' },
  { schema: 'integrator', table: 'contacts' },
  { schema: 'public', table: 'user_channel_bindings' },
  { schema: 'integrator', table: 'conversations' },
  { schema: 'integrator', table: 'conversation_messages' },
  { schema: 'integrator', table: 'message_drafts' },
  { schema: 'integrator', table: 'user_questions' },
  { schema: 'integrator', table: 'question_messages' },
  { schema: 'public', table: 'support_conversations' },
  { schema: 'public', table: 'support_conversation_messages' },
  { schema: 'public', table: 'support_questions' },
  { schema: 'public', table: 'support_question_messages' },
  { schema: 'public', table: 'outgoing_delivery_queue' },
  { schema: 'public', table: 'idempotency_keys' },
  { schema: 'integrator', table: 'idempotency_keys' },
];

const HELP = `Usage:
  DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/01_audit.ts

Options:
  --help        Show this help.

The script is read-only and prints aggregate counts only.`;

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toNumber(value: string | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

async function tableExists(client: pg.Client, schema: string, table: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS "exists"`,
    [schema, table],
  );
  return res.rows[0]?.exists === true;
}

async function countTable(client: pg.Client, schema: string, table: string): Promise<TableStatus> {
  const exists = await tableExists(client, schema, table);
  if (!exists) return { schema, table, exists, count: null };
  try {
    const sql = `SELECT count(*)::text AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
    const res = await client.query<CountRow>(sql);
    return { schema, table, exists, count: toNumber(res.rows[0]?.count) };
  } catch (err) {
    return {
      schema,
      table,
      exists,
      count: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function optionalScalar(
  client: pg.Client,
  name: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<{ name: string; ok: true; value: number } | { name: string; ok: false; error: string }> {
  try {
    const res = await client.query<CountRow>(sql, [...params]);
    return { name, ok: true, value: toNumber(res.rows[0]?.count) };
  } catch (err) {
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const tableCounts: TableStatus[] = [];
    for (const t of TABLES) {
      tableCounts.push(await countTable(client, t.schema, t.table));
    }

    const probes = await Promise.all([
      optionalScalar(
        client,
        'contacts_public_missing_legacy_present',
        `SELECT count(*)::text AS count
         FROM integrator.identities i
         JOIN integrator.contacts c
           ON c.user_id = i.user_id
          AND c.type = 'phone'
          AND c.label = i.resource
         LEFT JOIN public.user_channel_bindings ucb
           ON ucb.channel_code = i.resource
          AND ucb.external_id = i.external_id
         LEFT JOIN public.platform_users pu
           ON pu.id = ucb.user_id
         WHERE NULLIF(TRIM(c.value_normalized), '') IS NOT NULL
           AND NULLIF(TRIM(COALESCE(pu.phone_normalized, '')), '') IS NULL`,
      ),
      optionalScalar(
        client,
        'contacts_public_legacy_phone_mismatch',
        `SELECT count(*)::text AS count
         FROM integrator.identities i
         JOIN integrator.contacts c
           ON c.user_id = i.user_id
          AND c.type = 'phone'
          AND c.label = i.resource
         JOIN public.user_channel_bindings ucb
           ON ucb.channel_code = i.resource
          AND ucb.external_id = i.external_id
         JOIN public.platform_users pu
           ON pu.id = ucb.user_id
         WHERE NULLIF(TRIM(c.value_normalized), '') IS NOT NULL
           AND NULLIF(TRIM(pu.phone_normalized), '') IS NOT NULL
           AND TRIM(c.value_normalized) <> TRIM(pu.phone_normalized)`,
      ),
      optionalScalar(
        client,
        'outgoing_delivery_queue_terminal',
        `SELECT count(*)::text AS count FROM public.outgoing_delivery_queue WHERE status IN ('sent', 'dead', 'cancelled')`,
      ),
      optionalScalar(
        client,
        'integrator_push_outbox_terminal',
        `SELECT count(*)::text AS count FROM public.integrator_push_outbox WHERE status IN ('done', 'dead', 'cancelled')`,
      ),
      optionalScalar(
        client,
        'public_idempotency_expired',
        `SELECT count(*)::text AS count FROM public.idempotency_keys WHERE expires_at < now()`,
      ),
      optionalScalar(
        client,
        'integrator_idempotency_expired',
        `SELECT count(*)::text AS count FROM integrator.idempotency_keys WHERE expires_at < now()`,
      ),
    ]);

    const result = {
      mode: 'read-only',
      generatedAt: new Date().toISOString(),
      tableCounts,
      probes,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

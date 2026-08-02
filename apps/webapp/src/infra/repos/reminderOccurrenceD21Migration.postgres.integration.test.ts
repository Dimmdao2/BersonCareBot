import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';

const organizationId = randomUUID();
const platformUserId = randomUUID();
const ruleId = `d21-migration-rule-${randomUUID()}`;
const legacyOccurrenceId = randomUUID();
const unifiedOccurrenceId = `d21-unified-${randomUUID()}`;
const occurrenceKey = `d21-shared-${randomUUID()}`;

describe('D21 pending occurrence migration', () => {
  beforeAll(async () => {
    await runWebappPgText('ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await runWebappPgText('ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.reminder_rules DISABLE ROW LEVEL SECURITY');
    await runWebappPgText(
      'ALTER TABLE integrator.user_reminder_occurrences DISABLE ROW LEVEL SECURITY',
    );

    await runWebappPgText(
      `INSERT INTO public.be_organizations (id, title)
       VALUES ($1::uuid, 'D21 migration fixture')`,
      [organizationId],
    );
    await runWebappPgText(
      `INSERT INTO public.platform_users (id, display_name)
       VALUES ($1::uuid, 'D21 migration patient')`,
      [platformUserId],
    );
    await runWebappPgText(
      `INSERT INTO public.reminder_rules (
         integrator_rule_id, platform_user_id, organization_id, category, is_enabled,
         schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
         days_mask, content_mode
       ) VALUES (
         $1::text, $2::uuid, $3::uuid, 'warmup', true,
         'interval_window', 'Europe/Moscow', 60, 480, 1320, '1111111', 'none'
       )`,
      [ruleId, platformUserId, organizationId],
    );
    await runWebappPgText(
      `INSERT INTO integrator.user_reminder_occurrences (
         id, rule_id, occurrence_key, planned_at, status, sent_at,
         organization_id, platform_user_id, delivery_generation
       ) VALUES (
         $1::text, $2::text, $3::text, statement_timestamp() - interval '10 minutes',
         'sent', statement_timestamp() - interval '10 minutes', $4::uuid, $5::uuid, 0
       )`,
      [unifiedOccurrenceId, ruleId, occurrenceKey, organizationId, platformUserId],
    );
    await runWebappPgText(
      `CREATE TABLE public.webapp_reminder_occurrences (
         id uuid PRIMARY KEY,
         platform_user_id uuid NOT NULL,
         integrator_rule_id text NOT NULL,
         occurrence_key text NOT NULL,
         planned_at timestamptz NOT NULL,
         status text NOT NULL,
         sent_at timestamptz,
         failed_at timestamptz,
         error_code text,
         organization_id uuid NOT NULL,
         created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
         updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
       )`,
    );
    await runWebappPgText(
      `INSERT INTO public.webapp_reminder_occurrences (
         id, platform_user_id, integrator_rule_id, occurrence_key, planned_at,
         status, organization_id
       ) VALUES (
         $1::uuid, $2::uuid, $3::text, $4::text,
         statement_timestamp() + interval '1 minute', 'queued', $5::uuid
       )`,
      [legacyOccurrenceId, platformUserId, ruleId, occurrenceKey, organizationId],
    );
  });

  afterAll(async () => {
    await runWebappPgText(
      'DELETE FROM integrator.user_reminder_occurrences WHERE rule_id = $1::text',
      [ruleId],
    );
    await runWebappPgText('DELETE FROM public.reminder_rules WHERE integrator_rule_id = $1::text', [
      ruleId,
    ]);
    await runWebappPgText('DELETE FROM public.platform_users WHERE id = $1::uuid', [platformUserId]);
    await runWebappPgText('DELETE FROM public.be_organizations WHERE id = $1::uuid', [organizationId]);
    await runWebappPgText('ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await runWebappPgText('ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY');
    await runWebappPgText(
      'ALTER TABLE integrator.user_reminder_occurrences ENABLE ROW LEVEL SECURITY',
    );
    await getPool().end();
  });

  it('preserves actionable legacy pending state when the unified key already exists', async () => {
    const migrationSql = readFileSync(
      new URL('../../../db/drizzle-migrations/0322_unified_reminder_occurrence_local.sql', import.meta.url),
      'utf8',
    );
    await runWebappPgText(migrationSql);

    const rows = await runWebappPgText<{
      status: string;
      pending: boolean;
    }>(
      `SELECT status,
              status IN ('planned', 'queued')
                AND planned_at >= statement_timestamp() - interval '3 minutes' AS pending
       FROM integrator.user_reminder_occurrences
       WHERE rule_id = $1::text AND occurrence_key = $2::text`,
      [ruleId, occurrenceKey],
    );

    expect(rows.rows).toEqual([{ status: 'queued', pending: true }]);
  });
});

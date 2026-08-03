import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';

type PreservedHistoryRow = { count: string; delivery_count: string };

describe('D5 canonical reminder-rule migration', () => {
  const organizationId = randomUUID();
  const platformUserId = randomUUID();
  const ruleId = `d5-rule-${randomUUID()}`;
  const occurrenceId = `d5-occurrence-${randomUUID()}`;
  const deliveryId = `d5-delivery-${randomUUID()}`;
  const occurrenceKey = `d5-key-${randomUUID()}`;
  const pool = getPool();

  beforeAll(async () => {
    await runWebappPgText(
      'ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE public.be_organizations DISABLE TRIGGER USER; ' +
        'ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE public.reminder_rules DISABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE integrator.user_reminder_occurrences DISABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE integrator.user_reminder_delivery_logs DISABLE ROW LEVEL SECURITY;',
    );
    await runWebappPgText(
      `INSERT INTO public.be_organizations (id, title)
       VALUES ($1::uuid, 'D5 disposable migration fixture')`,
      [organizationId],
    );
    await runWebappPgText(
      `INSERT INTO public.platform_users (id, display_name)
       VALUES ($1::uuid, 'D5 canonical reminder patient')`,
      [platformUserId],
    );
    await runWebappPgText(
      `INSERT INTO public.reminder_rules (
         integrator_rule_id, platform_user_id, integrator_user_id, organization_id, category, is_enabled,
         schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
         days_mask, content_mode
       ) VALUES (
         $1, $2::uuid, 987, $3::uuid, 'lfk', true, 'interval_window', 'Europe/Moscow', 60, 480, 1320,
         '1111111', 'none'
       )`,
      [ruleId, platformUserId, organizationId],
    );
    await runWebappPgText(
      `INSERT INTO integrator.user_reminder_occurrences (
         id, rule_id, platform_user_id, occurrence_key, planned_at, status, organization_id
       ) VALUES ($1, $2, $3::uuid, $4, now(), 'sent', $5::uuid)`,
      [occurrenceId, ruleId, platformUserId, occurrenceKey, organizationId],
    );
    await runWebappPgText(
      `INSERT INTO integrator.user_reminder_delivery_logs (
         id, occurrence_id, channel, status, organization_id
       ) VALUES ($1, $2, 'telegram', 'sent', $3::uuid)`,
      [deliveryId, occurrenceId, organizationId],
    );
  });

  afterAll(async () => {
    await runWebappPgText('DELETE FROM integrator.user_reminder_delivery_logs WHERE id = $1', [
      deliveryId,
    ]);
    await runWebappPgText('DELETE FROM integrator.user_reminder_occurrences WHERE id = $1', [
      occurrenceId,
    ]);
    await runWebappPgText('DELETE FROM public.reminder_rules WHERE integrator_rule_id = $1', [
      ruleId,
    ]);
    await runWebappPgText('DELETE FROM public.platform_users WHERE id = $1::uuid', [
      platformUserId,
    ]);
    await runWebappPgText('DELETE FROM public.be_organizations WHERE id = $1::uuid', [
      organizationId,
    ]);
    await runWebappPgText(
      'ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE public.be_organizations ENABLE TRIGGER USER; ' +
        'ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE integrator.user_reminder_occurrences ENABLE ROW LEVEL SECURITY; ' +
        'ALTER TABLE integrator.user_reminder_delivery_logs ENABLE ROW LEVEL SECURITY;',
    );
    await pool.end();
  });

  it('uses public.reminder_rules as the occurrence parent, preserves delivery history, and fails closed on parent deletion', async () => {
    const occurrenceParent = await runWebappPgText<{ parent: string; definition: string }>(
      `SELECT confrelid::regclass::text AS parent, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'integrator.user_reminder_occurrences'::regclass
         AND conname = 'user_reminder_occurrences_rule_id_fkey'`,
    );
    expect(occurrenceParent.rows[0]).toEqual(
      expect.objectContaining({
        parent: 'reminder_rules',
        definition: expect.stringContaining('ON DELETE RESTRICT'),
      }),
    );

    const schedulerOrganizations = await runWebappPgText<{ organization_id: string }>(
      'SELECT app.list_scheduler_reminder_organization_ids()::text AS organization_id',
    );
    expect(schedulerOrganizations.rows.map((row) => row.organization_id)).toContain(organizationId);

    await expect(
      runWebappPgText('DELETE FROM public.reminder_rules WHERE integrator_rule_id = $1', [ruleId]),
    ).rejects.toMatchObject({ cause: { code: '23503' } });

    const preserved = await runWebappPgText<PreservedHistoryRow>(
      `SELECT
         (SELECT count(*)::text FROM integrator.user_reminder_occurrences WHERE id = $1) AS count,
         (SELECT count(*)::text FROM integrator.user_reminder_delivery_logs WHERE id = $2) AS delivery_count`,
      [occurrenceId, deliveryId],
    );
    expect(preserved.rows[0]).toEqual({ count: '1', delivery_count: '1' });
  });
});

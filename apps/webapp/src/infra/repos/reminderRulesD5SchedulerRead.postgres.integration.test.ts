/**
 * D5 audit proof (#987 D5, Track D). Mirrors the exact predicate `getEnabledReminderRules`
 * (apps/integrator/src/infra/db/repos/reminders.ts) issues against `public.reminder_rules` --
 * `is_enabled = true AND integrator_user_id IS NOT NULL AND organization_id = :org` -- against
 * this file's private disposable clone (integrator's own package has no postgres-integration
 * harness of its own; the predicate is reviewed source, not re-derived here).
 *
 * Named faults this proof kills:
 *  - a foreign organization's canonical rule leaking into another organization's scheduler read;
 *  - a rule with no `integrator_user_id` (never bot-linked, so it has no delivery channel) being
 *    picked up as if it were schedulable;
 *  - a disabled rule being scheduled.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runWebappPgText } from '@/infra/db/runWebappSql';

const ORG_A = randomUUID();
const ORG_B = randomUUID();

const SCHEDULER_READ_SQL = `
  SELECT integrator_rule_id
  FROM public.reminder_rules
  WHERE is_enabled = true
    AND integrator_user_id IS NOT NULL
    AND organization_id = $1
  ORDER BY integrator_rule_id
`;

function baseRule(overrides: {
  integratorRuleId: string;
  organizationId: string;
  integratorUserId: number | null;
  isEnabled: boolean;
}) {
  return overrides;
}

async function insertRule(row: {
  integratorRuleId: string;
  organizationId: string;
  integratorUserId: number | null;
  isEnabled: boolean;
}): Promise<void> {
  await runWebappPgText(
    `INSERT INTO public.reminder_rules (
       integrator_rule_id, integrator_user_id, organization_id, category, is_enabled,
       schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
       days_mask, content_mode
     ) VALUES ($1, $2, $3::uuid, 'lfk', $4, 'interval_window', 'Europe/Moscow', 60, 480, 1320, '1111111', 'none')`,
    [row.integratorRuleId, row.integratorUserId, row.organizationId, row.isEnabled],
  );
}

describe('D5 scheduler read: exact-org + bot-linked eligibility (mirrors getEnabledReminderRules)', () => {
  const eligibleRuleId = `d5-elig-${randomUUID()}`;
  const foreignOrgRuleId = `d5-foreign-${randomUUID()}`;
  const notBotLinkedRuleId = `d5-nolink-${randomUUID()}`;
  const disabledRuleId = `d5-disabled-${randomUUID()}`;
  const allRuleIds = [eligibleRuleId, foreignOrgRuleId, notBotLinkedRuleId, disabledRuleId];

  beforeAll(async () => {
    await runWebappPgText('ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await runWebappPgText('ALTER TABLE public.reminder_rules DISABLE ROW LEVEL SECURITY');
    for (const organizationId of [ORG_A, ORG_B]) {
      await runWebappPgText(
        `INSERT INTO public.be_organizations (id, title) VALUES ($1::uuid, 'D5 scheduler-read fixture')`,
        [organizationId],
      );
    }
    await insertRule(
      baseRule({
        integratorRuleId: eligibleRuleId,
        organizationId: ORG_A,
        integratorUserId: 1001,
        isEnabled: true,
      }),
    );
    await insertRule(
      baseRule({
        integratorRuleId: foreignOrgRuleId,
        organizationId: ORG_B,
        integratorUserId: 1002,
        isEnabled: true,
      }),
    );
    await insertRule(
      baseRule({
        integratorRuleId: notBotLinkedRuleId,
        organizationId: ORG_A,
        integratorUserId: null,
        isEnabled: true,
      }),
    );
    await insertRule(
      baseRule({
        integratorRuleId: disabledRuleId,
        organizationId: ORG_A,
        integratorUserId: 1003,
        isEnabled: false,
      }),
    );
  });

  afterAll(async () => {
    for (const id of allRuleIds) {
      await runWebappPgText('DELETE FROM public.reminder_rules WHERE integrator_rule_id = $1', [id]);
    }
    for (const organizationId of [ORG_A, ORG_B]) {
      await runWebappPgText('DELETE FROM public.be_organizations WHERE id = $1::uuid', [
        organizationId,
      ]);
    }
    await runWebappPgText('ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY');
    await runWebappPgText('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await runWebappPgText('ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY');
  });

  it('returns only the exact-org, bot-linked, enabled canonical rule', async () => {
    const rowsForOrgA = await runWebappPgText<{ integrator_rule_id: string }>(
      SCHEDULER_READ_SQL,
      [ORG_A],
    );
    expect(rowsForOrgA.rows.map((r) => r.integrator_rule_id)).toEqual([eligibleRuleId]);
  });

  it('a foreign organization principal never sees another organization rule', async () => {
    const rowsForOrgB = await runWebappPgText<{ integrator_rule_id: string }>(
      SCHEDULER_READ_SQL,
      [ORG_B],
    );
    expect(rowsForOrgB.rows.map((r) => r.integrator_rule_id)).toEqual([foreignOrgRuleId]);
    expect(rowsForOrgB.rows.map((r) => r.integrator_rule_id)).not.toContain(eligibleRuleId);
  });
});

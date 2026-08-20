import type { ReminderRule } from '@/modules/reminders/types';
import { postReminderRuleUpsertToIntegrator } from './integratorM2mPosts';
import type { IntegratorPushOutboxRow } from './integratorPushOutbox';

export async function deliverIntegratorPushPayload(row: IntegratorPushOutboxRow): Promise<void> {
  if (row.kind === 'reminder_rule_upsert') {
    const rule = row.payload as unknown as ReminderRule;
    if (!rule.integratorUserId) return;
    await postReminderRuleUpsertToIntegrator(rule, row.idempotencyKey);
    return;
  }
}

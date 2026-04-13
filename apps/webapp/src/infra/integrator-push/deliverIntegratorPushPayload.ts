import type { ReminderRule } from "@/modules/reminders/types";
import {
  postReminderRuleUpsertToIntegrator,
  postSystemSettingsSyncToIntegrator,
  type SystemSettingsSyncWireInput,
} from "./integratorM2mPosts";
import type { IntegratorPushOutboxRow } from "./integratorPushOutbox";

export async function deliverIntegratorPushPayload(row: IntegratorPushOutboxRow): Promise<void> {
  if (row.kind === "system_settings_sync") {
    await postSystemSettingsSyncToIntegrator(row.payload as unknown as SystemSettingsSyncWireInput);
    return;
  }
  if (row.kind === "reminder_rule_upsert") {
    await postReminderRuleUpsertToIntegrator(row.payload as unknown as ReminderRule);
    return;
  }
}

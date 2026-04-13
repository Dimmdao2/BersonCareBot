/**
 * Notify integrator of a reminder rule change (webapp DB is source of truth; integrator stores rules for dispatch).
 * Immediate signed POST; on failure (except missing config) enqueues {@link integrator_push_outbox} for retry.
 */
import { getPool } from "@/infra/db/client";
import { enqueueIntegratorPush } from "@/infra/integrator-push/integratorPushOutbox";
import { postReminderRuleUpsertToIntegrator } from "@/infra/integrator-push/integratorM2mPosts";
import type { ReminderRule } from "./types";

export async function notifyIntegratorRuleUpdated(rule: ReminderRule): Promise<void> {
  try {
    await postReminderRuleUpsertToIntegrator(rule);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "integrator_m2m_unconfigured") {
      console.warn("[reminders] notifyIntegrator: INTEGRATOR_API_URL or secret not configured, skipping");
      return;
    }
    try {
      await enqueueIntegratorPush(getPool(), {
        kind: "reminder_rule_upsert",
        idempotencyKey: `reminder_rule:${rule.id}`,
        payload: { ...rule } as Record<string, unknown>,
      });
    } catch (enqueueErr) {
      console.error("[reminders] notifyIntegrator: enqueue failed:", enqueueErr);
      throw err;
    }
    console.warn("[reminders] notifyIntegrator: immediate POST failed, enqueued for retry:", msg);
  }
}

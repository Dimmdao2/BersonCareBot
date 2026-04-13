/**
 * Push a single setting row to integrator DB (`system_settings` mirror; separate PostgreSQL from webapp).
 * HMAC signing matches {@link notifyIntegratorRuleUpdated} / send-sms M2M.
 *
 * **Call site:** only {@link createSystemSettingsService} after successful `upsert`, so every
 * API/UI path that updates `system_settings` triggers sync without duplicating calls in routes.
 *
 * **Delivery:** immediate signed POST; on failure (except missing config) row is written to
 * `integrator_push_outbox` for {@link runIntegratorPushWorkerTick}.
 */
import { getPool } from "@/infra/db/client";
import { enqueueIntegratorPush } from "@/infra/integrator-push/integratorPushOutbox";
import {
  postSystemSettingsSyncToIntegrator,
  type SystemSettingsSyncWireInput,
} from "@/infra/integrator-push/integratorM2mPosts";

/** Aligns stored `value_json` with the wire shape expected by integrator (same as admin route normalization). */
export function normalizeStoredValueJsonForIntegratorSync(valueJson: unknown): { value: unknown } {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return valueJson as { value: unknown };
  }
  return { value: valueJson };
}

export async function syncSettingToIntegrator(input: SystemSettingsSyncWireInput): Promise<void> {
  try {
    await postSystemSettingsSyncToIntegrator(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "integrator_m2m_unconfigured") {
      console.warn(
        "[system_settings] syncToIntegrator: INTEGRATOR_API_URL or INTEGRATOR_WEBHOOK_SECRET not configured, skipping",
      );
      return;
    }
    try {
      const pool = getPool();
      await enqueueIntegratorPush(pool, {
        kind: "system_settings_sync",
        idempotencyKey: `settings:${input.scope}:${input.key}`,
        payload: {
          key: input.key,
          scope: input.scope,
          valueJson: input.valueJson,
          ...(input.updatedBy != null && input.updatedBy !== "" ? { updatedBy: String(input.updatedBy) } : {}),
        },
      });
    } catch (enqueueErr) {
      console.error("[system_settings] syncToIntegrator: enqueue failed after HTTP error:", enqueueErr);
      return;
    }
    console.warn("[system_settings] syncToIntegrator: immediate POST failed, enqueued for retry:", msg);
  }
}

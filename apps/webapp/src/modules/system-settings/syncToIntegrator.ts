/**
 * Push a single setting row to integrator DB (`system_settings` mirror; separate PostgreSQL from webapp).
 * HMAC signing matches {@link notifyIntegratorRuleUpdated} / send-sms M2M.
 *
 * **Call site:** only {@link createSystemSettingsService} after successful `upsert`, so every
 * API/UI path that updates `system_settings` triggers sync without duplicating calls in routes.
 */
import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

/** Aligns stored `value_json` with the wire shape expected by integrator (same as admin route normalization). */
export function normalizeStoredValueJsonForIntegratorSync(valueJson: unknown): { value: unknown } {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return valueJson as { value: unknown };
  }
  return { value: valueJson };
}

export async function syncSettingToIntegrator(input: {
  key: string;
  scope: "global" | "doctor" | "admin";
  valueJson: { value: unknown };
  updatedBy?: string | null;
}): Promise<void> {
  const baseUrl = (await getIntegratorApiUrl()).trim();
  const secret = (await getIntegratorWebhookSecret()).trim();

  if (!baseUrl || !secret) {
    console.warn(
      "[system_settings] syncToIntegrator: INTEGRATOR_API_URL or INTEGRATOR_WEBHOOK_SECRET not configured, skipping",
    );
    return;
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    key: input.key,
    scope: input.scope,
    valueJson: input.valueJson,
    ...(input.updatedBy != null && input.updatedBy !== "" ? { updatedBy: String(input.updatedBy) } : {}),
  });
  const signature = signPayload(timestamp, body, secret);
  const url = `${baseUrl.replace(/\/$/, "")}/api/integrator/settings/sync`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bersoncare-timestamp": timestamp,
      "x-bersoncare-signature": signature,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`integrator responded ${res.status}: ${text.slice(0, 200)}`);
  }
}

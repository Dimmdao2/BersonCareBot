import { createHmac } from "node:crypto";
import { getCurrentCorrelationIdHeader } from "@bersoncare/db-principal";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";
import type { RelayResult } from "@/modules/messaging/relayOutbound";

export type OperatorAlertRelayParams = {
  messageId: string;
  channel: "telegram" | "max" | "sms" | "web_push";
  recipient: string;
  text: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
};

export async function relayOperatorAlert(input: OperatorAlertRelayParams): Promise<RelayResult> {
  const baseUrl = (await getIntegratorApiUrl()).trim();
  if (!baseUrl) return { ok: false, reason: "no_integrator_url" };
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!secret) return { ok: false, reason: "no_integrator_secret" };
  const body = JSON.stringify({
    ...input,
    idempotencyKey: `${input.organizationId ?? "global"}:${input.messageId}:${input.channel}:${input.recipient}`,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/bersoncare/operator-alert-relay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bersoncare-Timestamp": timestamp,
        "X-Bersoncare-Signature": signature,
        ...getCurrentCorrelationIdHeader(),
      },
      body,
    });
    const data = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!response.ok) return { ok: false, reason: data.error ?? `http_${response.status}` };
    const status = data.status;
    return { ok: true, status: status === "duplicate" || status === "skipped" ? status : "accepted" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "fetch_error" };
  }
}

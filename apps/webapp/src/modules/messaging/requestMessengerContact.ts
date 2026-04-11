/**
 * M2M: попросить интегратор отправить в чат запрос контакта (Telegram / MAX).
 * Подпись — как relay-outbound.
 */
import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";

/** Окно идемпотентности: повторные нажатия в Mini App не шлют новое сообщение в чат до смены окна. */
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export type RequestMessengerContactResult =
  | { ok: true; status: "accepted" | "duplicate" }
  | { ok: false; reason: string };

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export async function requestMessengerContactViaIntegrator(input: {
  channel: "telegram" | "max";
  recipientId: string;
}): Promise<RequestMessengerContactResult> {
  const integratorUrl = (await getIntegratorApiUrl()).trim();
  if (!integratorUrl) {
    return { ok: false, reason: "no_integrator_url" };
  }
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!secret) {
    return { ok: false, reason: "no_webhook_secret" };
  }

  const bucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
  const idempotencyKey = `webapp-request-contact:${input.channel}:${input.recipientId}:${bucket}`;
  const bodyObj = {
    channel: input.channel,
    recipientId: input.recipientId.trim(),
    idempotencyKey,
  };
  const rawBody = JSON.stringify(bodyObj);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(timestamp, rawBody, secret);
  const url = `${integratorUrl.replace(/\/$/, "")}/api/bersoncare/request-contact`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bersoncare-Timestamp": timestamp,
      "X-Bersoncare-Signature": signature,
    },
    body: rawBody,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: string;
    error?: string;
  };

  if (!res.ok) {
    return { ok: false, reason: data.error ?? `http_${res.status}` };
  }
  if (data.status === "duplicate") {
    return { ok: true, status: "duplicate" };
  }
  return { ok: true, status: "accepted" };
}

/**
 * Relay-outbound клиент: отправляет сообщение пациенту через integrator.
 * Контракт: INTEGRATOR_CONTRACT.md, раздел «Flow: relay-outbound».
 * Retry: 0s → 10s → 60s → 5min (4 попытки).
 * Idempotency key: `${messageId}:${channel}:${recipient}`.
 */
import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";

export type RelayResult =
  | { ok: true; status: "accepted" | "duplicate" }
  | { ok: false; reason: string };

export type RelayOutboundParams = {
  messageId: string;
  channel: string;
  recipient: string;
  text: string;
  /** Webapp userId для shouldDispatch guard (dev_mode whitelist). */
  userId?: string;
};

export type RelayOutboundDeps = {
  /**
   * Callback из Pack B systemSettingsService.shouldDispatch.
   * Если не задан — relay всегда разрешён.
   */
  shouldDispatch?: (userId: string) => Promise<boolean>;
  /**
   * Задержки между попытками retry (ms). По умолчанию: [0, 10000, 60000, 300000].
   * Переопределяйте в тестах для ускорения.
   */
  retryDelaysMs?: number[];
};

const DEFAULT_RETRY_DELAYS_MS = [0, 10_000, 60_000, 300_000];

let warnedMissingUrl = false;

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptResult =
  | { ok: true; status: string }
  | { ok: false; error: string; httpStatus: number };

async function attemptRelay(
  url: string,
  body: string,
  secret: string,
): Promise<AttemptResult> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(timestamp, body, secret);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bersoncare-Timestamp": timestamp,
      "X-Bersoncare-Signature": signature,
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: string;
    error?: string;
  };

  if (!res.ok) {
    return { ok: false, error: data.error ?? `http_${res.status}`, httpStatus: res.status };
  }
  return { ok: true, status: data.status ?? "accepted" };
}

export async function relayOutbound(
  params: RelayOutboundParams,
  deps: RelayOutboundDeps = {},
): Promise<RelayResult> {
  const { messageId, channel, recipient, text, userId } = params;
  const { shouldDispatch, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS } = deps;

  const integratorUrl = (await getIntegratorApiUrl()).trim();
  if (!integratorUrl) {
    if (!warnedMissingUrl) {
      warnedMissingUrl = true;
      console.warn("[relay] INTEGRATOR_API_URL не задан — outbound relay отключён");
    }
    return { ok: false, reason: "no_integrator_url" };
  }

  if (shouldDispatch) {
    if (!userId) {
      // dev_mode guard активен, но userId неизвестен → нельзя проверить whitelist → блокируем
      return { ok: false, reason: "dev_mode_skip_no_user" };
    }
    const allowed = await shouldDispatch(userId);
    if (!allowed) {
      return { ok: false, reason: "dev_mode_skip" };
    }
  }

  const secret = (await getIntegratorWebhookSecret()).trim();
  const idempotencyKey = `${messageId}:${channel}:${recipient}`;
  const url = `${integratorUrl.replace(/\/$/, "")}/api/bersoncare/relay-outbound`;

  const bodyObj = { messageId, channel, recipient, text, idempotencyKey };
  const rawBody = JSON.stringify(bodyObj);

  let lastError: string = "unknown";

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelaysMs[attempt]!);
    }
    try {
      const result = await attemptRelay(url, rawBody, secret);
      if (result.ok) {
        return {
          ok: true,
          status: result.status === "duplicate" ? "duplicate" : "accepted",
        };
      }
      lastError = result.error;
      // Client errors (4xx) won't be fixed by retrying
      if (result.httpStatus >= 400 && result.httpStatus < 500) {
        console.warn(`[relay] client error ${result.httpStatus} — прерываем retry`);
        return { ok: false, reason: lastError };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "fetch_error";
    }
  }

  console.error(`[relay] все ${retryDelaysMs.length} попытки провалились: ${lastError}`);
  return { ok: false, reason: lastError };
}

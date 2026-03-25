import { createHmac } from "node:crypto";
import { env, integratorWebhookSecret } from "@/config/env";

type SendEmailCodeResult = { ok: true } | { ok: false; error: string };

export type IntegratorEmailAdapterDeps = {
  integratorBaseUrl: string;
  sharedSecret: string;
  fetchImpl?: typeof fetch;
};

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export function createIntegratorEmailAdapter(deps: IntegratorEmailAdapterDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.integratorBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/api/bersoncare/send-email`;

  return {
    async sendEmailCode(to: string, code: string): Promise<SendEmailCodeResult> {
      if (!deps.integratorBaseUrl || !deps.sharedSecret) {
        return { ok: false, error: "integrator_not_configured" };
      }

      const body = JSON.stringify({ to, code });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signPayload(timestamp, body, deps.sharedSecret);

      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bersoncare-Timestamp": timestamp,
          "X-Bersoncare-Signature": signature,
        },
        body,
      });
      if (!res.ok) {
        return { ok: false, error: `http_${res.status}` };
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        return { ok: false, error: data.error ?? "integrator_send_failed" };
      }
      return { ok: true };
    },
  };
}

export async function sendEmailCodeViaIntegrator(to: string, code: string): Promise<SendEmailCodeResult> {
  const adapter = createIntegratorEmailAdapter({
    integratorBaseUrl: env.INTEGRATOR_API_URL,
    sharedSecret: integratorWebhookSecret(),
  });
  return adapter.sendEmailCode(to, code);
}

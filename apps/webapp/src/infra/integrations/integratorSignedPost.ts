import { createHmac } from "node:crypto";
import { env, integratorWebhookSecret } from "@/config/env";

export async function postIntegratorSignedJson(
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; json: unknown; text?: string }> {
  const base = env.INTEGRATOR_API_URL?.trim();
  const secret = integratorWebhookSecret();
  if (!base || !secret) {
    return { ok: false, status: 0, json: { error: "integrator_not_configured" } };
  }
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("base64url");
  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bersoncare-Timestamp": timestamp,
      "X-Bersoncare-Signature": signature,
    },
    body: raw,
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

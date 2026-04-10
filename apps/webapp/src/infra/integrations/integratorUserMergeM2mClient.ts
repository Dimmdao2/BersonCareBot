import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";

const INTEGRATOR_M2M_TIMEOUT_MS = 10_000;

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export type IntegratorCanonicalPairResponse = {
  ok: true;
  sameCanonical: boolean;
  canonicalA: string;
  canonicalB: string;
};

export type IntegratorMergeResponse = {
  ok: true;
  result: Record<string, unknown>;
};

async function integratorM2mPostJson<T>(path: string, body: unknown): Promise<
  | { ok: true; data: T }
  | { ok: false; reason: "unconfigured"; status: number }
  | { ok: false; reason: "timeout"; status: number }
  | { ok: false; reason: "http"; status: number; bodyText: string }
> {
  const baseUrl = (await getIntegratorApiUrl()).trim();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!baseUrl || !secret) {
    return { ok: false, reason: "unconfigured", status: 503 };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(body);
  const signature = signPayload(timestamp, rawBody, secret);
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTEGRATOR_M2M_TIMEOUT_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bersoncare-timestamp": timestamp,
      "x-bersoncare-signature": signature,
    },
    body: rawBody,
    signal: controller.signal,
  })
    .catch((error: unknown) => {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return null;
      }
      if (error instanceof Error) {
        return { networkError: error.message } as const;
      }
      return { networkError: "fetch_failed" } as const;
    })
    .finally(() => clearTimeout(timeout));
  if (res == null) {
    return { ok: false, reason: "timeout", status: 504 };
  }
  if ("networkError" in res) {
    return { ok: false, reason: "http", status: 502, bodyText: res.networkError };
  }
  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, reason: "http", status: res.status, bodyText };
  }
  try {
    return { ok: true, data: JSON.parse(bodyText) as T };
  } catch {
    return { ok: false, reason: "http", status: 502, bodyText: "invalid_json" };
  }
}

export async function checkIntegratorCanonicalPair(
  integratorUserIdA: string,
  integratorUserIdB: string,
): Promise<
  | { ok: true; sameCanonical: boolean; canonicalA: string; canonicalB: string }
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "timeout" }
  | { ok: false; reason: "http"; status: number; bodyText: string }
> {
  const r = await integratorM2mPostJson<IntegratorCanonicalPairResponse>("/api/integrator/users/canonical-pair", {
    integratorUserIdA,
    integratorUserIdB,
  });
  if (!r.ok) {
    if (r.reason === "unconfigured") return { ok: false, reason: "unconfigured" };
    if (r.reason === "timeout") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "http", status: r.status, bodyText: r.bodyText };
  }
  const data = r.data;
  if (!data || typeof data !== "object" || data.ok !== true) {
    return { ok: false, reason: "http", status: 502, bodyText: "bad_shape" };
  }
  return {
    ok: true,
    sameCanonical: Boolean(data.sameCanonical),
    canonicalA: String(data.canonicalA ?? ""),
    canonicalB: String(data.canonicalB ?? ""),
  };
}

export async function callIntegratorUserMerge(input: {
  winnerIntegratorUserId: string;
  loserIntegratorUserId: string;
  dryRun?: boolean;
}): Promise<
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "timeout" }
  | { ok: false; reason: "http"; status: number; bodyText: string }
> {
  const r = await integratorM2mPostJson<IntegratorMergeResponse>("/api/integrator/users/merge", {
    winnerIntegratorUserId: input.winnerIntegratorUserId,
    loserIntegratorUserId: input.loserIntegratorUserId,
    dryRun: input.dryRun === true,
  });
  if (!r.ok) {
    if (r.reason === "unconfigured") return { ok: false, reason: "unconfigured" };
    if (r.reason === "timeout") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "http", status: r.status, bodyText: r.bodyText };
  }
  const data = r.data;
  if (!data || typeof data !== "object" || data.ok !== true || !data.result) {
    return { ok: false, reason: "http", status: 502, bodyText: "bad_shape" };
  }
  return { ok: true, result: data.result as Record<string, unknown> };
}

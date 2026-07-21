import { NextResponse } from "next/server";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import {
  CLIENT_BOOT_REPORT_MAX_BYTES,
  clientBootReportSchema,
} from "@/modules/auth/clientBootReport";
import {
  checkClientBootReportRateLimit,
} from "@/modules/auth/clientBootReportRateLimit";
import { getUnsupportedClientFallbackEnabled } from "@/modules/auth/unsupportedClientFallback";
import { logger } from "@/infra/logging/logger";

function jsonError(error: "invalid_body" | "payload_too_large" | "rate_limited" | "proxy_configuration", status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "invalid_body" | "payload_too_large" };

async function readBoundedUtf8Body(request: Request, maxBytes: number): Promise<BoundedBodyResult> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      totalBytes += part.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return { ok: false, reason: "payload_too_large" };
      }
      chunks.push(part.value);
    }
  } catch {
    await reader.cancel("invalid_body").catch(() => undefined);
    return { ok: false, reason: "invalid_body" };
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined) };
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/patient-app/client-boot-report:POST");
  ensureAuthModulePortsBound();

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return jsonError("invalid_body", 415);

  const declaredLengthHeader = request.headers.get("content-length")?.trim() ?? "";
  const declaredLength = /^\d+$/.test(declaredLengthHeader) ? Number(declaredLengthHeader) : null;
  if (declaredLength !== null && declaredLength > CLIENT_BOOT_REPORT_MAX_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  if (!(await getUnsupportedClientFallbackEnabled())) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const rateLimit = await checkClientBootReportRateLimit(request);
  if (rateLimit === "configuration_error") return jsonError("proxy_configuration", 503);
  if (rateLimit === "rate_limited") {
    logger.warn({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      outcome: "rate_limited",
    });
    return jsonError("rate_limited", 429);
  }

  const body = await readBoundedUtf8Body(request, CLIENT_BOOT_REPORT_MAX_BYTES);
  if (!body.ok) return jsonError(body.reason, body.reason === "payload_too_large" ? 413 : 400);

  let json: unknown;
  try {
    json = JSON.parse(body.text) as unknown;
  } catch {
    return jsonError("invalid_body", 400);
  }
  const parsed = clientBootReportSchema.safeParse(json);
  if (!parsed.success) return jsonError("invalid_body", 400);

  const report = parsed.data;
  logger.info({
    scope: "patient_client_env",
    event: "unsupported_client_boot",
    outcome: "observed",
    entrySurface: report.entrySurface,
    correlationId: report.correlationId,
    timingMs: report.timingMs,
    client: report.client,
    failureSignals: report.failureSignals,
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

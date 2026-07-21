import { NextResponse } from "next/server";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import {
  CLIENT_BOOT_REPORT_MAX_BYTES,
  clientBootReportSchema,
} from "@/modules/auth/clientBootReport";
import {
  isClientBootReportRateLimitedByKey,
  resolveClientBootReportRateLimitClientKey,
} from "@/modules/auth/clientBootReportRateLimit";
import { getUnsupportedClientFallbackEnabled } from "@/modules/auth/unsupportedClientFallback";
import { logger } from "@/infra/logging/logger";

function jsonError(error: "invalid_body" | "payload_too_large" | "rate_limited" | "proxy_configuration", status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/patient-app/client-boot-report:POST");
  ensureAuthModulePortsBound();

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return jsonError("invalid_body", 415);

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_BOOT_REPORT_MAX_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  if (!(await getUnsupportedClientFallbackEnabled())) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const identity = resolveClientBootReportRateLimitClientKey(request);
  if (!identity.ok) return jsonError("proxy_configuration", 503);
  if (await isClientBootReportRateLimitedByKey(identity.key)) {
    logger.warn({
      scope: "patient_client_env",
      event: "unsupported_client_boot",
      outcome: "rate_limited",
    });
    return jsonError("rate_limited", 429);
  }

  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > CLIENT_BOOT_REPORT_MAX_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
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

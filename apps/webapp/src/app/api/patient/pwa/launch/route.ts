import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/infra/logging/logger";

const bodySchema = z.object({
  isStandalone: z.boolean(),
  pushSupported: z.boolean(),
  notificationPermission: z.enum(["default", "granted", "denied", "unsupported"]),
});

/**
 * POST /api/patient/pwa/launch — PWA capability snapshot (не `app_open`; канон — PatientAnalyticsReporter).
 */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  logger.info({
    scope: "patient_pwa",
    event: "pwa_launch",
    userId: gate.session.user.userId,
    ...parsed.data,
  });

  try {
    const deps = buildAppDeps();
    await deps.productAnalytics.recordEventsBatch([
      {
        eventType: "heartbeat",
        entryChannel: parsed.data.isStandalone ? "pwa" : "browser",
        userId: gate.session.user.userId,
        metadata: {
          kind: "pwa_launch_snapshot",
          isStandalone: parsed.data.isStandalone,
          pushSupported: parsed.data.pushSupported,
          notificationPermission: parsed.data.notificationPermission,
        },
      },
    ]);
  } catch {
    /* analytics only */
  }

  return NextResponse.json({ ok: true });
}

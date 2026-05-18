import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/infra/logging/logger";

const bodySchema = z.object({
  isStandalone: z.boolean(),
  pushSupported: z.boolean(),
  notificationPermission: z.enum(["default", "granted", "denied", "unsupported"]),
});

/** POST /api/patient/pwa/launch — lightweight PWA open analytics (no DB write). */
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

  return NextResponse.json({ ok: true });
}

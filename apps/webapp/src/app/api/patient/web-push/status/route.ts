import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * GET /api/patient/web-push/status — явный статус контура Web Push (ещё не реализован).
 * Auth: как у прочих `/api/patient/*` (без redirect).
 */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { ok: false, error: "not_implemented", webPush: "disabled" as const },
    { status: 501 },
  );
}

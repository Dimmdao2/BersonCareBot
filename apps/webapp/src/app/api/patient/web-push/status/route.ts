import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";

/** GET /api/patient/web-push/status */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
  const hasSubscription = await deps.webPushSubscriptions.hasAnyForUserId(gate.session.user.userId);

  if (!vapid) {
    return NextResponse.json({
      ok: true,
      vapidConfigured: false,
      publicKey: null,
      hasSubscription,
    });
  }

  return NextResponse.json({
    ok: true,
    vapidConfigured: true,
    publicKey: vapid.publicKey,
    hasSubscription,
  });
}

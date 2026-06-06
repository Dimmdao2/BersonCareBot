import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";

/** GET /api/doctor/web-push/status */
export async function GET() {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
  const hasSubscription = await deps.webPushSubscriptions.hasAnyForUserId(uid);
  const channelPrefs = await deps.channelPreferencesPort.getPreferences(uid);
  const globalWebPushEnabled =
    channelPrefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;

  if (!vapid) {
    return NextResponse.json({
      ok: true,
      vapidConfigured: false,
      publicKey: null,
      hasSubscription,
      globalWebPushEnabled,
    });
  }

  return NextResponse.json({
    ok: true,
    vapidConfigured: true,
    publicKey: vapid.publicKey,
    hasSubscription,
    globalWebPushEnabled,
  });
}

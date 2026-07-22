import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffWebPushSelfApiSession } from "@/app-layer/guards/requireRole";

/**
 * GET /api/doctor/web-push/status
 *
 * The personal staff/global-admin PWA boundary runs under app_patient identity-self
 * context. Read only the public VAPID key through the narrow SECURITY DEFINER accessor;
 * private key access remains restricted to server-side delivery paths.
 */
export async function GET() {
  const gate = await requireStaffWebPushSelfApiSession();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const publicKey = await deps.systemSettings.getWebPushVapidPublicKeyOnly();
  const hasSubscription = await deps.webPushSubscriptions.hasAnyForUserId(uid);
  const channelPrefs = await deps.channelPreferencesPort.getPreferences(uid);
  const globalWebPushEnabled =
    channelPrefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;

  if (!publicKey) {
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
    publicKey,
    hasSubscription,
    globalWebPushEnabled,
  });
}

import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * GET /api/patient/web-push/status
 *
 * Reads ONLY the public VAPID key via `systemSettings.getWebPushVapidPublicKeyOnly()` — NOT
 * `getWebPushVapidKeyPair` (which reads the full admin `system_settings` row, private key
 * included). The patient DB role (`app_patient`) has no grant on `system_settings` at all (by
 * design — that table also holds admin allowlists/secrets); the narrow accessor is a SECURITY
 * DEFINER function scoped to just the public key (deploy/postgres/patient-web-push-vapid-public-
 * key-accessor.sql). Doctor/admin routes keep using `getWebPushVapidKeyPair` under `app_staff`,
 * which retains its full table grant.
 */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
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

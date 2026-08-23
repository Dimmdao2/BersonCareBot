import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAccountWebPushSelfApiSession } from '@/app-layer/guards/requireRole';

/** Personal browser-push status. This identity-self door never resolves a clinic or patient. */
export async function GET() {
  const gate = await requireAccountWebPushSelfApiSession();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const publicKey = await deps.systemSettings.getWebPushVapidPublicKeyOnly();
  const hasSubscription = await deps.webPushSubscriptions.hasAnyForUserId(uid);
  const channelPrefs = await deps.channelPreferencesPort.getPreferences(uid);
  const globalWebPushEnabled =
    channelPrefs.find((preference) => preference.channelCode === 'web_push')
      ?.isEnabledForNotifications !== false;

  return NextResponse.json({
    ok: true,
    vapidConfigured: Boolean(publicKey),
    publicKey,
    hasSubscription,
    globalWebPushEnabled,
  });
}

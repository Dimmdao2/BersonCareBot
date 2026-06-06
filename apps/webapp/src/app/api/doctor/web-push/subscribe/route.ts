import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/infra/logging/logger";
import { enableStaffWebPushNotificationDefaults } from "@/modules/doctor-notifications/enableStaffWebPushNotificationDefaults";
import { hashWebPushEndpoint } from "@/modules/patient-notifications/hashWebPushEndpoint";

const platformSchema = z.enum(["pwa", "browser", "ios-pwa", "android-pwa"]);

const bodySchema = z.object({
  endpoint: z.string().min(10),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  platform: platformSchema.optional(),
});

/** POST /api/doctor/web-push/subscribe */
export async function POST(request: Request) {
  const gate = await requireDoctorApiSession();
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

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const uaHeader = request.headers.get("user-agent")?.trim() ?? "";
  const platform = parsed.data.platform;
  const ua =
    platform ?
      `[bc-push:${platform}]${uaHeader ? ` ${uaHeader}` : ""}`.trim()
    : uaHeader || null;

  await deps.webPushSubscriptions.saveSubscription(
    uid,
    {
      endpoint: parsed.data.endpoint,
      expirationTime: parsed.data.expirationTime ?? null,
      keys: parsed.data.keys,
    },
    { userAgent: ua },
  );

  const endpointHash = hashWebPushEndpoint(parsed.data.endpoint);
  logger.info(
    {
      event: "staff_web_push_subscription_registered",
      userId: uid,
      endpointHash,
      platform: platform ?? null,
    },
    "staff web push subscription registered",
  );

  const card = (await deps.channelPreferences.getChannelCards(uid, gate.session.user.bindings, {})).find(
    (c) => c.code === "web_push",
  );
  await deps.channelPreferences.updatePreference(uid, "web_push", {
    isEnabledForMessages: card?.isEnabledForMessages ?? false,
    isEnabledForNotifications: true,
  });

  const enabledTopics = await enableStaffWebPushNotificationDefaults({
    userId: uid,
    topicChannelPrefs: deps.topicChannelPrefs,
  });
  if (enabledTopics.length > 0) {
    logger.info(
      { event: "staff_web_push_defaults_enabled", userId: uid, enabledTopics },
      "staff web push defaults enabled for doctor notification topics",
    );
  }

  revalidatePath(routePaths.settings);
  revalidatePath(routePaths.doctorInstall);

  return NextResponse.json({ ok: true });
}

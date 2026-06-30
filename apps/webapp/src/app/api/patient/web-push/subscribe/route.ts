import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/infra/logging/logger";
import { enableWebPushNotificationDefaults } from "@/modules/patient-notifications/enableWebPushNotificationDefaults";
import { hashWebPushEndpoint } from "@/modules/patient-notifications/hashWebPushEndpoint";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { ensureWarmupsReminderOnFirstPwaPush } from "@/modules/reminders/ensureWarmupsReminderOnFirstPwaPush";

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

/** POST /api/patient/web-push/subscribe */
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

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const uaHeader = request.headers.get("user-agent")?.trim() ?? "";
  const platform = parsed.data.platform;
  const ua =
    platform ?
      `[bc-push:${platform}]${uaHeader ? ` ${uaHeader}` : ""}`.trim()
    : uaHeader || null;

  const hadExistingPushSubscription = await deps.webPushSubscriptions.hasAnyForUserId(uid);

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
      event: "web_push_subscription_registered",
      userId: uid,
      endpointHash,
      platform: platform ?? null,
    },
    "web push subscription registered",
  );

  const card = (await deps.channelPreferences.getChannelCards(uid, gate.session.user.bindings, {})).find(
    (c) => c.code === "web_push",
  );
  await deps.channelPreferences.updatePreference(uid, "web_push", {
    isEnabledForMessages: card?.isEnabledForMessages ?? true,
    isEnabledForNotifications: true,
  });

  const topicsSetting = await deps.systemSettings.getSetting("notifications_topics", "admin");
  const notificationTopics = parseNotificationsTopics(topicsSetting?.valueJson ?? null);
  const { enabledTopics } = await enableWebPushNotificationDefaults({
    userId: uid,
    topicChannelPrefs: deps.topicChannelPrefs,
    notificationTopics,
  });

  logger.info(
    {
      event: "web_push_defaults_enabled",
      userId: uid,
      enabledTopics,
    },
    "web push defaults enabled for notification topics",
  );

  const warmupsReminder = await ensureWarmupsReminderOnFirstPwaPush({
    userId: uid,
    platform,
    hadExistingPushSubscription,
    deps: {
      reminders: deps.reminders,
      contentSections: deps.contentSections,
    },
  });
  if (warmupsReminder.created) {
    logger.info(
      {
        event: "web_push_warmups_reminder_onboarding_created",
        userId: uid,
        ruleId: warmupsReminder.ruleId,
        platform: platform ?? null,
      },
      "warmups reminder created on first PWA push",
    );
  }

  revalidatePath(routePaths.notificationSettings);
  revalidatePath(routePaths.profile);
  revalidatePath(routePaths.patient);
  revalidatePath(routePaths.patientReminders);

  return NextResponse.json({ ok: true, enabledTopics, warmupsReminderOnboarding: warmupsReminder });
}

import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { buildProfileNotificationTopicModels } from "@/modules/patient-notifications/profileTopicChannelsModel";
import { AppShell } from "@/shared/ui/AppShell";
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { PatientNotificationChannelsStatus } from "./PatientNotificationChannelsStatus";
import { PatientNotificationsTopicsSection } from "./PatientNotificationsTopicsSection";

export default async function PatientNotificationsPage() {
  const session = await requirePatientAccessWithPhone(routePaths.notifications);
  const deps = buildAppDeps();
  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const emailVerified = Boolean(emailFields.emailVerifiedAt);
  const hasEmail = Boolean(emailFields.email?.trim());
  const telegramId = session.user.bindings.telegramId ?? "";
  const maxId = session.user.bindings.maxId ?? "";
  const hasTelegram = Boolean(telegramId.trim());
  const hasMax = Boolean(maxId.trim());
  const hasWebPush = await deps.webPushSubscriptions.hasAnyForUserId(session.user.userId);

  const notificationsTopicsSetting = await deps.systemSettings.getSetting("notifications_topics", "admin");
  const subscriptionTopics = parseNotificationsTopics(notificationsTopicsSetting?.valueJson ?? null);
  const prefRows = await deps.topicChannelPrefs.listByUserId(session.user.userId);
  const notificationModels = buildProfileNotificationTopicModels(subscriptionTopics, prefRows, {
    hasTelegram,
    hasMax,
    emailVerified,
    hasWebPush,
  });

  const hasMessengerOrEmail = hasTelegram || hasMax || (hasEmail && emailVerified);

  return (
    <AppShell title="Уведомления" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <div className={patientInnerPageStackClass}>
        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Каналы</h2>
          <PatientNotificationChannelsStatus
            hasTelegram={hasTelegram}
            hasMax={hasMax}
            hasEmail={hasEmail}
            emailVerified={emailVerified}
          />
          {!hasMessengerOrEmail ?
            <p className={`${patientMutedTextClass} mt-3`}>
              Подключите мессенджер или email в{" "}
              <Link href={routePaths.profile} className="underline">
                профиле
              </Link>
              .
            </p>
          : null}
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Типы уведомлений</h2>
          <PatientNotificationsTopicsSection
            initialTopics={notificationModels}
            hasMessengerOrEmail={hasMessengerOrEmail}
            initialHasWebPush={hasWebPush}
          />
        </section>
      </div>
    </AppShell>
  );
}

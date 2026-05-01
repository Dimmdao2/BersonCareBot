import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import { NotificationsGuestAccess } from "@/shared/ui/patient/guestAccess";
import { ChannelNotificationToggles } from "./ChannelNotificationToggles";
import { SubscriptionsList } from "./SubscriptionsList";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";

export default async function NotificationsPage() {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.notifications);
  if (dataGate === "guest") {
    return (
      <AppShell
        title="Подписки на уведомления"
        user={session?.user ?? null}
        backHref={routePaths.patient}
        backLabel="Меню"
        variant="patient"
      >
        <NotificationsGuestAccess session={session} />
      </AppShell>
    );
  }

  const s = session!;
  const deps = buildAppDeps();
  const notificationsTopicsSetting = await deps.systemSettings.getSetting("notifications_topics", "admin");
  const subscriptionTopics = parseNotificationsTopics(notificationsTopicsSetting?.valueJson ?? null);
  const supportContactHref = await getSupportContactUrl();
  const emailFields = await deps.userProjection.getProfileEmailFields(s.user.userId);
  const emailVerified = Boolean(emailFields.emailVerifiedAt);

  const channelCards = await deps.channelPreferences.getChannelCards(
    s.user.userId,
    s.user.bindings,
    {
      phone: s.user.phone,
      emailVerified,
    }
  );

  return (
    <AppShell
      title="Подписки на уведомления"
      user={s.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className="flex flex-col gap-8">
        <section className={patientSectionSurfaceClass}>
          <h2 className="text-base font-semibold">Каналы доставки</h2>
          <ChannelNotificationToggles cards={channelCards} />
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className="text-base font-semibold">Темы рассылок</h2>
          <SubscriptionsList subscriptions={subscriptionTopics} />
        </section>

        <ConnectMessengersBlock channelCards={channelCards} implementedOnly />

        <section className={patientSectionSurfaceClass}>
          <h2 className="text-base font-semibold">Email</h2>
          <EmailAccountPanel
            initialEmail={emailFields.email}
            emailVerified={emailVerified}
            supportContactHref={supportContactHref}
          />
        </section>
      </div>
    </AppShell>
  );
}

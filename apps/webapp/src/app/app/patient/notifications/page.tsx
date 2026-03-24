import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { hasMessengerBinding, requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import { InfoBlock } from "@/shared/ui/InfoBlock";
import { PatientBindPhoneSection } from "../PatientBindPhoneSection";
import { ChannelNotificationToggles } from "./ChannelNotificationToggles";
import { SubscriptionsList } from "./SubscriptionsList";

const SUBSCRIPTIONS = [
  { id: "exercise_reminders", title: "Напоминания об упражнениях" },
  { id: "symptom_reminders", title: "Напоминания о симптомах" },
  { id: "appointment_reminders", title: "Напоминания о записях" },
  { id: "news", title: "Новости и обновления" },
];

export default async function NotificationsPage() {
  const session = await requirePatientAccess(routePaths.notifications);
  const deps = buildAppDeps();
  const needsPhone = !session.user.phone?.trim() && !hasMessengerBinding(session);
  const phoneChannel = session.user.bindings.telegramId ? ("telegram" as const) : ("web" as const);
  const phoneChatId = session.user.bindings.telegramId ?? "";

  if (needsPhone) {
    return (
      <AppShell
        title="Подписки на уведомления"
        user={session.user}
        backHref={routePaths.patient}
        backLabel="Меню"
        variant="patient"
      >
        <InfoBlock className="mb-4">
          Для настройки уведомлений привяжите номер телефона или подключите мессенджер в профиле.
        </InfoBlock>
        <PatientBindPhoneSection
          phoneChannel={phoneChannel}
          phoneChatId={phoneChatId}
          nextPath={routePaths.notifications}
        />
      </AppShell>
    );
  }

  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const emailVerified = Boolean(emailFields.emailVerifiedAt);

  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
    {
      phone: session.user.phone,
      emailVerified,
    }
  );

  return (
    <AppShell
      title="Подписки на уведомления"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className="flex flex-col gap-8">
        <section className="panel stack">
          <h2 className="text-base font-semibold">Каналы доставки</h2>
          <ChannelNotificationToggles cards={channelCards} />
        </section>

        <section className="panel stack">
          <h2 className="text-base font-semibold">Темы рассылок</h2>
          <SubscriptionsList subscriptions={SUBSCRIPTIONS} />
        </section>

        <ConnectMessengersBlock channelCards={channelCards} implementedOnly />

        <section className="panel stack">
          <h2 className="text-base font-semibold">Email</h2>
          <EmailAccountPanel
            initialEmail={emailFields.email}
            emailVerified={emailVerified}
          />
        </section>
      </div>
    </AppShell>
  );
}

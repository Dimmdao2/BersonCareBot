import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
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
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
  );

  const linkedChannels = channelCards
    .filter((card) => card.isLinked && card.isImplemented)
    .map((card) => ({ code: card.code, title: card.title }));

  return (
    <AppShell
      title="Настройки уведомлений"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className="panel stack">
        <h2>Подписки</h2>
        {linkedChannels.length === 0 ? (
          <p className="empty-state">
            Для настройки уведомлений подключите хотя бы один канал в разделе «Мой профиль».
          </p>
        ) : (
          <SubscriptionsList subscriptions={SUBSCRIPTIONS} linkedChannels={linkedChannels} />
        )}
      </section>
    </AppShell>
  );
}

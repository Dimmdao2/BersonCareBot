import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function SettingsPage() {
  const session = await requireSession();
  const deps = buildAppDeps();
  const purchases = deps.purchases.getPurchaseSectionState();

  return (
    <AppShell title="Настройки" user={session.user}>
      <div className="feature-grid">
        <section className="panel stack">
          <h2>Профиль</h2>
          <p>Имя: {session.user.displayName}</p>
          <p>Роль: {session.user.role}</p>
          <p>Телефон: {session.user.phone ?? "не подтвержден"}</p>
        </section>
        <section className="panel stack">
          <h2>Подписки</h2>
          <p className="empty-state">Раздел оставлен под будущие тарифы и доступы.</p>
        </section>
        <section className="panel stack">
          <h2>{purchases.title}</h2>
          <p>{purchases.description}</p>
        </section>
        <section className="panel stack">
          <h2>Настройки уведомлений</h2>
          <p className="empty-state">В MVP настройки уведомлений готовятся как каркас под reminder bridge.</p>
        </section>
      </div>
    </AppShell>
  );
}

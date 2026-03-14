import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";
import { FeatureCard } from "@/shared/ui/FeatureCard";

const COMING_SOON_MESSAGE = "Скоро здесь будет много полезного";

export default async function AppEntryPage() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (session) {
    const menu = deps.menu.getMenuForRole(session.user.role);

    return (
      <AppShell title="Рабочее пространство" user={session.user}>
        <section className="hero-card stack">
          <p>
            Сессия активна. Пользователь уже определен по роли <strong>{session.user.role}</strong>.
          </p>
          <div className="feature-grid">
            {menu.map((item) => (
              <FeatureCard
                key={item.id}
                title={item.title}
                description={`Переход в раздел ${item.title.toLowerCase()}.`}
                href={item.href}
                status={item.status}
              />
            ))}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Вход в платформу" user={null}>
      <section className="hero-card stack">
        <p className="empty-state">{COMING_SOON_MESSAGE}</p>
      </section>
      <Suspense fallback={<p className="empty-state">Загрузка...</p>}>
        <AuthBootstrap />
      </Suspense>
    </AppShell>
  );
}

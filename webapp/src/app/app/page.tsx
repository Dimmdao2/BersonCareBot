import Link from "next/link";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";
import { FeatureCard } from "@/shared/ui/FeatureCard";

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
        <p>
          Web-App ожидает signed entry token от интегратора. Для локальной проверки можно использовать dev
          tokens: <code>dev:client</code>, <code>dev:doctor</code>, <code>dev:admin</code>.
        </p>
        <div className="feature-grid">
          <FeatureCard
            title="Войти как клиент"
            description="Открыть patient route в dev-режиме."
            href={`${routePaths.root}?token=dev:client`}
          />
          <FeatureCard
            title="Войти как врач"
            description="Проверить role-based доступ к doctor space."
            href={`${routePaths.root}?token=dev:doctor`}
          />
          <FeatureCard
            title="Войти как админ"
            description="Проверить доступ к настройкам и расширенным правам."
            href={`${routePaths.root}?token=dev:admin`}
          />
        </div>
        <p className="empty-state">
          Обычный рабочий поток: мессенджер открывает <code>/app?t=...</code>, затем frontend вызывает{" "}
          <code>/api/auth/exchange</code>.
        </p>
        <Suspense fallback={<p className="empty-state">Загрузка...</p>}>
          <AuthBootstrap />
        </Suspense>
        <DevBootstrap />
      </section>
    </AppShell>
  );
}

async function DevBootstrap() {
  return (
    <div className="panel stack">
      <h2>Быстрый запуск dev auth</h2>
      <p>Нажмите одну из ссылок выше или вызовите API вручную:</p>
      <pre className="code-block">
        {`curl -X POST http://127.0.0.1:5200/api/auth/exchange \\
  -H 'content-type: application/json' \\
  -d '{"token":"dev:client"}'`}
      </pre>
      <Link className="button" href={routePaths.patient}>
        Перейти в patient area после обмена токена
      </Link>
    </div>
  );
}

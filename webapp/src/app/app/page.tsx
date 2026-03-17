/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — показывает заголовок «Вход в платформу», текст «Скоро здесь будет много полезного» и блок
 * авторизации (AuthBootstrap). Отображается только неавторизованному пользователю.
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";

const COMING_SOON_MESSAGE = "Скоро здесь будет много полезного";

/** Определяет сессию и либо редиректит по роли, либо показывает экран входа с блоком авторизации. */
export default async function AppEntryPage() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (session) {
    const role = session.user.role;
    redirect(role === "admin" || role === "doctor" ? "/app/doctor" : "/app/patient");
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

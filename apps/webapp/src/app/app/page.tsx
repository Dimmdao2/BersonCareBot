/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — шапка как у пациента (PersonCare), плашечка с призывом зарегистрироваться и блок
 * авторизации (AuthBootstrap). В dev при ALLOW_DEV_AUTH_BYPASS=true — кнопки входа без Telegram.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";

type SearchParams = { next?: string };

/** Определяет сессию и либо редиректит по роли (или по ?next=), либо показывает экран входа. */
export default async function AppEntryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();
  const { next: nextParam } = await searchParams;

  if (session) {
    redirect(getPostAuthRedirectTarget(session.user.role, nextParam ?? null));
  }

  const allowDevBypass = env.ALLOW_DEV_AUTH_BYPASS === true && env.NODE_ENV !== "production";

  return (
    <AppShell title="Вход" user={null} variant="patient">
      <div className="stack">
        <div className="auth-plaque">
          <p className="auth-plaque__text">
            Для полноценной работы в приложении зарегистрируйтесь.
          </p>
        </div>
        {allowDevBypass && (
          <div className="stack" style={{ marginTop: "0.5rem" }}>
            <p className="eyebrow">Режим разработки</p>
            <p className="empty-state" style={{ fontSize: "0.9rem" }}>
              Войти в интерфейс без Telegram (только при ALLOW_DEV_AUTH_BYPASS=true):
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <Link href="/app?t=dev:client" className="button">
                Как пациент
              </Link>
              <Link href="/app?t=dev:admin" className="button">
                Как врач / админ
              </Link>
            </div>
          </div>
        )}
      </div>
      <Suspense fallback={<p className="empty-state">Загрузка...</p>}>
        <AuthBootstrap />
      </Suspense>
    </AppShell>
  );
}

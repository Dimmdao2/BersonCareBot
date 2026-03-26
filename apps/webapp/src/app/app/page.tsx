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
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
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
      <div id="app-entry-content" className="flex flex-col gap-4">
        <div
          id="app-entry-auth-plaque"
          className="rounded-2xl border border-border bg-muted/80 p-4 shadow-sm"
        >
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">
            Для полноценной работы в приложении зарегистрируйтесь.
          </p>
        </div>
        {allowDevBypass && (
          <div id="app-entry-dev-bypass-panel" className="mt-2 flex flex-col gap-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Режим разработки</p>
            <p className="text-sm text-muted-foreground">
              Войти в интерфейс без Telegram (только при ALLOW_DEV_AUTH_BYPASS=true):
            </p>
            <div id="app-entry-dev-bypass-actions" className="flex flex-wrap gap-3">
              <Link id="app-entry-dev-login-patient" href="/app?t=dev:client" className={cn(buttonVariants({ size: "sm" }))}>
                Как пациент
              </Link>
              <Link id="app-entry-dev-login-doctor" href="/app?t=dev:admin" className={cn(buttonVariants({ size: "sm" }))}>
                Как врач / админ
              </Link>
              <Link id="app-entry-dev-login-doctor-role" href="/app?t=dev:doctor" className={cn(buttonVariants({ size: "sm" }))}>
                Как специалист
              </Link>
            </div>
          </div>
        )}
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Загрузка...</p>}>
        <AuthBootstrap />
      </Suspense>
    </AppShell>
  );
}

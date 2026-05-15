"use client";

/**
 * Клиентская часть экрана `/app`: плашка «войдите или зарегистрируйтесь» (только на шаге телефона),
 * dev-bypass и Suspense с AuthBootstrap.
 */

import { Suspense, useCallback, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import type { MessengerSurfaceHint } from "@/shared/lib/platform";
import type { AuthFlowStep, PrefetchedPublicAuthConfig } from "@/shared/ui/auth/AuthFlowV2";
import type { UnauthenticatedAppEntryClassification } from "@/modules/auth/appEntryClassification";

/** Видна до первого события шага, на OAuth-first, landing Telegram и шаге телефона. */
export function shouldShowRegistrationPlaque(authStep: AuthFlowStep | null): boolean {
  return (
    authStep === null ||
    authStep === "entry_loading" ||
    authStep === "oauth_first" ||
    authStep === "landing" ||
    authStep === "phone"
  );
}

type AppEntryLoginContentProps = {
  allowDevBypass: boolean;
  supportContactHref: string;
  /** Серверный снимок публичных конфигов входа — без дублирующих fetch на клиенте. */
  prefetchedPublicAuth?: PrefetchedPublicAuthConfig | null;
  /** Cookie платформы `bot` после `?ctx=bot|max`: подавляет `auth/exchange` по `?t=` в пользу initData. */
  serverPlatformMessengerCookie?: boolean;
  /** Канал из middleware (`ctx=bot` → telegram, `ctx=max` → max); условная загрузка MAX bridge. */
  serverMessengerSurface?: MessengerSurfaceHint | null;
  /** Server-first классификация входа на `/app` (без сессии). */
  entryClassification: UnauthenticatedAppEntryClassification;
  /** Канон `/app/tg` или `/app/max`: не подменять miniapp полноценным веб-входом. */
  routeBoundMiniappEntry?: boolean;
};

export function AppEntryLoginContent({
  allowDevBypass,
  supportContactHref,
  prefetchedPublicAuth,
  serverPlatformMessengerCookie,
  serverMessengerSurface,
  entryClassification,
  routeBoundMiniappEntry = false,
}: AppEntryLoginContentProps) {
  const [authStep, setAuthStep] = useState<AuthFlowStep | null>(null);
  const onAuthStepChange = useCallback((step: AuthFlowStep) => {
    setAuthStep(step);
  }, []);

  return (
    <>
      <div id="app-entry-content" className="flex flex-col gap-6">
        {shouldShowRegistrationPlaque(authStep) ? (
          <div
            id="app-entry-auth-plaque"
            className="rounded-2xl border border-border bg-muted/80 p-4 shadow-sm"
          >
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
              Для полноценной работы в приложении войдите или зарегистрируйтесь.
            </p>
          </div>
        ) : null}
        {allowDevBypass ? (
          <div id="app-entry-dev-bypass-panel" className="mt-2 flex flex-col gap-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Режим разработки
            </p>
            <p className="text-sm text-muted-foreground">
              Войти в интерфейс без Telegram (только при ALLOW_DEV_AUTH_BYPASS=true):
            </p>
            <div id="app-entry-dev-bypass-actions" className="flex flex-wrap gap-3">
              <a
                id="app-entry-dev-login-patient"
                href="/api/auth/dev-bypass?token=dev%3Aclient"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Как пациент
              </a>
              <a
                id="app-entry-dev-login-doctor"
                href="/api/auth/dev-bypass?token=dev%3Aadmin"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Как врач / админ
              </a>
              <a
                id="app-entry-dev-login-doctor-role"
                href="/api/auth/dev-bypass?token=dev%3Adoctor"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Как специалист
              </a>
            </div>
          </div>
        ) : null}
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Загрузка...</p>}>
        <AuthBootstrap
          supportContactHref={supportContactHref}
          onAuthStepChange={onAuthStepChange}
          initialPublicAuthConfig={prefetchedPublicAuth ?? null}
          serverPlatformMessengerCookie={Boolean(serverPlatformMessengerCookie)}
          serverMessengerSurface={serverMessengerSurface ?? null}
          entryClassification={entryClassification}
          routeBoundMiniappEntry={routeBoundMiniappEntry}
        />
      </Suspense>
      <LegalFooterLinks className="mt-8" supportHref={supportContactHref} />
    </>
  );
}

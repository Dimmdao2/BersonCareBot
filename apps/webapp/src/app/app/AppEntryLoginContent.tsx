"use client";

/**
 * Клиентская часть экрана `/app`: dev-bypass и Suspense с AuthBootstrap.
 */

import { Suspense } from "react";
import { buttonVariants } from "@/shared/ui/patient/primitives/button-variants";
import { cn } from "@/lib/utils";
import { patientHeroBookingSectionClass, patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { AuthBootstrap } from "@/shared/ui/patient/AuthBootstrap";
import { LegalFooterLinks } from "@/shared/ui/patient/LegalFooterLinks";
import type { MessengerSurfaceHint } from "@/shared/lib/platform";
import type { PrefetchedPublicAuthConfig } from "@/shared/ui/patient/auth/AuthFlowV2";
import type { UnauthenticatedAppEntryClassification } from "@/modules/auth/appEntryClassification";

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
  return (
    <>
      <div id="app-entry-content" className="flex flex-col gap-6">
        {allowDevBypass ? (
          <div id="app-entry-dev-bypass-panel" className={cn(patientHeroBookingSectionClass, "mt-2 flex flex-col gap-4")}>
            <p className={cn(patientMutedTextClass, "text-xs font-normal uppercase tracking-wide")}>
              Режим разработки
            </p>
            <p className={patientMutedTextClass}>
              Войти в интерфейс без Telegram (только при ALLOW_DEV_AUTH_BYPASS=true). Открывайте dev по{" "}
              <strong className="font-medium text-foreground">127.0.0.1:5200</strong>, не{" "}
              <strong className="font-medium text-foreground">localhost</strong> — иначе выход не сбросит сессию.
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
      <Suspense fallback={<p className={patientMutedTextClass}>Загрузка...</p>}>
        <AuthBootstrap
          supportContactHref={supportContactHref}
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

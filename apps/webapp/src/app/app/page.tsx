/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — шапка как у пациента (PersonCare), плашечка с призывом и блок авторизации (AuthBootstrap).
 * В dev при ALLOW_DEV_AUTH_BYPASS=true — кнопки входа без Telegram.
 */

import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import {
  classifyUnauthenticatedAppEntry,
  isDevBypassToken,
  shouldAllowStandaloneTokenExchange,
} from "@/modules/auth/appEntryClassification";
import { buildPrefetchedPublicAuthConfig } from "@/modules/auth/publicAuthSnapshot";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { routePaths } from "@/app-layer/routes/paths";
import { getMessengerSurfaceHint, getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { AppShell } from "@/shared/ui/AppShell";
import { AppEntryLoginContent } from "./AppEntryLoginContent";

type SearchParams = { next?: string; t?: string; token?: string; switch?: string };

/** Определяет сессию и либо редиректит по роли (или по ?next=), либо показывает экран входа. */
export default async function AppEntryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();
  const { next: nextParam, t, token, switch: switchParam } = await searchParams;
  const rawToken = (t ?? token ?? null)?.trim() || null;

  if (session) {
    redirect(getPostAuthRedirectTarget(session.user.role, nextParam ?? null));
  }

  const allowDevBypass = env.ALLOW_DEV_AUTH_BYPASS === true && env.NODE_ENV !== "production";
  const allowStandaloneTokenExchange = shouldAllowStandaloneTokenExchange({
    token: rawToken,
    switchParam: switchParam ?? null,
  });
  if (allowDevBypass && allowStandaloneTokenExchange && rawToken && isDevBypassToken(rawToken)) {
    const params = new URLSearchParams({ token: rawToken });
    if (nextParam) params.set("next", nextParam);
    redirect(`/api/auth/dev-bypass?${params.toString()}`);
  }

  const [prefetchedPublicAuth, platformEntry, messengerSurface] = await Promise.all([
    buildPrefetchedPublicAuthConfig(),
    getPlatformEntry(),
    getMessengerSurfaceHint(),
  ]);
  const entryClassification = classifyUnauthenticatedAppEntry({
    platformEntry,
    messengerSurface,
    token: rawToken,
    allowStandaloneTokenExchange,
  });
  const serverPlatformMessengerCookie = platformEntry === "bot";

  return (
    <AppShell
      title="BersonCare"
      user={null}
      variant="patient"
      patientHideHome
      patientHideRightIcons
      patientBrandTitleBar
      patientHideBottomNav
    >
      <AppEntryLoginContent
        allowDevBypass={allowDevBypass}
        supportContactHref={routePaths.loginContactSupport}
        prefetchedPublicAuth={prefetchedPublicAuth}
        serverPlatformMessengerCookie={serverPlatformMessengerCookie}
        serverMessengerSurface={messengerSurface}
        entryClassification={entryClassification}
      />
    </AppShell>
  );
}

/**
 * Общий RSC для `/app`, `/app/tg`, `/app/max`: сессия, dev-bypass, классификация входа, shell + AuthBootstrap.
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
import type { MessengerSurfaceHint } from "@/shared/lib/platform";
import { AppShell } from "@/shared/ui/AppShell";
import { AppEntryLoginContent } from "./AppEntryLoginContent";

export type AppEntrySearchParams = { next?: string; t?: string; token?: string; switch?: string };

export async function AppEntryRsc({
  searchParams,
  routeBoundMessengerSurface,
}: {
  searchParams: Promise<AppEntrySearchParams>;
  routeBoundMessengerSurface: MessengerSurfaceHint | null;
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
    routeBoundMessengerSurface,
  });
  const serverPlatformMessengerCookie =
    routeBoundMessengerSurface != null ? true : platformEntry === "bot";
  const serverMessengerSurface =
    routeBoundMessengerSurface ?? (platformEntry === "bot" ? messengerSurface : null);

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
        serverMessengerSurface={serverMessengerSurface}
        entryClassification={entryClassification}
        routeBoundMiniappEntry={routeBoundMessengerSurface != null}
      />
    </AppShell>
  );
}

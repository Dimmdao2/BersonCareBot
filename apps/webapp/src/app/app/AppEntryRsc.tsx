/**
 * Общий RSC для `/app`, `/app/tg`, `/app/max`: сессия, dev-bypass, классификация входа, shell + AuthBootstrap.
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import {
  classifyUnauthenticatedAppEntry,
  isDevBypassToken,
  shouldAllowStandaloneTokenExchange,
} from '@/modules/auth/appEntryClassification';
import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';
import { isDevAuthBypassEnabled } from '@/modules/auth/devBypassPolicy';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { routePaths } from '@/app-layer/routes/paths';
import { getMessengerSurfaceHint, getPlatformEntry } from '@/shared/lib/platformCookie.server';
import type { MessengerSurfaceHint } from '@/shared/lib/platform';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { AppEntryLoginContent } from './AppEntryLoginContent';
import { PatientUnsupportedClientFallback } from './PatientUnsupportedClientFallback';
import { getUnsupportedClientFallbackEnabled } from '@/modules/auth/unsupportedClientFallback';
import { parseSupportedClientEnvironment } from '@/modules/auth/supportedClientMatrix';
import { roleCanUsePortal, type RoleLoginPortal } from '@/modules/auth/roleLogin';
import { buildOwnHubUrlWithAccessDeniedToast } from '@/shared/lib/appAccessDeniedToast';

export type AppEntrySearchParams = { next?: string; t?: string; token?: string; switch?: string };

export async function AppEntryRsc({
  searchParams,
  routeBoundMessengerSurface,
  roleLoginPortal = null,
}: {
  searchParams: Promise<AppEntrySearchParams>;
  routeBoundMessengerSurface: MessengerSurfaceHint | null;
  roleLoginPortal?: RoleLoginPortal | null;
}) {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();
  const { next: nextParam, t, token, switch: switchParam } = await searchParams;
  const rawToken = (t ?? token ?? null)?.trim() || null;

  if (session) {
    redirect(
      roleLoginPortal && !roleCanUsePortal(session.user.role, roleLoginPortal)
        ? buildOwnHubUrlWithAccessDeniedToast(session.user.role)
        : getPostAuthRedirectTarget(session.user.role, nextParam ?? null, null, roleLoginPortal),
    );
  }

  const allowDevBypass = isDevAuthBypassEnabled({
    nodeEnv: env.NODE_ENV,
    allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
  });
  const allowStandaloneTokenExchange = shouldAllowStandaloneTokenExchange({
    token: rawToken,
    switchParam: switchParam ?? null,
  });
  if (allowDevBypass && allowStandaloneTokenExchange && rawToken && isDevBypassToken(rawToken)) {
    const params = new URLSearchParams({ token: rawToken });
    if (nextParam) params.set('next', nextParam);
    redirect(`/api/auth/dev-bypass?${params.toString()}`);
  }

  const [prefetchedPublicAuth, platformEntry, messengerSurface, unsupportedClientFallbackEnabled] =
    await Promise.all([
      buildPrefetchedPublicAuthConfig(),
      getPlatformEntry(),
      getMessengerSurfaceHint(),
      getUnsupportedClientFallbackEnabled(),
    ]);
  const entryClassification = classifyUnauthenticatedAppEntry({
    platformEntry,
    messengerSurface,
    token: rawToken,
    allowStandaloneTokenExchange,
    routeBoundMessengerSurface,
  });
  const serverPlatformMessengerCookie =
    routeBoundMessengerSurface != null ? true : platformEntry === 'bot';
  const serverMessengerSurface =
    routeBoundMessengerSurface ?? (platformEntry === 'bot' ? messengerSurface : null);
  const clientEnvironment = unsupportedClientFallbackEnabled
    ? parseSupportedClientEnvironment((await headers()).get('user-agent') ?? '')
    : null;
  const watchdogEntrySurface =
    routeBoundMessengerSurface === 'telegram' || entryClassification === 'telegram_miniapp'
      ? 'tg'
      : routeBoundMessengerSurface === 'max' || entryClassification === 'max_miniapp'
        ? 'max'
        : 'browser';

  return (
    <PatientAppShell
      title="BersonCare"
      user={null}
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
        roleLoginPortal={roleLoginPortal}
      />
      {clientEnvironment ? (
        <PatientUnsupportedClientFallback
          client={clientEnvironment}
          entrySurface={watchdogEntrySurface}
          supportContactHref={routePaths.loginContactSupport}
        />
      ) : null}
    </PatientAppShell>
  );
}

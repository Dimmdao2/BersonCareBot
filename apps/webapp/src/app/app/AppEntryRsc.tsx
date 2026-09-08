/**
 * Общий RSC для `/app`, `/app/tg`, `/app/max`: сессия, классификация входа, shell + AuthBootstrap.
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  classifyUnauthenticatedAppEntry,
  shouldAllowStandaloneTokenExchange,
} from '@/modules/auth/appEntryClassification';
import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { routePaths } from '@/app-layer/routes/paths';
import { getMessengerSurfaceHint, getPlatformEntry } from '@/shared/lib/platformCookie.server';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  surfaceDisplayName,
} from '@/shared/lib/surface/requestSurface';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import type { MessengerSurfaceHint } from '@/shared/lib/platform';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { AppEntryLoginContent } from './AppEntryLoginContent';
import { PatientUnsupportedClientFallback } from './PatientUnsupportedClientFallback';
import { getUnsupportedClientFallbackEnabled } from '@/modules/auth/unsupportedClientFallback';
import { parseSupportedClientEnvironment } from '@/modules/auth/supportedClientMatrix';
import { authPolicyNameForRoleLoginPortal, type RoleLoginPortal } from '@/modules/auth/roleLogin';
import { TherapyGoLoginShell } from '@/shared/ui/patient/auth/TherapyGoLoginShell';

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
      getPostAuthRedirectTarget(session.user.role, nextParam ?? null, null, roleLoginPortal, {
        showAccessDeniedToast: false,
      }),
    );
  }

  const allowStandaloneTokenExchange = shouldAllowStandaloneTokenExchange({
    token: rawToken,
    switchParam: switchParam ?? null,
  });
  const resolvedSurface = await getResolvedSurface();
  const therapyGoBrowserEntry =
    resolvedSurface.surface === 'patient_default' && routeBoundMessengerSurface === null;
  const effectiveRoleLoginPortal = roleLoginPortal ?? (therapyGoBrowserEntry ? 'patient' : null);
  const roleLoginAuthPolicyName = effectiveRoleLoginPortal
    ? authPolicyNameForRoleLoginPortal(effectiveRoleLoginPortal)
    : undefined;
  const [prefetchedPublicAuth, platformEntry, messengerSurface, unsupportedClientFallbackEnabled] =
    await Promise.all([
      buildPrefetchedPublicAuthConfig(roleLoginAuthPolicyName),
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
  const shellTitle = surfaceDisplayName(resolvedSurface);
  const alternateRoleLoginHref =
    effectiveRoleLoginPortal === 'doctor'
      ? new URL('/app/patient/login', PATIENT_DEFAULT_SURFACE.origin).toString()
      : effectiveRoleLoginPortal === 'patient'
        ? new URL('/app/doctor/login', STAFF_SURFACE.origin).toString()
        : null;
  // A role-login door (`/app/{doctor,patient,admin}/login`) knows its own audience from the route,
  // which stays correct under the transitional single-Host DEV/TEST deployment where Host-based
  // surface resolution collapses staff and patient to `staff` (see `authPolicyNameForRoleLoginPortal`
  // doc comment). The generic `/app` entry has no portal yet, so it keeps the Host-resolved policy.
  const surfaceAuthPolicy = roleLoginAuthPolicyName
    ? DEFAULT_SURFACE_AUTH_POLICY_CONFIG[roleLoginAuthPolicyName]
    : resolvedSurface.authPolicy;

  const loginContent = (
    <AppEntryLoginContent
      supportContactHref={routePaths.loginContactSupport}
      prefetchedPublicAuth={prefetchedPublicAuth}
      serverPlatformMessengerCookie={serverPlatformMessengerCookie}
      serverMessengerSurface={serverMessengerSurface}
      entryClassification={entryClassification}
      routeBoundMiniappEntry={routeBoundMessengerSurface != null}
      roleLoginPortal={effectiveRoleLoginPortal}
      roleLoginSurfaceName={shellTitle}
      alternateRoleLoginHref={alternateRoleLoginHref}
      surfaceAuthPolicy={surfaceAuthPolicy}
      embeddedInSurfaceShell={therapyGoBrowserEntry}
    />
  );
  const unsupportedClientFallback = clientEnvironment ? (
    <PatientUnsupportedClientFallback
      client={clientEnvironment}
      entrySurface={watchdogEntrySurface}
      failureTimeoutEnabled={env.NODE_ENV === 'production'}
      supportContactHref={routePaths.loginContactSupport}
    />
  ) : null;

  if (therapyGoBrowserEntry) {
    return (
      <>
        <TherapyGoLoginShell
          supportContactHref={routePaths.loginContactSupport}
          installHref={routePaths.patientInstall}
        >
          {loginContent}
        </TherapyGoLoginShell>
        {unsupportedClientFallback}
      </>
    );
  }

  return (
    <PatientAppShell
      title={shellTitle}
      user={null}
      patientHideHome
      patientHideRightIcons
      patientBrandTitleBar
      patientHideBottomNav
    >
      {loginContent}
      {unsupportedClientFallback}
    </PatientAppShell>
  );
}

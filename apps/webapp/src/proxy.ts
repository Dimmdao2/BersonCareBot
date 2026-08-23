import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BC_CORRELATION_ID_HEADER, resolveCorrelationId } from '@bersoncare/db-principal';
import { applySessionRenewalToResponse } from '@/modules/auth/sessionCookie';
import { decodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import {
  getRoleLoginPath,
  isDoctorPortalPlatformOperationsPath,
  isRoleLoginPath,
  portalForAppPath,
  roleCanUsePortal,
} from '@/modules/auth/roleLogin';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';
import { buildOwnHubUrlWithAccessDeniedToast } from '@/shared/lib/appAccessDeniedToast';
import { doctorRouteRedirectResponse } from '@/middleware/doctorRouteRedirects';
import {
  applyMessengerEntryPathCookies,
  handlePlatformContextRequest,
} from '@/middleware/platformContext';
import { decideCsrfOrigin } from '@/middleware/csrfOrigin';
import { canSurfaceEnterRoute } from '@/config/surfaceRoutes';
import {
  arePlatformSurfaceHostsDistinct,
  RESOLVED_SURFACE_HEADER,
  resolveRequestSurface,
  serializeResolvedSurface,
  type TenantSurfaceLookup,
} from '@/shared/lib/surface/requestSurface';

const NO_TENANT_SURFACE: TenantSurfaceLookup = async () => ({ status: 'unknown' });

export async function proxy(
  request: NextRequest,
  nextContextOrTenantLookup?: unknown,
) {
  // Next supplies a NextFetchEvent as argument two. Tests and the B1 composition seam may instead
  // inject the Host lookup function without making this resolver depend on its persistence module.
  const resolveTenantSurface =
    typeof nextContextOrTenantLookup === 'function'
      ? (nextContextOrTenantLookup as TenantSurfaceLookup)
      : NO_TENANT_SURFACE;
  // Only UUID-shaped values cross the trust boundary. Free-form/oversized caller text is replaced,
  // so it can never become a log field or an internal header value.
  const correlationId = resolveCorrelationId(
    request.headers.get(BC_CORRELATION_ID_HEADER) ??
      request.headers.get('x-bc-auth-correlation-id'),
  );
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const resolvedSurface = await resolveRequestSurface({
    host: request.headers.get('host'),
    protocol: forwardedProtocol || request.nextUrl.protocol,
    resolveTenantSurface,
  });
  if (
    !resolvedSurface ||
    (arePlatformSurfaceHostsDistinct() &&
      !canSurfaceEnterRoute(resolvedSurface.surface, request.nextUrl.pathname))
  ) {
    const response = new NextResponse(null, { status: 404 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }
  const csrfDecision = decideCsrfOrigin({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get('host'),
    requestUrlProtocol: request.nextUrl.protocol,
    forwardedProto: request.headers.get('x-forwarded-proto'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
  });
  if (csrfDecision.action === 'reject') {
    const response = NextResponse.json(
      { ok: false, error: 'csrf_origin_forbidden' },
      { status: 403 },
    );
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }
  const doctorResponse = doctorRouteRedirectResponse(request);
  if (doctorResponse) {
    // 308-редиректы отдаём как есть: браузер сразу делает новый запрос,
    // который пройдёт через proxy снова и получит session renewal.
    if (doctorResponse.status === 308) {
      doctorResponse.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
      return doctorResponse;
    }
    // Rewrite-ответы — это полноценный page render; применяем cookies и session renewal.
    applyMessengerEntryPathCookies(request, doctorResponse);
    const response = applySessionRenewalToResponse(request, doctorResponse);
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }

  const ctxResponse = handlePlatformContextRequest(request);
  if (ctxResponse.headers.has('location')) {
    const response = applySessionRenewalToResponse(request, ctxResponse);
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const portal = portalForAppPath(pathname);
  if (portal && !isRoleLoginPath(pathname)) {
    const session = decodeSessionCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '');
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = getRoleLoginPath(portal);
      loginUrl.search = '';
      loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(loginUrl);
      response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
      return response;
    }
    // A platform operator (role==='admin') can never hold the literal 'doctor' role
    // roleCanUsePortal requires, but a fixed handful of platform-only pages still live under
    // the doctor portal's URL prefix pending their move to /app/admin/* — see
    // isDoctorPortalPlatformOperationsPath. Every other /app/doctor/* path stays doctor-only.
    const canUsePortal =
      roleCanUsePortal(session.user.role, portal) ||
      (portal === 'doctor' &&
        isDoctorPortalPlatformOperationsPath(pathname) &&
        hasLaunchCapability(
          resolveLaunchCapabilities({
            sessionRole: session.user.role,
          }),
          'platform.operations',
        ));
    if (!canUsePortal) {
      const redirectUrl = request.nextUrl.clone();
      const ownHub = new URL(buildOwnHubUrlWithAccessDeniedToast(session.user.role), request.url);
      redirectUrl.pathname = ownHub.pathname;
      redirectUrl.search = ownHub.search;
      const response = NextResponse.redirect(redirectUrl);
      response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
      return response;
    }
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(BC_CORRELATION_ID_HEADER, correlationId);
  // Incoming internal context is never trusted. Every downstream consumer reads this exact value;
  // none of them re-resolves Host/path or falls back to a platform surface (TPB-16).
  requestHeaders.delete(RESOLVED_SURFACE_HEADER);
  requestHeaders.set(RESOLVED_SURFACE_HEADER, serializeResolvedSurface(resolvedSurface));
  // These remain routing-security inputs for the patient layout/server-action gates. They no
  // longer resolve product surface, but must still overwrite caller values with the real URL.
  requestHeaders.set('x-bc-pathname', pathname);
  requestHeaders.set('x-bc-search', request.nextUrl.search);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applyMessengerEntryPathCookies(request, response);
  const renewed = applySessionRenewalToResponse(request, response);
  renewed.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
  return renewed;
}

/**
 * The literal matcher makes proxy the actual dynamic-request choke point. It includes public
 * patient routes, API and manifests while leaving Next internals and immutable image/font assets
 * on the static fast path.
 *
 * Почему литерал, а не импортированная константа: Next читает `config` статическим разбором
 * исходника. Замерено на этой сборке — вынос списка даже в константу ЭТОГО файла роняет
 * `next build`: «Next.js can't recognize the exported `config` field in route. `matcher` needs to be
 * a static string or array of static strings or array of static objects». То есть значение обязано
 * быть литералом здесь.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BC_CORRELATION_ID_HEADER, resolveCorrelationId } from '@bersoncare/db-principal';
import { applySessionRenewalToResponse } from '@/modules/auth/sessionCookie';
import { decodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import {
  getRoleLoginPath,
  getRolePortalPath,
  isDoctorPortalPlatformOperationsPath,
  isRoleLoginPath,
  portalForAppPath,
  roleCanUsePortal,
} from '@/modules/auth/roleLogin';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';
import {
  buildOwnHubUrlWithAccessDeniedToast,
  getOwnHubPathForRole,
} from '@/shared/lib/appAccessDeniedToast';
import { doctorRouteRedirectResponse } from '@/middleware/doctorRouteRedirects';
import {
  applyMessengerEntryPathCookies,
  handlePlatformContextRequest,
} from '@/middleware/platformContext';
import { decideCsrfOrigin } from '@/middleware/csrfOrigin';
import { canSurfaceEnterRoute, patientTreeRewritePath } from '@/config/surfaceRoutes';
import {
  arePlatformSurfaceHostsDistinct,
  RESOLVED_SURFACE_HEADER,
  resolveRequestSurface,
  serializeResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { productionTenantSurfaceLookup } from '@/app-layer/surface/productionTenantSurfaceLookup';
import { CUSTOM_DOMAIN_ROUTING_PROBE_PATH } from '@/modules/domain-health/domainCertificateProbe';

function rebaseRedirectToPublicOrigin(response: NextResponse, publicOrigin: string): void {
  const location = response.headers.get('location');
  if (!location) return;
  const target = new URL(location, publicOrigin);
  response.headers.set(
    'location',
    new URL(`${target.pathname}${target.search}${target.hash}`, publicOrigin).toString(),
  );
}

function internalRewriteTarget(request: NextRequest, pathname: string): URL {
  const target = request.nextUrl.clone();
  target.pathname = pathname;

  // Next relativizes middleware rewrites only when their origin exactly matches its own init URL.
  // Every supported webapp runtime binds Next to 127.0.0.1. The URL presented to the proxy can
  // contain either the public Host or Next's `localhost` alias, so an internal rewrite must not
  // derive its origin from that URL. Keeping the reconstructed scheme and listener port while
  // canonicalizing the hostname makes Next relativize the route instead of proxying to itself.
  target.hostname = '127.0.0.1';

  return target;
}

export async function proxy(
  request: NextRequest,
  // Next always supplies a `NextFetchEvent` here in production. It is deliberately typed `unknown`
  // and never inspected: before this reopening (#787), a `typeof === 'function'` check on this
  // argument let a test-only tenant-lookup seam substitute for the real production resolver — the
  // production request path is required to resolve Host through `productionTenantSurfaceLookup`
  // unconditionally, so this argument can never again become a dependency-injection seam.
  _nextFetchEvent?: unknown,
) {
  const resolveTenantSurface = productionTenantSurfaceLookup;
  // Only UUID-shaped values cross the trust boundary. Free-form/oversized caller text is replaced,
  // so it can never become a log field or an internal header value.
  const correlationId = resolveCorrelationId(
    request.headers.get(BC_CORRELATION_ID_HEADER) ??
      request.headers.get('x-bc-auth-correlation-id'),
  );
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const pathname = request.nextUrl.pathname;
  const resolvedSurface = await resolveRequestSurface({
    host: request.headers.get('host'),
    protocol: forwardedProtocol || request.nextUrl.protocol,
    resolveTenantSurface,
    ...(pathname === CUSTOM_DOMAIN_ROUTING_PROBE_PATH
      ? { tenantLookupPurpose: 'preactivation_probe' as const }
      : {}),
  });
  if (resolvedSurface?.customDomainProbeOnly) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }
  const surfaceHostsAreDistinct = arePlatformSurfaceHostsDistinct();
  const patientRewritePath =
    resolvedSurface && surfaceHostsAreDistinct
      ? patientTreeRewritePath(resolvedSurface, pathname)
      : null;
  const routedPathname = patientRewritePath ?? pathname;
  if (
    !resolvedSurface ||
    (surfaceHostsAreDistinct && !canSurfaceEnterRoute(resolvedSurface.surface, routedPathname))
  ) {
    const response = new NextResponse(null, { status: 404 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }
  // B2/B8: once a custom domain is ACTIVE, the technical `<slug>.therapygo.ru` subdomain becomes a
  // 308 to it, preserving path and query — before CSRF/auth/session work, which belongs to the
  // final hostname, not this one. `resolvedSurface.redirectToHostname` is already `undefined` when
  // the request arrived on that hostname itself (`resolveRequestSurface`'s own comparison), so an
  // active custom domain never redirects to itself.
  if (resolvedSurface.redirectToHostname) {
    const target = request.nextUrl.clone();
    target.host = resolvedSurface.redirectToHostname;
    const response = NextResponse.redirect(target, 308);
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
    rebaseRedirectToPublicOrigin(doctorResponse, resolvedSurface.publicOrigin);
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
    rebaseRedirectToPublicOrigin(ctxResponse, resolvedSurface.publicOrigin);
    const response = applySessionRenewalToResponse(request, ctxResponse);
    response.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
    return response;
  }

  const portal = portalForAppPath(pathname);
  if (portal && !isRoleLoginPath(pathname)) {
    const session = decodeSessionCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '');
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = getRoleLoginPath(portal);
      loginUrl.search = '';
      loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(loginUrl);
      rebaseRedirectToPublicOrigin(response, resolvedSurface.publicOrigin);
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
      // An exact portal root is also a PWA launch target. An already authenticated user can open
      // an older installed app whose start_url belongs to another role; returning them to their
      // own hub is normal launch recovery, not a denied deep-link attempt.
      const ownHubPath =
        pathname === getRolePortalPath(portal)
          ? getOwnHubPathForRole(session.user.role)
          : buildOwnHubUrlWithAccessDeniedToast(session.user.role);
      const ownHub = new URL(ownHubPath, request.url);
      redirectUrl.pathname = ownHub.pathname;
      redirectUrl.search = ownHub.search;
      const response = NextResponse.redirect(redirectUrl);
      rebaseRedirectToPublicOrigin(response, resolvedSurface.publicOrigin);
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
  const response = patientRewritePath
    ? NextResponse.rewrite(
        internalRewriteTarget(request, patientRewritePath),
        { request: { headers: requestHeaders } },
      )
    : NextResponse.next({
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

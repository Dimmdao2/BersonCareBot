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
import { SURFACE_PATHNAME_HEADER, SURFACE_SEARCH_HEADER } from '@/config/surfaceRoutes';

export function proxy(request: NextRequest) {
  // Only UUID-shaped values cross the trust boundary. Free-form/oversized caller text is replaced,
  // so it can never become a log field or an internal header value.
  const correlationId = resolveCorrelationId(
    request.headers.get(BC_CORRELATION_ID_HEADER) ??
      request.headers.get('x-bc-auth-correlation-id'),
  );
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
  // Путь запроса — единственный вход `resolveRequestSurface` (TPB-08): Next не даёт layout'у
  // pathname, поэтому идентичность поверхности вычислить без этого проброса негде. Раньше заголовок
  // ставился только для `/app/patient` (patient-layout policy); теперь — для всего matcher'а, иначе
  // staff-маршрут снова молча получит пациентскую идентичность корня.
  requestHeaders.set(SURFACE_PATHNAME_HEADER, pathname);
  requestHeaders.set(SURFACE_SEARCH_HEADER, request.nextUrl.search);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applyMessengerEntryPathCookies(request, response);
  const renewed = applySessionRenewalToResponse(request, response);
  renewed.headers.set(BC_CORRELATION_ID_HEADER, correlationId);
  return renewed;
}

export const config = {
  // `/` добавлен вместе с проброской пути поверхности: лендинг — staff-маркетинг («Therapysto —
  // кабинет специалиста»), и без него он остаётся единственным staff-маршрутом, до которого
  // резолвер не дотягивается. Порядок обработки для `/` тот же, что для `/app`: portalForAppPath
  // здесь null, поэтому сессионная логика не срабатывает.
  matcher: ['/', '/app', '/app/:path*', '/api/:path*'],
};

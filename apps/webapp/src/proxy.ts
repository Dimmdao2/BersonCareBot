import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applySessionRenewalToResponse } from "@/modules/auth/sessionCookie";
import { doctorRouteRedirectResponse } from "@/middleware/doctorRouteRedirects";
import {
  applyMessengerEntryPathCookies,
  handlePlatformContextRequest,
} from "@/middleware/platformContext";

export function proxy(request: NextRequest) {
  const doctorResponse = doctorRouteRedirectResponse(request);
  if (doctorResponse) {
    // 308-редиректы отдаём как есть: браузер сразу делает новый запрос,
    // который пройдёт через proxy снова и получит session renewal.
    if (doctorResponse.status === 308) return doctorResponse;
    // Rewrite-ответы — это полноценный page render; применяем cookies и session renewal.
    applyMessengerEntryPathCookies(request, doctorResponse);
    return applySessionRenewalToResponse(request, doctorResponse);
  }

  const ctxResponse = handlePlatformContextRequest(request);
  if (ctxResponse.headers.has("location")) {
    return applySessionRenewalToResponse(request, ctxResponse);
  }

  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  if (pathname.startsWith("/app/patient")) {
    requestHeaders.set("x-bc-pathname", pathname);
    requestHeaders.set("x-bc-search", request.nextUrl.search);
  }
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applyMessengerEntryPathCookies(request, response);
  return applySessionRenewalToResponse(request, response);
}

export const config = {
  matcher: ["/app", "/app/:path*", "/api/me", "/api/patient/:path*"],
};

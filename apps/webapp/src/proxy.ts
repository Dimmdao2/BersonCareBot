import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applySessionRenewalToResponse } from "@/modules/auth/sessionCookie";
import {
  applyMessengerEntryPathCookies,
  handlePlatformContextRequest,
} from "@/middleware/platformContext";

export function proxy(request: NextRequest) {
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

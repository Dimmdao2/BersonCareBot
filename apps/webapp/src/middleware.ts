import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  buildRenewedSessionCookieOptions,
  decodeSessionCookie,
  encodeSessionCookie,
  renewSessionIfActive,
  shouldRenewSession,
} from "@/modules/auth/sessionCookie";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return response;

  const session = decodeSessionCookie(raw);
  if (!session || !shouldRenewSession(session)) return response;

  const renewed = renewSessionIfActive(session);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    encodeSessionCookie(renewed),
    buildRenewedSessionCookieOptions(renewed),
  );
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/api/patient/:path*", "/api/me"],
};

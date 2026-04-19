import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { classifyEntryHintFromRequest, handlePlatformContextRequest } from "@/middleware/platformContext";

export function middleware(request: NextRequest) {
  const ctxResponse = handlePlatformContextRequest(request);
  if (ctxResponse.headers.has("location")) {
    return ctxResponse;
  }

  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bc-entry-hint", classifyEntryHintFromRequest(request));
  if (pathname.startsWith("/app/patient")) {
    requestHeaders.set("x-bc-pathname", pathname);
    requestHeaders.set("x-bc-search", request.nextUrl.search);
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};

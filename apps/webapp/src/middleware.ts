import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handlePlatformContextRequest } from "@/middleware/platformContext";

export function middleware(request: NextRequest) {
  /** Диагностическая страница печатает сырой initData в DOM — только вне production. */
  if (request.nextUrl.pathname === "/max-debug" && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const ctxResponse = handlePlatformContextRequest(request);
  if (ctxResponse.headers.has("location")) {
    return ctxResponse;
  }

  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/app/patient")) {
    return ctxResponse;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bc-pathname", pathname);
  requestHeaders.set("x-bc-search", request.nextUrl.search);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/app", "/app/:path*", "/max-debug"],
};

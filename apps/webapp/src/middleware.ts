import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname, search } = request.nextUrl;

  // /app/doctor/online-intake/:requestId → /app/doctor/communications?tab=intake&id=:requestId
  const intakeDetail = pathname.match(/^\/app\/doctor\/online-intake\/([^/]+)$/);
  if (intakeDetail) {
    const id = intakeDetail[1];
    const url = request.nextUrl.clone();
    url.pathname = "/app/doctor/communications";
    url.search = "";
    url.searchParams.set("tab", "intake");
    if (id) url.searchParams.set("id", id);
    return NextResponse.redirect(url, 308);
  }

  const redirects: Record<string, string> = {
    "/app/doctor/messages": "/app/doctor/communications?tab=chats",
    "/app/doctor/online-intake": "/app/doctor/communications?tab=intake",
    "/app/doctor/broadcasts/archive": "/app/doctor/communications?tab=broadcasts&archive=1",
    "/app/doctor/broadcasts": "/app/doctor/communications?tab=broadcasts",
    "/app/doctor/appointments": "/app/doctor/schedule?tab=calendar",
    "/app/doctor/calendar": "/app/doctor/schedule?tab=calendar",
    "/app/doctor/admin/booking": "/app/doctor/schedule?tab=setup",
  };

  const target = redirects[pathname];
  if (target) {
    const url = request.nextUrl.clone();
    const [targetPath, targetQuery] = target.split("?");
    url.pathname = targetPath!;
    url.search = targetQuery ? `?${targetQuery}` : "";
    return NextResponse.redirect(url, 308);
  }

  return undefined;
}

export const config = {
  matcher: ["/app/doctor/:path*"],
};

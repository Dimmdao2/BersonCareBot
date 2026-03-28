import type { NextRequest } from "next/server";
import { handlePlatformContextRequest } from "@/middleware/platformContext";

export function middleware(request: NextRequest) {
  return handlePlatformContextRequest(request);
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};

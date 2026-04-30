import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";

const DEV_BYPASS_TOKENS = new Set(["dev:client", "dev:doctor", "dev:admin"]);

function getRequestOrigin(request: Request, requestUrl: URL): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}

function redirectToPath(path: string, origin: string): NextResponse {
  return NextResponse.redirect(new URL(path, origin), { status: 303 });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request, requestUrl);

  if (env.NODE_ENV === "production" || env.ALLOW_DEV_AUTH_BYPASS !== true) {
    return redirectToPath("/app", origin);
  }

  const token = requestUrl.searchParams.get("token")?.trim() ?? "";
  if (!DEV_BYPASS_TOKENS.has(token)) {
    return redirectToPath("/app", origin);
  }

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeIntegratorToken(token);
  if (!result) {
    return redirectToPath("/app", origin);
  }

  const target = getPostAuthRedirectTarget(
    result.session.user.role,
    requestUrl.searchParams.get("next"),
    result.redirectTo,
  );
  return redirectToPath(target, origin);
}

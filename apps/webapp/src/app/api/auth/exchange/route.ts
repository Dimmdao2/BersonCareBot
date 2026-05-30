import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import {
  entryChannelFromMessengerBindings,
  recordAuthLogin,
} from "@/app-layer/product-analytics/recordAuthLogin";
import { logAuthRouteTiming } from "@/modules/auth/authRouteObservability";
import { logger } from "@/app-layer/logging/logger";
import { getConfigBool } from "@/modules/system-settings/configAdapter";
import { PLATFORM_COOKIE_MAX_AGE, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const ROUTE = "auth/exchange";

const bodySchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    await recordAuthRegistrationFailure({
      attemptId: newRegistrationAttemptId(),
      authMethod: "integrator_exchange",
      stage: "start",
      entryChannel: "browser",
      contactType: "oauth_provider",
      contactValue: "integrator",
      errorCode: "invalid_body",
    });
    const res = NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 400,
      outcome: "invalid_body",
      errorType: "validation",
    });
    return res;
  }
  const { token } = parsed.data;
  const attemptId = newRegistrationAttemptId();
  await recordAuthRegistrationAttempt({
    attemptId,
    authMethod: "integrator_exchange",
    stage: "start",
    entryChannel: "browser",
    contactType: "oauth_provider",
    contactValue: "integrator",
  });

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeIntegratorToken(token);
  if (!result) {
    await recordAuthRegistrationFailure({
      attemptId,
      authMethod: "integrator_exchange",
      stage: "session_set",
      entryChannel: "browser",
      contactType: "oauth_provider",
      contactValue: "integrator",
      errorCode: "access_denied",
    });
    logger.warn({ route: ROUTE, outcome: "access_denied" }, "auth/exchange access_denied");
    const res = NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 403,
      outcome: "access_denied",
      errorType: "denied",
    });
    return res;
  }

  const source = result.session.user.bindings?.maxId
    ? "max"
    : result.session.user.bindings?.telegramId
      ? "telegram"
      : "web";
  if (process.env.NODE_ENV !== "test" && (await getConfigBool("debug_forward_to_admin", false))) {
    logger.info(
      { route: ROUTE, outcome: "ok", source, role: result.session.user.role },
      "auth/exchange success",
    );
  }

  await recordAuthLogin({
    userId: result.session.user.userId,
    entryChannel: entryChannelFromMessengerBindings(result.session.user.bindings),
    authMethod: result.session.authSource === "dev_bypass" ? "dev_bypass" : "integrator_exchange",
  });
  if (result.accountOutcome === "created") {
    await recordAuthRegistrationSuccess({
      attemptId,
      authMethod: "integrator_exchange",
      stage: "session_set",
      entryChannel: entryChannelFromMessengerBindings(result.session.user.bindings),
      contactType: "oauth_provider",
      contactValue: "integrator",
      userId: result.session.user.userId,
      isNewAccount: true,
    });
  }

  const response = NextResponse.json({
    ok: true,
    role: result.session.user.role,
    redirectTo: result.redirectTo,
  });
  /** См. `ExchangeResult.setMessengerPlatformCookie` — не ставить bot-cookie для dev bypass с фиктивными bindings. */
  if (result.setMessengerPlatformCookie === true) {
    const isProd = process.env.NODE_ENV === "production";
    response.cookies.set({
      name: PLATFORM_COOKIE_NAME,
      value: "bot",
      path: "/",
      maxAge: PLATFORM_COOKIE_MAX_AGE,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      httpOnly: false,
    });
  }
  logAuthRouteTiming({
    route: ROUTE,
    request,
    startedAt,
    status: 200,
    outcome: "session_ok",
  });
  return response;
}

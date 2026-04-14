import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
import { PLATFORM_COOKIE_MAX_AGE, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const bodySchema = z.object({
  initData: z.string().trim().min(1),
});

const ROUTE = "auth/max-init";

/** Безопасное описание payload: длина и имена query-параметров (значения не логируем). */
function maxInitDataLogFields(initData: string): { initDataLength: number; initDataKeys: string[] } {
  const trimmed = initData.trim().replace(/^\?/, "");
  try {
    const params = new URLSearchParams(trimmed);
    const keys = [...new Set([...params.keys()])].sort();
    return { initDataLength: initData.length, initDataKeys: keys };
  } catch {
    return { initDataLength: initData.length, initDataKeys: [] };
  }
}

function requestDiagnostics(request: Request): {
  requestUri: string;
  queryArgs: string;
  userAgent: string | null;
  authFlow: "max_initData";
  correlationId: string | null;
} {
  const u = new URL(request.url);
  const queryArgs = u.search.startsWith("?") ? u.search.slice(1) : u.search;
  return {
    requestUri: `${u.pathname}${u.search}`,
    queryArgs,
    userAgent: request.headers.get("user-agent"),
    authFlow: "max_initData",
    correlationId: request.headers.get("x-bc-auth-correlation-id"),
  };
}

/**
 * Аутентификация по `window.WebApp.initData` (MAX Mini App), без `?t=` в URL.
 * Подпись: https://dev.max.ru/docs/webapps/validation ; ключ: `max_bot_api_key` в admin settings.
 */
export async function POST(request: Request) {
  const diag = requestDiagnostics(request);
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      {
        route: ROUTE,
        outcome: "invalid_body",
        ...diag,
        hasInitData: false,
        validationOk: false,
      },
      "MAX Mini App: запрос без валидного initData в JSON",
    );
    return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
  }
  const { initData } = parsed.data;
  const fields = maxInitDataLogFields(initData);

  logger.info(
    {
      route: ROUTE,
      outcome: "attempt",
      ...diag,
      ...fields,
      hasInitData: true,
    },
    "MAX Mini App: получен initData, проверка подписи",
  );

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeMaxInitData(initData);
  if (result && "denied" in result && result.denied) {
    logger.warn(
      {
        route: ROUTE,
        outcome: "access_denied",
        denyReason: result.reason,
        validationOk: false,
        ...diag,
        ...fields,
      },
      "MAX Mini App: initData не прошёл проверку или доступ запрещён",
    );
    return NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
  }

  if (!result || !("session" in result)) {
    logger.warn(
      { route: ROUTE, outcome: "unexpected_denied", validationOk: false, ...diag, ...fields },
      "MAX Mini App: неожиданный отказ без session",
    );
    return NextResponse.json({ ok: false, error: "access_denied" }, { status: 403 });
  }
  const exchange = result;
  const u = exchange.session.user;
  logger.info(
    {
      route: ROUTE,
      outcome: "ok",
      validationOk: true,
      ...diag,
      ...fields,
      userId: u.userId,
      maxId: u.bindings?.maxId,
      role: u.role,
      redirectTo: exchange.redirectTo,
    },
    "MAX Mini App: initData принят, сессия создана",
  );

  const response = NextResponse.json({
    ok: true,
    role: exchange.session.user.role,
    redirectTo: exchange.redirectTo,
  });
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
  return response;
}

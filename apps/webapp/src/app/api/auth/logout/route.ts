import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";

const LOGIN_PATH = "/app";

function loginRedirectUrl(request: NextRequest): URL {
  const base = env.APP_BASE_URL || request.url;
  return new URL(LOGIN_PATH, base);
}

/** Выход: POST очищает сессию и редирект на экран входа (форма из меню/профиля). */
export async function POST(request: NextRequest) {
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.redirect(loginRedirectUrl(request));
}

/** GET также очищает сессию (закладка на URL не оставляет пользователя залогиненным). */
export async function GET(request: NextRequest) {
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.redirect(loginRedirectUrl(request));
}

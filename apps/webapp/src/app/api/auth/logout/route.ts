import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getRequestOrigin } from "@/shared/lib/http/getRequestOrigin";

const LOGIN_PATH = "/app";

function loginRedirectUrl(request: NextRequest): URL {
  return new URL(LOGIN_PATH, getRequestOrigin(request));
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

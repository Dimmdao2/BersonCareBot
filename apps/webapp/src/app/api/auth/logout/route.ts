import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const LOGIN_PATH = "/app";

/** Выход: POST очищает сессию и редирект на экран входа (форма из меню/профиля). */
export async function POST(request: NextRequest) {
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

/** GET без побочных эффектов — чтобы закладка на URL не показывала пустой ответ. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

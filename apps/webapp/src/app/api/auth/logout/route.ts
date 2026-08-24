import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';

const LOGIN_PATH = '/app';

function loginRedirectUrl(request: NextRequest): URL {
  return new URL(LOGIN_PATH, requireResolvedSurface(request.headers).publicOrigin);
}

/** Выход: POST очищает сессию и редирект на экран входа (форма из меню/профиля). */
export async function POST(request: NextRequest) {
  stampBootstrapPrincipal('api/auth/logout:POST', request);
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.redirect(loginRedirectUrl(request));
}

/** GET также очищает сессию (закладка на URL не оставляет пользователя залогиненным). */
export async function GET(request: NextRequest) {
  stampBootstrapPrincipal('api/auth/logout:GET', request);
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.redirect(loginRedirectUrl(request));
}

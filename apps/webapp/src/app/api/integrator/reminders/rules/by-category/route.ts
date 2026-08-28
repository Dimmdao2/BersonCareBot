import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  // Track D (#987): keyed by canonical `platform_users.id`; the retired numeric param is gone.
  const platformUserId = url.searchParams.get('platformUserId')?.trim();
  const category = url.searchParams.get('category')?.trim();
  if (!platformUserId || !isPlatformUserUuid(platformUserId) || !category) {
    return NextResponse.json(
      { ok: false, error: 'platformUserId and category required' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  if (!deps.reminderProjection) {
    return NextResponse.json(
      { ok: false, error: 'reminder projection not available' },
      { status: 503 },
    );
  }
  const rule = await deps.reminderProjection.getRuleByPlatformUserIdAndCategory(
    platformUserId,
    category,
  );
  return NextResponse.json({ ok: true, rule: rule ?? null }, { status: 200 });
}

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
  if (!platformUserId || !isPlatformUserUuid(platformUserId)) {
    return NextResponse.json({ ok: false, error: 'platformUserId required' }, { status: 400 });
  }

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  const deps = buildAppDeps();
  if (!deps.reminderProjection) {
    return NextResponse.json(
      { ok: false, error: 'reminder projection not available' },
      { status: 503 },
    );
  }
  const history = await deps.reminderProjection.listHistoryByPlatformUserId(platformUserId, limit);
  return NextResponse.json({ ok: true, history }, { status: 200 });
}

import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

/** Global platform-admin messenger audience, exposed only to authenticated integrator M2M calls. */
export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const targets = await buildAppDeps().adminNotificationTargets.loadTargets();
  return NextResponse.json(
    {
      ok: true,
      adminMessengerTargets: {
        telegramUserIds: targets.telegram,
        maxUserIds: targets.max,
      },
    },
    { status: 200 },
  );
}

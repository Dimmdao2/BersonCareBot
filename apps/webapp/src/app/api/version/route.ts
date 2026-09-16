import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { resolvePublicBuildId } from '@/shared/lib/buildVersion.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/version:GET', request);
  const buildId = resolvePublicBuildId();
  return NextResponse.json(
    { buildId },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    },
  );
}

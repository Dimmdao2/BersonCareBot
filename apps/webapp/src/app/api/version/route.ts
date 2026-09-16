import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';

export const dynamic = 'force-dynamic';

const PROCESS_BUILD_ID = randomUUID();

function resolveBuildId(): string {
  const envBuildId = process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID;
  if (envBuildId && envBuildId.trim().length > 0) {
    return envBuildId.trim();
  }

  return PROCESS_BUILD_ID;
}

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/version:GET', request);
  const buildId = resolveBuildId();
  return NextResponse.json(
    { buildId },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    },
  );
}

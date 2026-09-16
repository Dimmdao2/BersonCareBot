import { NextResponse } from 'next/server';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/health:GET', request);
  const healthy = await runWithDbInfraPrincipal({ source: 'api/health:GET' }, async () => {
    const deps = buildAppDeps();
    return deps.health.checkDbHealth();
  });

  return NextResponse.json({ ok: healthy }, { status: healthy ? 200 : 503 });
}

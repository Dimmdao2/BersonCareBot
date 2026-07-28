import { NextResponse } from 'next/server';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export async function GET() {
  const db = await runWithDbInfraPrincipal({ source: 'api/health:GET' }, async () => {
    const deps = buildAppDeps();
    return (await deps.health.checkDbHealth()) ? 'up' : 'down';
  });

  return NextResponse.json({
    ok: true,
    db,
  });
}

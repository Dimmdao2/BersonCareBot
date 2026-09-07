import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { runDomainHealthTick } from '@/app-layer/health/runDomainHealthTick';

const bodySchema = z.object({
  hostname: z.string().min(1),
}).strict();

/**
 * POST — authenticated single-host execution of the same verifier used by the scheduled tick.
 * The caller chooses only a canonical hostname; it cannot choose or assert a lifecycle transition.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  enterWithDbInfraPrincipal({ source: 'api/internal/domains/activate:POST' });
  try {
    const result = await runDomainHealthTick(undefined, { hostname: parsed.data.hostname });
    if (result.checked !== 1) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: result.unhealthy === 0, ...result });
  } catch (e) {
    logger.error({ err: e }, '[internal/domains/activate] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

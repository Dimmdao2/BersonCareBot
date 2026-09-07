import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';

const bodySchema = z.object({
  hostname: z.string().min(1),
  transition: z.enum(['mark_dns_ready', 'mark_failed', 'mark_suspended']),
  reason: z.string().max(500).optional(),
});

/**
 * POST — limited failure-state transition door for the domain verifier. A caller cannot assert
 * `mark_active`: only the shared health verifier may do that after DNS, TLS and routing evidence.
 *
 * Allowed transitions are enforced by `app.custom_domain_apply_transition` itself.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  enterWithDbInfraPrincipal({ source: 'api/internal/domains/activate:POST' });
  const deps = buildAppDeps();
  if (!deps.customDomainBinding) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  try {
    const result = await deps.customDomainBinding.transitionBindingStatus(parsed.data);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.code }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[internal/domains/activate] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

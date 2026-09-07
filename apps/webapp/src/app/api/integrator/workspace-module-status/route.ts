import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveOrganizationWorkspaceModules } from '@/app-layer/guards/workspaceModuleAccess';
import { isKeyValid } from '@/app-layer/idempotency/idempotencyStore';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';

const bodySchema = z
  .object({ organizationId: z.string().uuid(), module: z.literal('mailings') })
  .strict();

export async function POST(request: Request) {
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const idempotencyKey = request.headers.get('x-bersoncare-idempotency-key');
  const rawBody = await request.text();
  if (!timestamp || !signature || !idempotencyKey || !isKeyValid(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid webhook headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  const expectedIdempotencyKey = `workspace-module-status:${createHash('sha256')
    .update(rawBody)
    .digest('hex')}`;
  if (!parsed.success || idempotencyKey !== expectedIdempotencyKey) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
  if (
    !enterVerifiedIntegratorOrganizationPrincipal(
      parsed.data.organizationId,
      'api/integrator/workspace-module-status:POST',
    )
  ) {
    return NextResponse.json({ ok: false, error: 'invalid organization' }, { status: 400 });
  }

  try {
    const modules = await resolveOrganizationWorkspaceModules(
      buildAppDeps(),
      parsed.data.organizationId,
    );
    return NextResponse.json({ ok: true, enabled: modules[parsed.data.module] });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

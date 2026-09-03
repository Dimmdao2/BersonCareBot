import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError } from '@/shared/http/apiResponse';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const patchBodySchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().max(500),
});

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const { organizationId } = await context.params;
  const parsedId = z.string().uuid().safeParse(organizationId);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: 'invalid_organization_id' }, { status: 400 });
  }

  const parsedBody = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_organization_patch' }, { status: 400 });
  }

  const audit = { actorId: gate.session.user.userId, reason: parsedBody.data.reason };
  try {
    const result = await buildAppDeps().platformEntitlements.setOrganizationActive(
      parsedId.data,
      parsedBody.data.isActive,
      audit,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError({
      error,
      literalRules: { organization_not_found: { code: 'organization_not_found', status: 404 } },
      fallback: { code: 'organization_patch_failed', status: 500 },
      logEvent: 'admin_organization_patch_failed',
    });
  }
}

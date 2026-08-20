import { NextResponse } from 'next/server';
import { z } from 'zod';
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
    const message = error instanceof Error ? error.message : 'organization_patch_failed';
    if (message === 'organization_not_found') {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

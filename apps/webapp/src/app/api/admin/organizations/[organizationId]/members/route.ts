import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const paramsSchema = z.object({
  organizationId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_organization_id' }, { status: 400 });
  }

  try {
    const members = await buildAppDeps().organizationMembership.listPlatformOrganizationMembers(
      parsed.data.organizationId,
    );

    return NextResponse.json({
      ok: true,
      members: members.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        role: member.role,
        status: member.status,
        createdAt: member.createdAt,
        specialistLinked: member.specialistId !== null,
      })),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'platform_organization_members_unavailable' },
      { status: 500 },
    );
  }
}

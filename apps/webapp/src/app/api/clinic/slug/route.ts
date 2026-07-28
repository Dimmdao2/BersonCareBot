import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import type { OrganizationSlugMutationErrorCode } from '@/modules/clinic-directory/ports';

const bodySchema = z
  .object({
    slug: z.string().max(512),
    irreversibleRenameConfirmed: z.boolean().optional().default(false),
  })
  .strict();

function statusForError(code: OrganizationSlugMutationErrorCode): number {
  return code === 'slug_unavailable' || code === 'slug_unchanged' ? 409 : 400;
}

/** POST /api/clinic/slug — claim or rename the organization's durable public slug. */
export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const service = buildAppDeps().clinicDirectory;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'directory_unavailable' }, { status: 503 });
  }

  const result = await service.setOrganizationSlug({
    organizationId: gate.ctx.organizationId,
    slug: parsed.data.slug,
    irreversibleRenameConfirmed: parsed.data.irreversibleRenameConfirmed,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code },
      { status: statusForError(result.code) },
    );
  }
  const state = await service.getSlugManagementState(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, slug: result.slug, state });
}

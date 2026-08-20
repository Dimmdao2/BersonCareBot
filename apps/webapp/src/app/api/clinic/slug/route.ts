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
  // `self_rename_allowance_spent` — конфликт состояния, а не негодный ввод: тело запроса правильное,
  // исчерпано право. Отдаётся отдельным кодом, чтобы человек НЕ увидел «имя занято» (владелец 19.08).
  return code === 'slug_unavailable' ||
    code === 'slug_unchanged' ||
    code === 'self_rename_allowance_spent'
    ? 409
    : 400;
}

function pgCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof value.code === 'string') return value.code;
  return typeof value.cause?.code === 'string' ? value.cause.code : '';
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

  try {
    const result = await service.setOrganizationSlug({
      organizationId: gate.ctx.organizationId,
      slug: parsed.data.slug,
      irreversibleRenameConfirmed: parsed.data.irreversibleRenameConfirmed,
      // Гейт маршрута — кабинет клиники, значит смена всегда самостоятельная. Из тела запроса это
      // никогда не приходит: иначе клиника объявила бы себя админом и обошла единственную смену.
      initiatedBy: 'clinic',
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.code },
        { status: statusForError(result.code) },
      );
    }
    const state = await service.getSlugManagementState(gate.ctx.organizationId);
    return NextResponse.json({ ok: true, slug: result.slug, state });
  } catch (error) {
    const code = pgCode(error);
    console.error('[clinic-slug] mutation failed', {
      category: code === '42501' ? 'capability_denied' : 'repository_unavailable',
      errorClass: error instanceof Error ? error.name : 'unknown',
      code: code || 'unknown',
    });
    return NextResponse.json(
      {
        ok: false,
        error: code === '42501' ? 'directory_capability_unavailable' : 'directory_unavailable',
      },
      { status: 503 },
    );
  }
}

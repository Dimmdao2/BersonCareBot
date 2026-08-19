import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { CLINIC_PUBLIC_CARD_LIMITS } from '@/modules/clinic-public-card/ports';

const bodySchema = z
  .object({
    description: z.string().max(CLINIC_PUBLIC_CARD_LIMITS.descriptionMaxLength).nullable(),
    publicContactPhone: z.string().max(CLINIC_PUBLIC_CARD_LIMITS.phoneMaxLength).nullable(),
    publicContactEmail: z.string().max(CLINIC_PUBLIC_CARD_LIMITS.emailMaxLength).nullable(),
    publicWebsiteUrl: z.string().max(CLINIC_PUBLIC_CARD_LIMITS.websiteMaxLength).nullable(),
    logoMediaId: z.string().uuid().nullable(),
    photoMediaIds: z.array(z.string().uuid()).max(CLINIC_PUBLIC_CARD_LIMITS.maxPhotos),
    cardIsPublished: z.boolean(),
  })
  .strict();

function pgCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof value.code === 'string') return value.code;
  return typeof value.cause?.code === 'string' ? value.cause.code : '';
}

/**
 * POST /api/clinic/public-card — save the clinic card of the CALLER's organization.
 *
 * The organization is taken from the gate context, never from the body: the same gate that already
 * stands on `POST /api/clinic/slug`. The declared root re-checks it against the DB principal, so a
 * forged organization id cannot survive even if this layer were bypassed.
 */
export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const service = buildAppDeps().clinicPublicCard;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'card_unavailable' }, { status: 503 });
  }

  try {
    const result = await service.saveCard({
      organizationId: gate.ctx.organizationId,
      ...parsed.data,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.code }, { status: 400 });
    }
    return NextResponse.json({ ok: true, settings: result.settings });
  } catch (error) {
    const code = pgCode(error);
    console.error('[clinic-public-card] save failed', {
      category: code === '42501' ? 'capability_denied' : 'repository_unavailable',
      errorClass: error instanceof Error ? error.name : 'unknown',
      code: code || 'unknown',
    });
    // 22023 is the root refusing the input it alone can judge — media that is not this clinic's.
    if (code === '22023') {
      return NextResponse.json({ ok: false, error: 'media_not_owned' }, { status: 400 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: code === '42501' ? 'card_capability_unavailable' : 'card_unavailable',
      },
      { status: 503 },
    );
  }
}

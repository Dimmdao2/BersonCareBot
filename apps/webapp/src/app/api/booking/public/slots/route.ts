import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from '@/modules/patient-booking/inPersonBookingResolve';
import { inPersonSlotsQuerySchema } from '@/modules/patient-booking/inPersonApiSchemas';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const onlineQuery = z.object({
  type: z.literal('online'),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  slotCount: z.coerce.number().int().min(1).max(8).optional(),
});

const querySchema = z.discriminatedUnion('type', [onlineQuery, inPersonSlotsQuerySchema]);

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/booking/public/slots:GET', request);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: url.searchParams.get('type') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    orgSlug: url.searchParams.get('orgSlug') ?? undefined,
    branchId: url.searchParams.get('branchId') ?? undefined,
    serviceId: url.searchParams.get('serviceId') ?? undefined,
    date: url.searchParams.get('date') ?? undefined,
    slotCount: url.searchParams.get('slotCount') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    if (parsed.data.type === 'online') {
      return NextResponse.json({ ok: false, error: 'ambiguous_booking_tenant' }, { status: 400 });
    }
    const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(
      deps,
      parsed.data,
    );
    const slots = await withExplicitOrganizationPrincipal(
      { organizationId: publicContext.organizationId, source: 'api/booking/public/slots:GET' },
      async () => {
        const ctx = await resolveInPersonBookingContext(deps, publicContext.keys);
        if (ctx.organizationId !== publicContext.organizationId) {
          throw new InPersonBookingResolveError('ambiguous_booking_tenant');
        }
        return deps.patientBooking.getSlots({
          type: 'in_person',
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          serviceId: ctx.serviceId,
          date: parsed.data.date,
          slotCount: parsed.data.slotCount,
        });
      },
    );
    return NextResponse.json({ ok: true, slots }, { status: 200 });
  } catch (err) {
    if (err instanceof InPersonBookingResolveError) {
      // Reason stays server-side: distinct wire errors would let anonymous callers enumerate clinics/services.
      logger.warn(
        {
          reason: err.reason,
          // `parsed.data` is a discriminated union: only the in_person variant carries these keys.
          ...(parsed.data.type === 'in_person'
            ? {
                branchId: parsed.data.branchId,
                serviceId: parsed.data.serviceId,
                orgSlug: parsed.data.orgSlug,
              }
            : {}),
        },
        '[booking/public/slots] in-person booking resolution refused',
      );
    }
    return respondWithSafeApiError('api/booking/public/slots', err, {
      fallbackCode: 'slots_unavailable',
      fallbackStatus: 503,
      domainStatus: (code) => {
        if (!(err instanceof InPersonBookingResolveError)) {
          return code === 'branch_service_not_found' ? 404 : 503;
        }
        return code === 'branch_service_mapping_missing' ? 404 : 400;
      },
    });
  }
}

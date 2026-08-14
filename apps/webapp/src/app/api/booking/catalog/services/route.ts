import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { logger } from '@/app-layer/logging/logger';
import { loadInPersonServicesForCityRsc } from '@/app/app/patient/booking/bookingCatalogRsc';

const querySchema = z.object({
  cityCode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    cityCode: url.searchParams.get('cityCode') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  try {
    const listed = await loadInPersonServicesForCityRsc(
      parsed.data.cityCode,
      gate.session.user.userId,
    );
    if (!listed.ok && listed.error === 'city_not_found') {
      return NextResponse.json({ ok: false, error: 'city_not_found' }, { status: 404 });
    }
    if (!listed.ok) {
      return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
    }
    const services = listed.services;
    return NextResponse.json({ ok: true, services }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'city_not_found' || msg === 'city_code_required') {
      return NextResponse.json({ ok: false, error: 'city_not_found' }, { status: 404 });
    }
    logger.error({ err }, '[booking/catalog/services] failed');
    return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
  }
}

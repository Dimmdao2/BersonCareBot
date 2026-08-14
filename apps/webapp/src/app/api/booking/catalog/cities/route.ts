import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { logger } from '@/app-layer/logging/logger';
import { loadBookingCitiesForPatientRsc } from '@/app/app/patient/booking/bookingCatalogRsc';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  try {
    const result = await loadBookingCitiesForPatientRsc(gate.session.user.userId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, cities: result.cities }, { status: 200 });
  } catch (err) {
    logger.error({ err }, '[booking/catalog/cities] failed');
    return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
  }
}

/**
 * GET /api/admin/doctor-analytics-metric-accounts — quarantined patient-level drill-down.
 *
 * Platform analytics is aggregate-only until C6. Keep the authenticated compatibility surface
 * fail-closed so a direct HTTP call cannot bypass the placeholder pages and enumerate patients.
 */
import { NextResponse } from 'next/server';

import {
  requireAdminApiContext,
  requirePlatformOperationsApiContext,
} from '@/app-layer/guards/requireRole';

export async function GET() {
  const gate = await requireAdminApiContext();
  if (!gate.ok) return gate.response;
  const platformGate = await requirePlatformOperationsApiContext();
  if (!platformGate.ok) return platformGate.response;

  return NextResponse.json(
    { ok: false, error: 'platform_patient_drilldown_disabled' },
    { status: 409 },
  );
}

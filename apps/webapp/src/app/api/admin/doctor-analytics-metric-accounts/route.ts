/**
 * GET /api/admin/doctor-analytics-metric-accounts — quarantined patient-level drill-down.
 *
 * Platform analytics is aggregate-only until C6. Keep the authenticated compatibility surface
 * fail-closed so a direct HTTP call cannot bypass the placeholder pages and enumerate patients.
 */
import { NextResponse } from 'next/server';

import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { requireAdminModeSession } from '@/modules/auth/requireAdminMode';

export async function GET() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;
  const platformGate = await requirePlatformOperationsApiContext();
  if (!platformGate.ok) return platformGate.response;

  return NextResponse.json(
    { ok: false, error: 'platform_patient_drilldown_disabled' },
    { status: 409 },
  );
}

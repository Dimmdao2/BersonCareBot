/**
 * GET /api/doctor/online-intake/stats?days=30
 *
 * Returns aggregated intake statistics for the given rolling window.
 */
import { NextResponse } from 'next/server';
import { getOnlineIntakeService } from '@/app-layer/di/onlineIntakeDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const VALID_DAYS = [7, 30, 90, 365] as const;
type ValidDays = (typeof VALID_DAYS)[number];

function parseDays(value: string | null): ValidDays {
  const n = value ? parseInt(value, 10) : 30;
  return (VALID_DAYS as readonly number[]).includes(n) ? (n as ValidDays) : 30;
}

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get('days'));
  const service = getOnlineIntakeService();
  const stats = await withDoctorWorkspacePrincipal(gate.ctx, () => service.getDoctorStats(days));

  return NextResponse.json({ ok: true, stats });
}

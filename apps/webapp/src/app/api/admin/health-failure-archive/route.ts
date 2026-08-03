import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
} from '@/modules/operator-health/healthFailureArchiveConstants';
import type { HealthFailureArchiveProbe } from '@/modules/operator-health/healthFailureArchiveConstants';

const probeEnum = z.enum([
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
]);

function parseProbe(raw: string | null): HealthFailureArchiveProbe | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const r = probeEnum.safeParse(t);
  return r.success ? r.data : null;
}

export async function GET(request: Request) {
  // Global-admin-only platform surface: requirePlatformOperationsApiContext() stamps the
  // dedicated "platform" DB principal (SET ROLE app_platform_settings), which is what
  // healthFailureArchive.listForAdmin's underlying SELECT on operator_health_failure_archive
  // needs to see rows across ALL clinics (owner ruling 2026-07-25). The previous
  // role-only-check guard never stamped a DB principal, so the read stayed on the
  // bootstrap/nonstaff pool and failed with "permission denied for table
  // operator_health_failure_archive" (reproduced live on TEST).
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const probeRaw = url.searchParams.get('probe');
  const probe = parseProbe(probeRaw);
  const probeInvalid = probeRaw != null && String(probeRaw).trim().length > 0 && probe === null;
  if (probeInvalid) {
    return NextResponse.json({ ok: false, error: 'invalid_probe' }, { status: 400 });
  }
  const cursor = url.searchParams.get('cursor');
  const limitRaw = url.searchParams.get('limit');
  const limit =
    limitRaw != null && /^\d+$/.test(limitRaw.trim())
      ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10)))
      : 50;

  const { items, nextCursor } = await buildAppDeps().healthFailureArchive.listForAdmin({
    probe,
    limit,
    cursor,
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}

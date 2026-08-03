/**
 * GET /api/admin/audit-log — пагинированный журнал операций (admin_audit_log).
 * Guard: requireAdminApiContext() (admin), then branches:
 *   - global admin (platform.operations capability): requirePlatformOperationsApiContext(), no
 *     organization principal is stamped, so listAdminAuditLog()'s currentPrincipalOrganizationId()
 *     read returns undefined and the query is unscoped — ALL clinics (owner ruling 2026-07-25).
 *   - clinic staff (this route is also used by AdminClientAuditHistorySection for a single
 *     patient's audit trail): requireDoctorWorkspaceApiContext(), org-scoped via
 *     withDoctorWorkspacePrincipal as before.
 * A global admin structurally has no organization membership, so the old unconditional
 * requireDoctorWorkspaceApiContext() call 403'd every platform request with
 * doctor_workspace_membership_required (reproduced live on TEST 2026-07-25).
 */
import { NextResponse } from 'next/server';
import { getPool } from '@/app-layer/db/client';
import { countOpenAutoMergeConflicts, listAdminAuditLog } from '@/app-layer/admin/auditLog';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireAdminApiContext,
  requireDoctorWorkspaceApiContext,
  requirePlatformOperationsApiContext,
} from '@/app-layer/guards/requireRole';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';
import {
  adminAuditListFilterFromQuery,
  adminAuditListQuerySchema,
} from '@/modules/admin/adminAuditListQuery';

export async function GET(req: Request) {
  const gate = await requireAdminApiContext();
  if (!gate.ok) return gate.response;

  const isGlobalAdmin = hasLaunchCapability(
    resolveLaunchCapabilities({
      sessionRole: gate.session.user.role,
    }),
    'platform.operations',
  );

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = adminAuditListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_query', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const q = parsed.data;
  const filter = adminAuditListFilterFromQuery(q);
  if (filter.fromInclusive && filter.toInclusive && filter.fromInclusive > filter.toInclusive) {
    return NextResponse.json({ ok: false, error: 'invalid_date_range' }, { status: 400 });
  }

  if (q.excludeSystemHealth && q.systemHealthOnly) {
    return NextResponse.json({ ok: false, error: 'invalid_system_health_filter' }, { status: 400 });
  }

  const runQuery = () => {
    const pool = getPool();
    return Promise.all([
      listAdminAuditLog(pool, {
        page: filter.page,
        limit: filter.limit,
        action: filter.action,
        targetId: filter.targetId,
        involvesPlatformUserId: filter.involvesPlatformUserId,
        status: filter.status,
        fromInclusive: filter.fromInclusive,
        toInclusive: filter.toInclusive,
        ...(filter.actionPrefix ? { actionPrefix: filter.actionPrefix } : {}),
        ...(filter.systemHealthScopeOnly ? { systemHealthScopeOnly: true } : {}),
        ...(filter.excludeActionPrefix ? { excludeActionPrefix: filter.excludeActionPrefix } : {}),
      }),
      countOpenAutoMergeConflicts(pool),
    ]);
  };

  let result: Awaited<ReturnType<typeof listAdminAuditLog>>;
  let openAutoMergeConflictCount: number;
  if (isGlobalAdmin) {
    const platformGate = await requirePlatformOperationsApiContext();
    if (!platformGate.ok) return platformGate.response;
    [result, openAutoMergeConflictCount] = await runQuery();
  } else {
    const workspaceGate = await requireDoctorWorkspaceApiContext();
    if (!workspaceGate.ok) return workspaceGate.response;
    [result, openAutoMergeConflictCount] = await withDoctorWorkspacePrincipal(
      workspaceGate.ctx,
      runQuery,
    );
  }

  return NextResponse.json({ ok: true, ...result, openAutoMergeConflictCount });
}

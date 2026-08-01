/**
 * GET /api/admin/commercial/tariff-policy-history — §5a item 2.11. Reuses `admin_audit_log`
 * (`listAdminAuditLog`), not a new table: `pgPlatformEntitlements.ts` already writes the full
 * before/after `saas_tariffs` row on every `saas_tariff_create/update/deactivate`, and that row
 * carries both ladder subjects — `systemAccessPolicy` (cabinet) and `mechanicAccessPolicies` (each
 * mechanic). This route only narrows to those actions and shapes the "было → стало" diff; see
 * `diffTariffPolicySnapshots`.
 *
 * Same gate as the constructor itself (`requirePlatformOperationsApiContext`) — a clinic principal
 * has no organization-less audit rows to match (`saas_tariff_*` rows carry `organization_id = NULL`,
 * and `listAdminAuditLog` always scopes org staff to their own `organization_id`), so it structurally
 * cannot see this journal even if it reached this route.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/app-layer/db/client';
import { listAdminAuditLog } from '@/app-layer/admin/auditLog';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { auditActorShortLabel } from '@/infra/adminAuditLogPresentation';
import { diffTariffPolicySnapshots } from '@/modules/org-entitlements/policyHistoryDiff';

const querySchema = z.object({
  tariffId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function GET(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  const { tariffId, page, limit } = parsed.data;

  const result = await listAdminAuditLog(getPool(), {
    page,
    limit,
    actionPrefix: 'saas_tariff_',
    ...(tariffId ? { targetId: tariffId } : {}),
  });

  const items = result.items
    .map((row) => {
      const details = row.details as { reason?: unknown; before?: unknown; after?: unknown };
      const changes = diffTariffPolicySnapshots(details.before ?? null, details.after ?? null);
      const tariffName =
        (details.after as { name?: unknown } | null)?.name ??
        (details.before as { name?: unknown } | null)?.name ??
        null;
      return {
        id: row.id,
        tariffId: row.target_id,
        tariffName: typeof tariffName === 'string' ? tariffName : null,
        action: row.action,
        actorLabel: auditActorShortLabel(row.actor_id, row.action),
        reason: typeof details.reason === 'string' ? details.reason : '',
        createdAt: row.created_at,
        changes,
      };
    })
    // A tariff write with no ladder-field change (e.g. price/name only) is not a policy edit.
    .filter((item) => item.changes.length > 0);

  return NextResponse.json({ ok: true, items, total: result.total, page: result.page, limit: result.limit });
}

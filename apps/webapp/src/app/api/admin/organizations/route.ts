import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { MECHANICS, MECHANIC_REGISTRY, type OrgMechanic } from '@/modules/org-entitlements/types';

function onlyActuallyTrackedUsage(
  usage: Partial<Record<OrgMechanic, number>>,
): Partial<Record<OrgMechanic, number>> {
  return Object.fromEntries(
    MECHANICS.flatMap((mechanic) => {
      if (MECHANIC_REGISTRY[mechanic].quotaEnforcement === 'declared_no_enforcement') {
        return [];
      }
      const value = usage[mechanic];
      return Number.isSafeInteger(value) && value !== undefined && value >= 0
        ? [[mechanic, value]]
        : [];
    }),
  );
}

export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  try {
    const deps = buildAppDeps();
    const [organizations, tariffs] = await Promise.all([
      deps.platformEntitlements.listOrganizations(),
      deps.platformEntitlements.listTariffs(),
    ]);
    const enforcedQuotaUsage = Object.fromEntries(
      await Promise.all(
        organizations.map(async (organization) => {
          try {
            return [
              organization.id,
              onlyActuallyTrackedUsage(
                await deps.orgEntitlements.getEnforcedQuotaUsage(organization.id),
              ),
            ];
          } catch {
            // A missing optional counter must not hide the already-readable clinic list. The UI
            // renders an explicit "value not received" state; inventing zero is forbidden.
            return [organization.id, {}];
          }
        }),
      ),
    );

    return NextResponse.json({ ok: true, organizations, tariffs, enforcedQuotaUsage });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'platform_organizations_unavailable' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { resolveOrgQuotaProjections } from '@/modules/org-entitlements/service';
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
    const [enforcedQuotaUsageEntries, quotaProjectionEntries] = await Promise.all([
      Promise.all(
        organizations.map(async (organization) => {
          try {
            return [
              organization.id,
              onlyActuallyTrackedUsage(
                await deps.orgEntitlements.getEnforcedQuotaUsage(organization.id),
              ),
            ] as const;
          } catch {
            // A missing optional counter must not hide the already-readable clinic list. The UI
            // renders an explicit "value not received" state; inventing zero is forbidden.
            return [organization.id, {}] as const;
          }
        }),
      ),
      // §5a stage 6.2 — "кто за пределом и кто на какой ступени лестницы": the same
      // usage/limit/threshold projection the clinic's own billing tab uses (§5a stage 6.1),
      // read here through the cross-org platform usage source instead of the own-org one.
      Promise.all(
        organizations.map(async (organization) => {
          try {
            return [
              organization.id,
              await resolveOrgQuotaProjections(deps.orgEntitlements, organization.id),
            ] as const;
          } catch {
            return [organization.id, []] as const;
          }
        }),
      ),
    ]);
    const enforcedQuotaUsage = Object.fromEntries(enforcedQuotaUsageEntries);
    const quotaProjections = Object.fromEntries(quotaProjectionEntries);

    return NextResponse.json({
      ok: true,
      organizations,
      tariffs,
      enforcedQuotaUsage,
      quotaProjections,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'platform_organizations_unavailable' },
      { status: 500 },
    );
  }
}

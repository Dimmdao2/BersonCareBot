import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { resolveMechanicAccess } from '@/modules/org-entitlements/service';
import {
  resolveWorkspaceModuleEffective,
  WORKSPACE_MODULE_CONFIG_KEYS,
  type WorkspaceModuleAvailability,
} from '@/modules/system-settings/doctorWorkspaceComposition';

type AppDeps = ReturnType<typeof buildAppDeps>;

export type PublicLeadsContext = {
  organizationId: string;
  deps: AppDeps;
};

function mechanicIsVisible(state: Awaited<ReturnType<typeof resolveMechanicAccess>>['state']) {
  return state === 'full_access' || state === 'grace' || state === 'read_only';
}

/** One tenant/tariff/workspace boundary shared by the card, widget and both public API doors. */
export async function withPublicLeadsAccess<T>(
  slug: string,
  source: string,
  access: 'read' | 'mutation',
  operation: (context: PublicLeadsContext) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const deps = buildAppDeps();
  const organizationId = await deps.clinicDirectory?.resolveOrganizationIdBySlug(slug);
  if (!organizationId || !deps.bookingForm || !deps.leads) return { ok: false };

  return withExplicitOrganizationPrincipal({ organizationId, source }, async () => {
    const [mechanic, composition] = await Promise.all([
      resolveMechanicAccess(deps.orgEntitlements, organizationId, 'leads'),
      deps.systemSettings.getDoctorWorkspaceComposition({ organizationId }),
    ]);
    const availability = Object.fromEntries(
      WORKSPACE_MODULE_CONFIG_KEYS.map((key) => [
        key,
        key === 'leads' && mechanicIsVisible(mechanic.state),
      ]),
    ) as WorkspaceModuleAvailability;
    if (resolveWorkspaceModuleEffective(composition, availability).leads !== true) {
      return { ok: false };
    }
    const execute = () => operation({ organizationId, deps });
    const value =
      access === 'mutation'
        ? await runWithMechanicWriteClearance('leads', execute)
        : await execute();
    return { ok: true, value };
  });
}

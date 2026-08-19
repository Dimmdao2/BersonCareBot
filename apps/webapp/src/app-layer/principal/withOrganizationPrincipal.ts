import {
  createDbOrganizationPrincipal,
  getCurrentDbPrincipal,
  runWithDbPrincipal,
  runWithDbPatientPrincipal,
  runWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import {
  isPublicBookingPrincipalSource,
  runInPublicBookingPrincipalScope,
} from '@/app-layer/principal/publicBookingPrincipal';

export type TenantPrincipalContext = {
  organizationId: string;
  source: string;
};

export type PatientTenantPrincipalContext = TenantPrincipalContext & {
  platformUserId: string;
};

function normalizePrincipalSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('principal_source_required');
  }
  return trimmed;
}

/**
 * Источник ДОЛЖЕН доехать до самого принципала: по нему инфраструктура отличает анонимную воронку
 * публичной записи от кабинетных маршрутов абонементов и вебхуков эквайринга, которые ходят под
 * тем же видом принципала. Раньше `source` здесь только проверялся на непустоту и выбрасывался —
 * `runWithDbOrganizationPrincipal` принимает лишь идентификатор организации, — и различить эти
 * три потока было физически нечем.
 */
export async function withExplicitOrganizationPrincipal<T>(
  ctx: TenantPrincipalContext,
  fn: () => Promise<T>,
): Promise<T> {
  const source = normalizePrincipalSource(ctx.source);
  const run = (): Promise<T> =>
    runWithDbPrincipal(
      createDbOrganizationPrincipal({ organizationId: ctx.organizationId, source }),
      fn,
    );
  return isPublicBookingPrincipalSource(source) ? runInPublicBookingPrincipalScope(run) : run();
}

export async function withPatientOrganizationPrincipal<T>(
  ctx: PatientTenantPrincipalContext,
  fn: () => Promise<T>,
): Promise<T> {
  normalizePrincipalSource(ctx.source);
  return runWithDbPatientPrincipal(
    {
      organizationId: ctx.organizationId,
      platformUserId: ctx.platformUserId,
      source: ctx.source,
    },
    fn,
  );
}

/**
 * Patient principal carrying IDENTITY only, with no tenant claim.
 *
 * Needed by the one step that necessarily precedes a tenant claim: a first-time public-booking
 * visitor is not yet a client of the clinic, and a principal claiming that organisation is refused
 * by the tenant-claim gate (`app.install_port_context` requires an `org_enrollments` row). The
 * patient wall is "own data only" and checks identity, never organisation (owner correction
 * 2026-07-12), so this is a complete principal rather than a degraded one —
 * `stampDbPrincipalFromSession` already stamps the same shape for a patient whose organisation has
 * not been resolved.
 */
export async function withPatientIdentityPrincipal<T>(
  ctx: { platformUserId: string; source: string },
  fn: () => Promise<T>,
): Promise<T> {
  normalizePrincipalSource(ctx.source);
  return runWithDbPatientPrincipal({ platformUserId: ctx.platformUserId, source: ctx.source }, fn);
}

export function withDoctorWorkspacePrincipal<T>(
  workspace: Pick<DoctorWorkspaceAccessContext, 'organizationId'>,
  source: string,
  fn: () => T,
): T {
  const normalizedSource = normalizePrincipalSource(source);
  const current = getCurrentDbPrincipal();
  if (current?.kind !== 'staff') {
    throw new Error('doctor_workspace_staff_principal_required');
  }
  return runWithDbStaffPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: current.platformUserId,
      source: normalizedSource,
    },
    fn,
  );
}

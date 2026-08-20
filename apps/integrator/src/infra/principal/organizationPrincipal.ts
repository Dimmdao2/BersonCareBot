import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalIntegratorUserId,
  getCurrentDbPrincipalOrganizationId,
  runWithDbBootstrapPrincipal,
  runWithDbInfraPrincipal,
  runWithDbIntegratorPrincipal,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';
import type { DbBootstrapPrincipalInput, DbInfraPrincipalInput } from '@bersoncare/db-principal';
import {
  runWithIntegratorPortCapability,
  type IntegratorPortCapabilityName,
} from '../db/portContextRuntime.js';

export const getCurrentOrganizationPrincipalId = getCurrentDbPrincipalOrganizationId;
export const getCurrentIntegratorPrincipalUserId = getCurrentDbPrincipalIntegratorUserId;
export const getCurrentDatabasePrincipal = getCurrentDbPrincipal;
export const runWithOrganizationPrincipal = runWithDbOrganizationPrincipal;

export function runWithIntegratorPrincipal<T>(
  input: { organizationId: string; integratorUserId: string | number | bigint; source?: string },
  fn: () => T,
): T {
  return runWithDbIntegratorPrincipal(input, fn);
}

// Channel/integration adapters (e.g. telegram/**) are barred by eslint's no-restricted-imports
// (*db* pattern) from importing @bersoncare/db-principal directly — DB access must flow through
// an infra port. These wrappers are that port for bootstrap/infra principal scopes.
export function runWithBootstrapPrincipal<T>(input: DbBootstrapPrincipalInput, fn: () => T): T {
  return runWithDbBootstrapPrincipal(input, fn);
}

export function runWithInfraPrincipal<T>(
  input: DbInfraPrincipalInput & { portCapability?: IntegratorPortCapabilityName },
  fn: () => T,
): T {
  const { portCapability, ...principal } = input;
  return runWithDbInfraPrincipal(principal, () =>
    portCapability ? runWithIntegratorPortCapability(portCapability, fn) : fn(),
  );
}

export function runWithOptionalOrganizationPrincipal<T>(
  organizationId: string | null | undefined,
  fn: () => T,
): T {
  return organizationId ? runWithOrganizationPrincipal(organizationId, fn) : fn();
}

/**
 * Selects the delivery-worker runtime role for a DB capability whose EXECUTE is held only by
 * `app_operational_delivery_worker`.
 *
 * Outgoing-delivery rows are processed under the row's organization principal, which in
 * port-context mode installs `SET LOCAL ROLE app_tenant_service`; the integrator login role is
 * NOINHERIT, so neither it nor `app_tenant_service` can reach these capabilities. The scope
 * therefore belongs at the capability wrapper — the repository function that fronts the exact
 * SECURITY DEFINER root — and never at each caller, which is how
 * `app.revalidate_patient_reminder_delivery_materialization` came to fail on TEST.
 */
export function runWithDeliveryWorkerPrincipal<T>(fn: () => T): T {
  return runWithInfraPrincipal(
    { source: 'worker:outgoing-delivery-tick', portCapability: 'delivery' },
    fn,
  );
}

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
  const { portCapability = 'service', ...principal } = input;
  return runWithDbInfraPrincipal(principal, () => runWithIntegratorPortCapability(portCapability, fn));
}

export function runWithOptionalOrganizationPrincipal<T>(
  organizationId: string | null | undefined,
  fn: () => T,
): T {
  return organizationId ? runWithOrganizationPrincipal(organizationId, fn) : fn();
}

import {
  getCurrentDbPrincipalIntegratorUserId,
  getCurrentDbPrincipalOrganizationId,
  runWithDbIntegratorPrincipal,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';

export const getCurrentOrganizationPrincipalId = getCurrentDbPrincipalOrganizationId;
export const getCurrentIntegratorPrincipalUserId = getCurrentDbPrincipalIntegratorUserId;
export const runWithOrganizationPrincipal = runWithDbOrganizationPrincipal;

export function runWithIntegratorPrincipal<T>(
  input: { organizationId: string; integratorUserId: string | number | bigint; source?: string },
  fn: () => T,
): T {
  return runWithDbIntegratorPrincipal(input, fn);
}

export function runWithOptionalOrganizationPrincipal<T>(
  organizationId: string | null | undefined,
  fn: () => T,
): T {
  return organizationId ? runWithOrganizationPrincipal(organizationId, fn) : fn();
}

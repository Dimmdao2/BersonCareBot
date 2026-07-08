import {
  getCurrentDbPrincipalOrganizationId,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';

export const getCurrentOrganizationPrincipalId = getCurrentDbPrincipalOrganizationId;
export const runWithOrganizationPrincipal = runWithDbOrganizationPrincipal;

export function runWithOptionalOrganizationPrincipal<T>(
  organizationId: string | null | undefined,
  fn: () => T,
): T {
  return organizationId ? runWithOrganizationPrincipal(organizationId, fn) : fn();
}

import { enterWithDbOrganizationPrincipal } from '@bersoncare/db-principal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Installs the tenant boundary carried by an already verified integrator M2M request. */
export function enterVerifiedIntegratorOrganizationPrincipal(
  organizationId: string,
  source: string,
): boolean {
  const normalized = organizationId.trim();
  if (!UUID_RE.test(normalized)) return false;
  enterWithDbOrganizationPrincipal({ organizationId: normalized, source });
  return true;
}

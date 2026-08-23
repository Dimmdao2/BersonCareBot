import type { ClinicDirectoryService } from './service';
import { validateOrganizationSlugCandidate } from './organizationSlug';

/**
 * Narrow B1 adapter for a `<clinic>.therapygo.ru` label.  The caller owns host
 * classification; this module owns only the organization lookup contract and deliberately
 * reuses the canonical public-slug resolver behind ClinicDirectoryService.
 */
export type PatientSubdomainOrganizationResolution =
  { kind: 'resolved'; organizationId: string; slug: string } | { kind: 'not_found'; status: 404 };

const NOT_FOUND: PatientSubdomainOrganizationResolution = Object.freeze({
  kind: 'not_found' as const,
  status: 404 as const,
});

/**
 * Resolves the clinic label selected by a patient-domain host.  An invalid, reserved,
 * unpublished, inactive, or unknown label has exactly one outcome: hard 404.  In particular,
 * it never falls back to the platform/default patient surface.
 */
export async function resolvePatientSubdomainOrganization(
  clinicDirectory: Pick<ClinicDirectoryService, 'resolveOrganizationIdBySlug'>,
  subdomainLabel: string,
): Promise<PatientSubdomainOrganizationResolution> {
  const slug = validateOrganizationSlugCandidate(subdomainLabel);
  if (!slug.ok) return NOT_FOUND;

  const organizationId = await clinicDirectory.resolveOrganizationIdBySlug(slug.slug);
  return organizationId ? { kind: 'resolved', organizationId, slug: slug.slug } : NOT_FOUND;
}

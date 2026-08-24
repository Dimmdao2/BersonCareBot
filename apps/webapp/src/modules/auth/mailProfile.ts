import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';
import type { UserRole } from '@/shared/types/session';

export type MailProfileRequest =
  | { kind: 'platform'; senderDisplayName: string }
  | {
      kind: 'branded';
      organizationId: string;
      clinicName: string;
      platformName: string;
    };

/** The recipient's role, rather than the route that found it, selects the platform sender. */
export function platformMailProfileForRecipientRole(role: UserRole): MailProfileRequest {
  return {
    kind: 'platform',
    senderDisplayName: role === 'client' ? PATIENT_DEFAULT_SURFACE.name : STAFF_SURFACE.name,
  };
}

export function brandedMailProfile(input: {
  organizationId: string;
  clinicName: string;
  platformName: string;
}): MailProfileRequest {
  return { kind: 'branded', ...input };
}

/** The proxy-resolved surface is the caller-owned source of patient sender identity. */
export function mailProfileForResolvedSurface(surface: ResolvedSurface): MailProfileRequest {
  if (surface.surface === 'staff' || surface.surface === 'platform_admin') {
    return platformMailProfileForRecipientRole('doctor');
  }
  if (surface.surface === 'patient_default') {
    return platformMailProfileForRecipientRole('client');
  }
  if (!surface.organizationId || !surface.effectivePatientBrand) {
    throw new Error('branded_surface_mail_profile_required');
  }
  return brandedMailProfile({
    organizationId: surface.organizationId,
    clinicName: surface.effectivePatientBrand.effectiveDisplayName,
    platformName: PATIENT_DEFAULT_SURFACE.name,
  });
}

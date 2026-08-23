import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { UserRole } from '@/shared/types/session';

export type MailProfileRequest =
  | { kind: 'platform'; senderDisplayName: string }
  | {
      kind: 'branded';
      organizationId: string;
      clinicName: string;
      platformName: string;
    };

export function platformMailProfile(senderDisplayName: string): MailProfileRequest {
  return { kind: 'platform', senderDisplayName };
}

/** The recipient's role, rather than the route that found it, selects the platform sender. */
export function platformMailProfileForRecipientRole(role: UserRole): MailProfileRequest {
  return platformMailProfile(
    role === 'client' ? PATIENT_DEFAULT_SURFACE.name : STAFF_SURFACE.name,
  );
}

export function brandedMailProfile(input: {
  organizationId: string;
  clinicName: string;
  platformName: string;
}): MailProfileRequest {
  return { kind: 'branded', ...input };
}

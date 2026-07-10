import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

/** Per-patient row from `doctor_patient_support` (null row = defaults only). */
export type ClientSupportProfile = {
  organizationId?: string | null;
  patientUserId: string;
  onSupport: boolean;
  /** Момент начала сопровождения (ISO); null если не на сопровождении. */
  supportStartedAt: string | null;
  commentsEnabled: boolean | null;
  mediaEnabled: boolean | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type DoctorSupportWithoutSupportDefaults = {
  commentsEnabled: boolean;
  mediaEnabled: boolean;
};

export type PatientProgramInteractionPolicy = {
  organizationId: string | null;
  onSupport: boolean;
  commentsAllowed: boolean;
  mediaAllowed: boolean;
};

export function resolvePatientProgramInteractionPolicy(params: {
  profile: ClientSupportProfile | null;
  defaultsWithoutSupport: DoctorSupportWithoutSupportDefaults;
}): PatientProgramInteractionPolicy {
  const organizationId = params.profile?.organizationId ?? getCurrentDbPrincipalOrganizationId() ?? null;
  const onSupport = params.profile?.onSupport ?? false;
  if (onSupport) {
    return {
      organizationId,
      onSupport: true,
      commentsAllowed: params.profile?.commentsEnabled !== false,
      mediaAllowed: params.profile?.mediaEnabled !== false,
    };
  }
  const hasOrganizationContext = Boolean(organizationId);
  return {
    organizationId,
    onSupport: false,
    commentsAllowed:
      hasOrganizationContext &&
      (params.profile?.commentsEnabled === true ||
        (params.profile?.commentsEnabled == null && params.defaultsWithoutSupport.commentsEnabled)),
    mediaAllowed:
      hasOrganizationContext &&
      (params.profile?.mediaEnabled === true ||
        (params.profile?.mediaEnabled == null && params.defaultsWithoutSupport.mediaEnabled)),
  };
}

export function parseDoctorSupportDefaultEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === "object" &&
    (valueJson as Record<string, unknown>).value === true
  );
}

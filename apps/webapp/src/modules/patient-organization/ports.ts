export type PatientOrganizationEnrollment = {
  organizationId: string;
  organizationTitle: string;
  platformUserId: string;
  status: 'active' | 'invited' | 'discharged' | 'archived';
  organizationIsActive: boolean;
  createdAt: string;
};

export type CreateManualOrganizationClientInput = {
  organizationId: string;
  /** Specialist who owns a manually created card; null for non-clinical clinic managers. */
  specialistId?: string | null;
  /** Required only for a no-phone/no-email standalone card. */
  commandId?: string;
  phoneNormalized: string | null;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type CreateManualOrganizationClientResult =
  | {
      ok: true;
      userId: string;
      displayName: string;
      lastName: string | null;
      firstName: string | null;
      patronymic: string | null;
      phoneNormalized: string | null;
      created: boolean;
    }
  | {
      ok: false;
      error:
        | 'email_conflict'
        | 'identity_conflict'
        | 'inactive_enrollment'
        | 'idempotency_conflict'
        | 'create_failed';
    };

export type PatientOrganizationPort = {
  listActiveEnrollmentsByPlatformUser(
    platformUserId: string,
  ): Promise<PatientOrganizationEnrollment[]>;
  hasActiveEnrollment(platformUserId: string, organizationId: string): Promise<boolean>;
  /** Staff scheduling may use an invited card; patient portal access still requires active. */
  hasSchedulableClientRelationship(
    platformUserId: string,
    organizationId: string,
  ): Promise<boolean>;
  /**
   * Staff-only manual client registration. The canonical identity and exact-organization enrollment
   * commit together so a global platform user is never left behind without its intended relationship.
   */
  createManualOrganizationClient(
    input: CreateManualOrganizationClientInput,
  ): Promise<CreateManualOrganizationClientResult>;
  findTreatmentProgramOrganizationForPatient(
    platformUserId: string,
    instanceId: string,
  ): Promise<string | null>;
  /** Narrow patient projection; never returns the staff template aggregate. */
  findTreatmentProgramDescriptionForPatient(
    platformUserId: string,
    instanceId: string,
  ): Promise<string | null>;
};

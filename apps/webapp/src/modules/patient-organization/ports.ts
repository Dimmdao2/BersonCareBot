export type PatientOrganizationEnrollment = {
  organizationId: string;
  organizationTitle: string;
  platformUserId: string;
  status: "active" | "invited" | "discharged" | "archived";
  organizationIsActive: boolean;
  createdAt: string;
};

export type CreateManualOrganizationClientInput = {
  organizationId: string;
  phoneNormalized: string;
  displayName: string;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type CreateManualOrganizationClientResult =
  | {
      ok: true;
      userId: string;
      displayName: string;
      phoneNormalized: string;
      created: boolean;
    }
  | {
      ok: false;
      error: "email_conflict" | "identity_conflict" | "inactive_enrollment" | "create_failed";
    };

export type PatientOrganizationPort = {
  listActiveEnrollmentsByPlatformUser(platformUserId: string): Promise<PatientOrganizationEnrollment[]>;
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
};

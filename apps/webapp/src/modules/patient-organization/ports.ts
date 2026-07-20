export type PatientOrganizationEnrollment = {
  organizationId: string;
  organizationTitle: string;
  platformUserId: string;
  status: "active" | "invited" | "discharged" | "archived";
  organizationIsActive: boolean;
  createdAt: string;
};

export type PatientOrganizationPort = {
  listActiveEnrollmentsByPlatformUser(platformUserId: string): Promise<PatientOrganizationEnrollment[]>;
  hasActiveEnrollment(platformUserId: string, organizationId: string): Promise<boolean>;
  findTreatmentProgramOrganizationForPatient(
    platformUserId: string,
    instanceId: string,
  ): Promise<string | null>;
};

export type PatientOrganizationEnrollment = {
  organizationId: string;
  platformUserId: string;
  status: "active" | "invited" | "discharged" | "archived";
  createdAt: string;
};

export type PatientOrganizationPort = {
  listActiveEnrollmentsByPlatformUser(platformUserId: string): Promise<PatientOrganizationEnrollment[]>;
};

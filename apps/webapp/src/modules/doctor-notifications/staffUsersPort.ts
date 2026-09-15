export type StaffUsersPort = {
  listActiveStaffUserIds: () => Promise<string[]>;
  /**
   * Active clinic administrators of ONE organization. Separate from `listActiveStaffUserIds`
   * on purpose: that one answers «кто из персонала вообще есть», and its callers (patient
   * discussion viewers, patient-message fallback) mean doctors, not administrators. The
   * organization is supplied by the event owner, never inferred from a platform-wide list.
   */
  listActiveClinicAdminUserIds: (organizationId: string) => Promise<string[]>;
  listActiveStaffOrganizationRecipients?: () => Promise<
    Array<{ userId: string; organizationId: string }>
  >;
};

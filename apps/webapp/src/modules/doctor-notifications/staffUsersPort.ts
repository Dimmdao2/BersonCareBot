export type StaffUsersPort = {
  /**
   * Active clinic administrators. The organization is supplied by the event owner, never
   * inferred from a platform-wide administrator list.
   */
  listActiveStaffUserIds: (organizationId: string) => Promise<string[]>;
  listActiveStaffOrganizationRecipients?: () => Promise<
    Array<{ userId: string; organizationId: string }>
  >;
};

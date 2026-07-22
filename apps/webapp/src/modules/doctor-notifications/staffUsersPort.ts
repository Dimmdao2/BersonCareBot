export type StaffUsersPort = {
  listActiveStaffUserIds: () => Promise<string[]>;
  listActiveStaffOrganizationRecipients?: () => Promise<Array<{ userId: string; organizationId: string }>>;
};

export type StaffUsersPort = {
  listActiveStaffUserIds: () => Promise<string[]>;
};

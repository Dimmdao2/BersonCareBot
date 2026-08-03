export type GlobalAdminWebPushRecipientsPort = {
  /** Canonical platform-global admins only; organization membership never grants this audience. */
  listActiveGlobalAdminUserIds(): Promise<string[]>;
};

export const emptyGlobalAdminWebPushRecipientsPort: GlobalAdminWebPushRecipientsPort = {
  listActiveGlobalAdminUserIds: async () => [],
};

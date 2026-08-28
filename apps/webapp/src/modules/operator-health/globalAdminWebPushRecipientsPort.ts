export type GlobalAdminWebPushRecipientsPort = {
  /** Canonical, active, subscribed platform-global admins with web-push notifications enabled. */
  listEligibleGlobalAdminUserIds(): Promise<string[]>;
};

export const emptyGlobalAdminWebPushRecipientsPort: GlobalAdminWebPushRecipientsPort = {
  listEligibleGlobalAdminUserIds: async () => [],
};

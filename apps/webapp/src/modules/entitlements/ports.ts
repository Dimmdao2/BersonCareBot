export type EntitlementsPort = {
  listActiveGrantsForUser(platformUserId: string): Promise<
    Array<{
      contentId: string;
      purpose: string;
      expiresAt: string;
      metaJson: Record<string, unknown>;
    }>
  >;
};

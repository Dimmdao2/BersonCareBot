export type EntitlementsPort = {
  upsertWebappGrant(input: {
    integratorGrantId: string;
    platformUserId: string | null;
    integratorUserId: number;
    contentId: string;
    purpose: string;
    expiresAt: string;
    metaJson?: Record<string, unknown>;
  }): Promise<void>;
  listActiveGrantsForUser(platformUserId: string): Promise<
    Array<{
      contentId: string;
      purpose: string;
      expiresAt: string;
      metaJson: Record<string, unknown>;
    }>
  >;
  getPlatformUserIntegratorId(platformUserId: string): Promise<number>;
};

import type { EntitlementsPort } from './ports';

export function createEntitlementsService(deps: { port: EntitlementsPort }) {
  return {
    async listActiveContentGrants(platformUserId: string) {
      return deps.port.listActiveGrantsForUser(platformUserId);
    },

    async hasActiveContentGrant(platformUserId: string, contentId: string): Promise<boolean> {
      const grants = await deps.port.listActiveGrantsForUser(platformUserId);
      return grants.some((g) => g.contentId === contentId);
    },
  };
}

export type EntitlementsService = ReturnType<typeof createEntitlementsService>;

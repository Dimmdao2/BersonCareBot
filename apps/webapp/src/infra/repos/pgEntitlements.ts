import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDrizzleOrMutationTx as getDrizzle } from '@/infra/db/drizzleMutationTx';
import { contentAccessGrantsWebapp } from '../../../db/schema/schema';
import type { EntitlementsPort } from '@/modules/entitlements/ports';

export function createPgEntitlementsPort(): EntitlementsPort {
  return {
    async listActiveGrantsForUser(platformUserId) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const rows = await db
        .select({
          contentId: contentAccessGrantsWebapp.contentId,
          purpose: contentAccessGrantsWebapp.purpose,
          expiresAt: contentAccessGrantsWebapp.expiresAt,
          metaJson: contentAccessGrantsWebapp.metaJson,
        })
        .from(contentAccessGrantsWebapp)
        .where(
          and(
            eq(contentAccessGrantsWebapp.platformUserId, platformUserId),
            gt(contentAccessGrantsWebapp.expiresAt, now),
            isNull(contentAccessGrantsWebapp.revokedAt),
          ),
        );
      return rows.map((r) => ({
        contentId: r.contentId,
        purpose: r.purpose,
        expiresAt: r.expiresAt,
        metaJson: (r.metaJson ?? {}) as Record<string, unknown>,
      }));
    },
  };
}

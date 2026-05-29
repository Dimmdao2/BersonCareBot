import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { contentAccessGrantsWebapp, platformUsers } from "../../../db/schema/schema";
import type { EntitlementsPort } from "@/modules/entitlements/ports";

/** Synthetic integrator user id when platform user has no bot binding (webapp-native grants). */
export const WEBAPP_NATIVE_GRANT_INTEGRATOR_USER_ID = 0;

export function createPgEntitlementsPort(): EntitlementsPort {
  return {
    async getPlatformUserIntegratorId(platformUserId) {
      const db = getDrizzle();
      const [row] = await db
        .select({ integratorUserId: platformUsers.integratorUserId })
        .from(platformUsers)
        .where(eq(platformUsers.id, platformUserId))
        .limit(1);
      if (row?.integratorUserId != null) return Number(row.integratorUserId);
      return WEBAPP_NATIVE_GRANT_INTEGRATOR_USER_ID;
    },

    async upsertWebappGrant(input) {
      const db = getDrizzle();
      await db
        .insert(contentAccessGrantsWebapp)
        .values({
          integratorGrantId: input.integratorGrantId,
          platformUserId: input.platformUserId,
          integratorUserId: input.integratorUserId,
          contentId: input.contentId,
          purpose: input.purpose,
          expiresAt: input.expiresAt,
          metaJson: input.metaJson ?? {},
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: contentAccessGrantsWebapp.integratorGrantId,
          set: {
            platformUserId: input.platformUserId,
            integratorUserId: input.integratorUserId,
            contentId: input.contentId,
            purpose: input.purpose,
            expiresAt: input.expiresAt,
            revokedAt: null,
            metaJson: input.metaJson ?? {},
          },
        });
    },

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

import { and, asc, eq } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runDrizzleMutationTransaction } from "@/infra/db/drizzleMutationTx";
import { entityComments as commentsTable } from "../../../db/schema/entityComments";
import type { CommentsPort } from "@/modules/comments/ports";
import type {
  CreateEntityCommentInput,
  EntityComment,
  CommentTargetType,
  CommentType,
  UpdateEntityCommentInput,
} from "@/modules/comments/types";

function mapRow(row: typeof commentsTable.$inferSelect): EntityComment {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    authorId: row.authorId,
    targetType: row.targetType as CommentTargetType,
    targetId: row.targetId,
    commentType: row.commentType as CommentType,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId && fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error("organization_principal_mismatch");
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

export function createPgCommentsPort(): CommentsPort {
  return {
    async listByTarget(targetType: CommentTargetType, targetId: string): Promise<EntityComment[]> {
      const db = getDrizzle();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const list = await db
        .select()
        .from(commentsTable)
        .where(
          and(
            eq(commentsTable.targetType, targetType),
            eq(commentsTable.targetId, targetId),
            principalOrganizationId ? eq(commentsTable.organizationId, principalOrganizationId) : undefined,
          ),
        )
        .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id));
      return list.map(mapRow);
    },

    async getById(id: string): Promise<EntityComment | null> {
      const db = getDrizzle();
      const [row] = await db.select().from(commentsTable).where(eq(commentsTable.id, id)).limit(1);
      return row ? mapRow(row) : null;
    },

    async create(input: CreateEntityCommentInput, authorId: string): Promise<EntityComment> {
      return runDrizzleMutationTransaction(async (tx) => {
        const [row] = await tx
          .insert(commentsTable)
          .values({
            organizationId: currentWriteOrganizationId(),
            authorId,
            targetType: input.targetType,
            targetId: input.targetId,
            commentType: input.commentType,
            body: input.body,
          })
          .returning();
        if (!row) throw new Error("insert comment failed");
        return mapRow(row);
      });
    },

    async update(id: string, input: UpdateEntityCommentInput): Promise<EntityComment | null> {
      const existing = await this.getById(id);
      if (!existing) return null;
      const patch: Partial<typeof commentsTable.$inferInsert> = {
        organizationId: currentWriteOrganizationId(existing.organizationId),
        updatedAt: new Date().toISOString(),
      };
      if (input.body !== undefined) patch.body = input.body;
      if (input.commentType !== undefined) patch.commentType = input.commentType;
      return runDrizzleMutationTransaction(async (tx) => {
        const [row] = await tx.update(commentsTable).set(patch).where(eq(commentsTable.id, id)).returning();
        return row ? mapRow(row) : null;
      });
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) return false;
      currentWriteOrganizationId(existing.organizationId);
      return runDrizzleMutationTransaction(async (tx) => {
        const res = await tx.delete(commentsTable).where(eq(commentsTable.id, id)).returning({ id: commentsTable.id });
        return res.length > 0;
      });
    },
  };
}

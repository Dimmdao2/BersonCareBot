import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
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
    authorId: row.authorId,
    targetType: row.targetType as CommentTargetType,
    targetId: row.targetId,
    commentType: row.commentType as CommentType,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgCommentsPort(): CommentsPort {
  return {
    async listByTarget(targetType: CommentTargetType, targetId: string): Promise<EntityComment[]> {
      const db = getDrizzle();
      const list = await db
        .select()
        .from(commentsTable)
        .where(and(eq(commentsTable.targetType, targetType), eq(commentsTable.targetId, targetId)))
        .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id));
      return list.map(mapRow);
    },

    async getById(id: string): Promise<EntityComment | null> {
      const db = getDrizzle();
      const [row] = await db.select().from(commentsTable).where(eq(commentsTable.id, id)).limit(1);
      return row ? mapRow(row) : null;
    },

    async create(input: CreateEntityCommentInput, authorId: string): Promise<EntityComment> {
      const db = getDrizzle();
      const [row] = await db
        .insert(commentsTable)
        .values({
          authorId,
          targetType: input.targetType,
          targetId: input.targetId,
          commentType: input.commentType,
          body: input.body,
        })
        .returning();
      if (!row) throw new Error("insert comment failed");
      return mapRow(row);
    },

    async update(id: string, input: UpdateEntityCommentInput): Promise<EntityComment | null> {
      const db = getDrizzle();
      const patch: Partial<typeof commentsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.body !== undefined) patch.body = input.body;
      if (input.commentType !== undefined) patch.commentType = input.commentType;
      const [row] = await db.update(commentsTable).set(patch).where(eq(commentsTable.id, id)).returning();
      return row ? mapRow(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const db = getDrizzle();
      const res = await db.delete(commentsTable).where(eq(commentsTable.id, id)).returning({ id: commentsTable.id });
      return res.length > 0;
    },
  };
}

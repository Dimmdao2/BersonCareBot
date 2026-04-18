import type { CommentsPort } from "@/modules/comments/ports";
import type {
  CreateEntityCommentInput,
  EntityComment,
  CommentTargetType,
  UpdateEntityCommentInput,
} from "@/modules/comments/types";

function isoNow(): string {
  return new Date().toISOString();
}

export function createInMemoryCommentsPort(): CommentsPort {
  const rows = new Map<string, EntityComment>();

  return {
    async listByTarget(targetType: CommentTargetType, targetId: string): Promise<EntityComment[]> {
      return [...rows.values()]
        .filter((r) => r.targetType === targetType && r.targetId === targetId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)));
    },

    async getById(id: string): Promise<EntityComment | null> {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },

    async create(input: CreateEntityCommentInput, authorId: string): Promise<EntityComment> {
      const id = crypto.randomUUID();
      const now = isoNow();
      const row: EntityComment = {
        id,
        authorId,
        targetType: input.targetType,
        targetId: input.targetId,
        commentType: input.commentType,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(id, row);
      return { ...row };
    },

    async update(id: string, input: UpdateEntityCommentInput): Promise<EntityComment | null> {
      const cur = rows.get(id);
      if (!cur) return null;
      const next: EntityComment = {
        ...cur,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.commentType !== undefined ? { commentType: input.commentType } : {}),
        updatedAt: isoNow(),
      };
      rows.set(id, next);
      return { ...next };
    },

    async delete(id: string): Promise<boolean> {
      return rows.delete(id);
    },
  };
}

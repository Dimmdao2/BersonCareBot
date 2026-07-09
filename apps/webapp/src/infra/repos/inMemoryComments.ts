import type { CommentsPort } from "@/modules/comments/ports";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import type {
  CreateEntityCommentInput,
  EntityComment,
  CommentTargetType,
  UpdateEntityCommentInput,
} from "@/modules/comments/types";

function isoNow(): string {
  return new Date().toISOString();
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

export function createInMemoryCommentsPort(): CommentsPort {
  const rows = new Map<string, EntityComment>();

  return {
    async listByTarget(targetType: CommentTargetType, targetId: string): Promise<EntityComment[]> {
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      return [...rows.values()]
        .filter(
          (r) =>
            r.targetType === targetType &&
            r.targetId === targetId &&
            (!principalOrganizationId || r.organizationId === principalOrganizationId),
        )
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
        organizationId: currentWriteOrganizationId(),
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
      const organizationId = currentWriteOrganizationId(cur.organizationId);
      const next: EntityComment = {
        ...cur,
        organizationId,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.commentType !== undefined ? { commentType: input.commentType } : {}),
        updatedAt: isoNow(),
      };
      rows.set(id, next);
      return { ...next };
    },

    async delete(id: string): Promise<boolean> {
      const cur = rows.get(id);
      if (!cur) return false;
      currentWriteOrganizationId(cur.organizationId);
      return rows.delete(id);
    },
  };
}

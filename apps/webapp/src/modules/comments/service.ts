import type { CommentsPort } from './ports';
import type { CreateEntityCommentInput, UpdateEntityCommentInput } from './types';
import { COMMENT_TARGET_TYPES, COMMENT_TYPES } from './types';
import { UserFacingError } from '@/shared/errors/userFacingError';
import { notificationText } from '@/shared/notifications/notificationText';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string): void {
  const t = id.trim();
  if (!UUID_RE.test(t)) throw new UserFacingError(notificationText.commonInvalidUuid);
}

function assertTargetType(t: string): asserts t is (typeof COMMENT_TARGET_TYPES)[number] {
  if (!COMMENT_TARGET_TYPES.includes(t as (typeof COMMENT_TARGET_TYPES)[number])) {
    // G2 (safety audit): was 'Неизвестный target_type комментария' — leaked the live column name
    // of the `comments` table to patients/doctors. Owner's rule: a doctor must never see an error
    // that names our schema. Collapsed with assertCommentType's case into one neutral key.
    throw new UserFacingError(notificationText.commentInvalidType);
  }
}

function assertCommentType(t: string): asserts t is (typeof COMMENT_TYPES)[number] {
  if (!COMMENT_TYPES.includes(t as (typeof COMMENT_TYPES)[number])) {
    throw new UserFacingError(notificationText.commentInvalidType);
  }
}

export function createCommentsService(port: CommentsPort) {
  return {
    async listByTarget(targetType: string, targetId: string) {
      assertTargetType(targetType);
      assertUuid(targetId);
      return port.listByTarget(targetType, targetId.trim());
    },

    async getById(id: string) {
      assertUuid(id);
      const row = await port.getById(id.trim());
      if (!row) throw new UserFacingError(notificationText.commentNotFound);
      return row;
    },

    async create(input: CreateEntityCommentInput, authorId: string) {
      assertTargetType(input.targetType);
      assertUuid(input.targetId);
      assertUuid(authorId);
      assertCommentType(input.commentType);
      const body = input.body?.trim() ?? '';
      if (!body) throw new UserFacingError(notificationText.commentTextEmpty);
      return port.create(
        {
          ...input,
          targetId: input.targetId.trim(),
          body,
        },
        authorId.trim(),
      );
    },

    async update(id: string, input: UpdateEntityCommentInput) {
      assertUuid(id);
      const patch: UpdateEntityCommentInput = { ...input };
      if (input.commentType !== undefined) {
        assertCommentType(input.commentType);
        patch.commentType = input.commentType;
      }
      if (input.body !== undefined) {
        const b = input.body.trim();
        if (!b) throw new UserFacingError(notificationText.commentTextEmpty);
        patch.body = b;
      }
      const row = await port.update(id.trim(), patch);
      if (!row) throw new UserFacingError(notificationText.commentNotFound);
      return row;
    },

    async delete(id: string) {
      assertUuid(id);
      const ok = await port.delete(id.trim());
      if (!ok) throw new UserFacingError(notificationText.commentNotFound);
    },
  };
}

export type CommentsService = ReturnType<typeof createCommentsService>;

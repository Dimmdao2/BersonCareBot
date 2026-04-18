/** Совпадает с CHECK в таблице `comments` — `SYSTEM_LOGIC_SCHEMA.md` § 7. */
export const COMMENT_TARGET_TYPES = [
  "exercise",
  "lfk_complex",
  "test",
  "test_set",
  "recommendation",
  "lesson",
  "stage_item_instance",
  "stage_instance",
  "program_instance",
] as const;

export const COMMENT_TYPES = ["template", "individual_override", "clinical_note"] as const;

export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

export type CommentType = (typeof COMMENT_TYPES)[number];

export type EntityComment = {
  id: string;
  authorId: string;
  targetType: CommentTargetType;
  targetId: string;
  commentType: CommentType;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateEntityCommentInput = {
  targetType: CommentTargetType;
  targetId: string;
  commentType: CommentType;
  body: string;
};

export type UpdateEntityCommentInput = {
  body?: string;
  commentType?: CommentType;
};

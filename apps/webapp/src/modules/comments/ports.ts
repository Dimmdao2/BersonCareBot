import type {
  CreateEntityCommentInput,
  EntityComment,
  CommentTargetType,
  UpdateEntityCommentInput,
} from "./types";

export type CommentsPort = {
  listByTarget(targetType: CommentTargetType, targetId: string): Promise<EntityComment[]>;
  getById(id: string): Promise<EntityComment | null>;
  create(input: CreateEntityCommentInput, authorId: string): Promise<EntityComment>;
  update(id: string, input: UpdateEntityCommentInput): Promise<EntityComment | null>;
  delete(id: string): Promise<boolean>;
};

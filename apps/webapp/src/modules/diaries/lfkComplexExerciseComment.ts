/**
 * B7: same semantics as `effectiveInstanceStageItemComment` — frozen template snapshot in `comment`,
 * optional per-instance override in `local_comment`.
 */
export function effectiveLfkComplexExerciseComment(row: {
  comment: string | null;
  localComment: string | null;
}): string | null {
  const local = row.localComment?.trim();
  if (local) return local;
  const c = row.comment?.trim();
  return c || null;
}

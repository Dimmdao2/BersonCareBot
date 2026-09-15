/** Strong identifier or policy conflict: callers may retry or route to manual review. */
export class MergeConflictError extends Error {
  readonly code = 'MergeConflictError' as const;
  readonly candidateIds: string[];
  constructor(message: string, candidateIds?: string[]) {
    super(message);
    this.name = 'MergeConflictError';
    this.candidateIds = candidateIds ?? [];
  }
}

/** Dependent data (bookings, assignments, overlap) cannot be auto-merged safely. */
export class MergeDependentConflictError extends Error {
  readonly code = 'MergeDependentConflictError' as const;
  readonly candidateIds: string[];
  readonly organizationId: string | null;
  readonly organizationIds: (string | null)[];
  readonly kind: 'medical_history' | 'merge_dependency';
  constructor(
    message: string,
    candidateIds?: string[],
    organizationId?: string | null,
    options?: {
      organizationIds?: (string | null)[];
      kind?: 'medical_history' | 'merge_dependency';
    },
  ) {
    super(message);
    this.name = 'MergeDependentConflictError';
    this.candidateIds = candidateIds ?? [];
    this.organizationId = organizationId ?? null;
    this.organizationIds = options?.organizationIds ?? [];
    this.kind = options?.kind ?? 'merge_dependency';
  }
}

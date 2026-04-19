/** Strong identifier or policy conflict: callers may retry or route to manual review. */
export class MergeConflictError extends Error {
  readonly code = "MergeConflictError" as const;
  readonly candidateIds: string[];
  constructor(message: string, candidateIds?: string[]) {
    super(message);
    this.name = "MergeConflictError";
    this.candidateIds = candidateIds ?? [];
  }
}

/** Dependent data (bookings, assignments, overlap) cannot be auto-merged safely. */
export class MergeDependentConflictError extends Error {
  readonly code = "MergeDependentConflictError" as const;
  readonly candidateIds: string[];
  constructor(message: string, candidateIds?: string[]) {
    super(message);
    this.name = "MergeDependentConflictError";
    this.candidateIds = candidateIds ?? [];
  }
}

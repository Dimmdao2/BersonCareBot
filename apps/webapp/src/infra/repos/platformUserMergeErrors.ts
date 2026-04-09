/** Strong identifier or policy conflict: callers may retry or route to manual review. */
export class MergeConflictError extends Error {
  readonly code = "MergeConflictError" as const;
  constructor(message: string) {
    super(message);
    this.name = "MergeConflictError";
  }
}

/** Dependent data (bookings, assignments, overlap) cannot be auto-merged safely. */
export class MergeDependentConflictError extends Error {
  readonly code = "MergeDependentConflictError" as const;
  constructor(message: string) {
    super(message);
    this.name = "MergeDependentConflictError";
  }
}

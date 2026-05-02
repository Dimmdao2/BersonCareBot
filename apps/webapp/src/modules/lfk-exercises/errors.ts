import type { ExerciseUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class UsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: ExerciseUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "UsageConfirmationRequiredError";
  }
}

export function isUsageConfirmationRequiredError(e: unknown): e is UsageConfirmationRequiredError {
  return e instanceof UsageConfirmationRequiredError;
}

/** Упражнение не найдено при архивации (нет строки или не удалось обновить). */
export class ExerciseArchiveNotFoundError extends Error {
  constructor(message = "Упражнение не найдено") {
    super(message);
    this.name = "ExerciseArchiveNotFoundError";
  }
}

export function isExerciseArchiveNotFoundError(e: unknown): e is ExerciseArchiveNotFoundError {
  return e instanceof ExerciseArchiveNotFoundError;
}

export class ExerciseArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Упражнение уже в архиве");
    this.name = "ExerciseArchiveAlreadyArchivedError";
  }
}

export function isExerciseArchiveAlreadyArchivedError(e: unknown): e is ExerciseArchiveAlreadyArchivedError {
  return e instanceof ExerciseArchiveAlreadyArchivedError;
}

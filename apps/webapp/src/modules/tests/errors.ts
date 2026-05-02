import type { ClinicalTestUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class ClinicalTestUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: ClinicalTestUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "ClinicalTestUsageConfirmationRequiredError";
  }
}

export function isClinicalTestUsageConfirmationRequiredError(
  e: unknown,
): e is ClinicalTestUsageConfirmationRequiredError {
  return e instanceof ClinicalTestUsageConfirmationRequiredError;
}

export class ClinicalTestArchiveNotFoundError extends Error {
  constructor(message = "Тест не найден") {
    super(message);
    this.name = "ClinicalTestArchiveNotFoundError";
  }
}

export function isClinicalTestArchiveNotFoundError(e: unknown): e is ClinicalTestArchiveNotFoundError {
  return e instanceof ClinicalTestArchiveNotFoundError;
}

export class ClinicalTestArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Тест уже в архиве");
    this.name = "ClinicalTestArchiveAlreadyArchivedError";
  }
}

export function isClinicalTestArchiveAlreadyArchivedError(e: unknown): e is ClinicalTestArchiveAlreadyArchivedError {
  return e instanceof ClinicalTestArchiveAlreadyArchivedError;
}

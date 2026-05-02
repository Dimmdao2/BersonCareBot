import type { TreatmentProgramTemplateUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class TreatmentProgramTemplateUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: TreatmentProgramTemplateUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "TreatmentProgramTemplateUsageConfirmationRequiredError";
  }
}

export function isTreatmentProgramTemplateUsageConfirmationRequiredError(
  e: unknown,
): e is TreatmentProgramTemplateUsageConfirmationRequiredError {
  return e instanceof TreatmentProgramTemplateUsageConfirmationRequiredError;
}

export class TreatmentProgramTemplateArchiveNotFoundError extends Error {
  constructor(message = "Шаблон программы не найден") {
    super(message);
    this.name = "TreatmentProgramTemplateArchiveNotFoundError";
  }
}

export function isTreatmentProgramTemplateArchiveNotFoundError(
  e: unknown,
): e is TreatmentProgramTemplateArchiveNotFoundError {
  return e instanceof TreatmentProgramTemplateArchiveNotFoundError;
}

export class TreatmentProgramTemplateAlreadyArchivedError extends Error {
  constructor() {
    super("Шаблон уже в архиве");
    this.name = "TreatmentProgramTemplateAlreadyArchivedError";
  }
}

export function isTreatmentProgramTemplateAlreadyArchivedError(
  e: unknown,
): e is TreatmentProgramTemplateAlreadyArchivedError {
  return e instanceof TreatmentProgramTemplateAlreadyArchivedError;
}

import type { LfkTemplateUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class LfkTemplateUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: LfkTemplateUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "LfkTemplateUsageConfirmationRequiredError";
  }
}

export function isLfkTemplateUsageConfirmationRequiredError(
  e: unknown,
): e is LfkTemplateUsageConfirmationRequiredError {
  return e instanceof LfkTemplateUsageConfirmationRequiredError;
}

export class TemplateArchiveNotFoundError extends Error {
  constructor(message = "Шаблон комплекса не найден") {
    super(message);
    this.name = "TemplateArchiveNotFoundError";
  }
}

export function isTemplateArchiveNotFoundError(e: unknown): e is TemplateArchiveNotFoundError {
  return e instanceof TemplateArchiveNotFoundError;
}

export class TemplateArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Комплекс уже в архиве");
    this.name = "TemplateArchiveAlreadyArchivedError";
  }
}

export function isTemplateArchiveAlreadyArchivedError(e: unknown): e is TemplateArchiveAlreadyArchivedError {
  return e instanceof TemplateArchiveAlreadyArchivedError;
}

export class TemplateUnarchiveNotArchivedError extends Error {
  constructor() {
    super("Комплекс не в архиве");
    this.name = "TemplateUnarchiveNotArchivedError";
  }
}

export function isTemplateUnarchiveNotArchivedError(e: unknown): e is TemplateUnarchiveNotArchivedError {
  return e instanceof TemplateUnarchiveNotArchivedError;
}

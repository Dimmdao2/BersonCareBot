import type { CourseUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class CourseUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: CourseUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "CourseUsageConfirmationRequiredError";
  }
}

export function isCourseUsageConfirmationRequiredError(e: unknown): e is CourseUsageConfirmationRequiredError {
  return e instanceof CourseUsageConfirmationRequiredError;
}

export class CourseArchiveNotFoundError extends Error {
  constructor(message = "Курс не найден") {
    super(message);
    this.name = "CourseArchiveNotFoundError";
  }
}

export function isCourseArchiveNotFoundError(e: unknown): e is CourseArchiveNotFoundError {
  return e instanceof CourseArchiveNotFoundError;
}

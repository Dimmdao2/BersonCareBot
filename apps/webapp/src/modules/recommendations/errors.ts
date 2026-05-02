import type { RecommendationUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class RecommendationUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: RecommendationUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "RecommendationUsageConfirmationRequiredError";
  }
}

export function isRecommendationUsageConfirmationRequiredError(
  e: unknown,
): e is RecommendationUsageConfirmationRequiredError {
  return e instanceof RecommendationUsageConfirmationRequiredError;
}

export class RecommendationArchiveNotFoundError extends Error {
  constructor(message = "Рекомендация не найдена") {
    super(message);
    this.name = "RecommendationArchiveNotFoundError";
  }
}

export function isRecommendationArchiveNotFoundError(e: unknown): e is RecommendationArchiveNotFoundError {
  return e instanceof RecommendationArchiveNotFoundError;
}

export class RecommendationArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Рекомендация уже в архиве");
    this.name = "RecommendationArchiveAlreadyArchivedError";
  }
}

export function isRecommendationArchiveAlreadyArchivedError(
  e: unknown,
): e is RecommendationArchiveAlreadyArchivedError {
  return e instanceof RecommendationArchiveAlreadyArchivedError;
}

export class RecommendationUnarchiveNotArchivedError extends Error {
  constructor() {
    super("Рекомендация не в архиве");
    this.name = "RecommendationUnarchiveNotArchivedError";
  }
}

export function isRecommendationUnarchiveNotArchivedError(
  e: unknown,
): e is RecommendationUnarchiveNotArchivedError {
  return e instanceof RecommendationUnarchiveNotArchivedError;
}
